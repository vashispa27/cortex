// Cortex drives the tab you are on with Browser Use. This extension is only the pipe: it tells Cortex
// which tab is active, attaches Chrome's debugger to it when a job claims it, and relays Chrome
// DevTools Protocol commands and events between that tab and Cortex.
let shared = null, socket = null, current = null;
const emit = data => {if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));};

async function stop() {
  const old=shared;
  shared=null;
  // The connection to Cortex stays open; only this tab is released.
  if (!old) return;
  emit({type:'unshared'});
  await chrome.debugger.detach({tabId:old.tab_id}).catch(() => {});
  await chrome.tabs.ungroup(old.tab_id).catch(() => {});
  await chrome.action.setBadgeText({tabId:old.tab_id,text:''}).catch(() => {});
}

async function share(tabId) {
  if (shared?.tab_id === tabId) return;
  if (shared) await stop();
  const tab=await chrome.tabs.get(tabId);
  if (!/^https?:\/\//.test(tab.url)) throw new Error('Open a web page first.');
  await chrome.debugger.attach({tabId},'1.3');
  shared={id:crypto.randomUUID(),browser_instance:'',tab_id:tabId,url:tab.url,title:tab.title};
  const groupId=await chrome.tabs.group({tabIds:[tabId]}).catch(() => null);
  if (groupId !== null) await chrome.tabGroups.update(groupId,{title:'Cortex',color:'blue'}).catch(() => {});
  await chrome.action.setBadgeText({tabId,text:'ON'}).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({tabId,color:'#2563eb'}).catch(() => {});
}

async function relay(message) {
  if (!shared) return {error:{message:'No tab is attached.'}};
  try {
    const target=message.sessionId ? {tabId:shared.tab_id,sessionId:message.sessionId} : {tabId:shared.tab_id};
    return {result:await chrome.debugger.sendCommand(target,message.method,message.params || {}) || {}};
  } catch (error) {return {error:{message:error.message}};}
}

chrome.debugger.onEvent.addListener((source,method,params) => {
  if (source.tabId === shared?.tab_id) emit({type:'event',method,params,sessionId:source.sessionId || null});
});
chrome.debugger.onDetach.addListener(source => {if (source.tabId===shared?.tab_id) void stop();});
chrome.tabs.onRemoved.addListener(tabId => {if (tabId===shared?.tab_id) void stop();});

// Cortex sees which tab you are on, so a job can use it.
async function reportCurrent() {
  const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true}).catch(() => []);
  current=tab && /^https?:\/\//.test(tab.url || '') ? {tab_id:tab.id,url:tab.url,title:tab.title || ''} : null;
  emit({type:'current',tab:current});
  if (shared && tab?.id === shared.tab_id) emit({type:'tab',tab:{tab_id:tab.id,url:tab.url,title:tab.title || ''}});
}

let connecting = false;
async function connect() {
  if (connecting) return;
  connecting=true;
  // Cortex's agent service listens on this Mac only, port 8790 (tests store another port).
  const {managerPort=8790}=await chrome.storage.local.get('managerPort').finally(() => {connecting=false;});
  const url=`ws://127.0.0.1:${managerPort}/v1/browser/extension`;
  if (socket && socket.readyState <= WebSocket.OPEN && socket.url===url) return;
  const old=socket;
  const next=new WebSocket(url);
  socket=next;
  old?.close();
  next.onopen=() => void reportCurrent();
  next.onclose=() => {if (socket===next) {socket=null;void stop();}};
  next.onmessage=async ({data}) => {
    let message;
    try {message=JSON.parse(data);} catch {return;}
    if (message.type==='claim') {
      try {await share(message.tab_id);emit({type:'claimed',id:message.id,tab:shared});}
      catch (error) {emit({type:'claimed',id:message.id,error:error.message});}
    } else if (message.type==='stop') await stop();
    else if (message.type==='command') emit({type:'result',id:message.id,...await relay(message)});
  };
}
chrome.tabs.onActivated.addListener(() => void reportCurrent());
chrome.tabs.onUpdated.addListener((tabId,change,tab) => {if (tab.active && (change.url || change.title)) void reportCurrent();});
chrome.windows.onFocusChanged.addListener(windowId => {if (windowId!==chrome.windows.WINDOW_ID_NONE) void reportCurrent();});
// Reconnect when Cortex starts later; the ping keeps the service worker awake while connected.
chrome.alarms.create('cortex-connect',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(() => void connect());
setInterval(() => emit({type:'ping'}),20000);
chrome.runtime.onStartup.addListener(() => void connect());
chrome.runtime.onInstalled.addListener(() => void connect());
void connect();
chrome.runtime.onMessage.addListener((message,sender,respond) => {
  if (sender.id!==chrome.runtime.id) return;
  (async () => {
    if (message.action==='stop') await stop();
    else if (message.action==='connect') await connect();
    return {connected:socket?.readyState===WebSocket.OPEN,shared:shared ? {title:shared.title,url:shared.url} : null};
  })().then(respond,error => respond({error:error.message}));
  return true;
});
