const status=document.querySelector('#status'), stop=document.querySelector('#stop');
async function send(message) {
  const result=await chrome.runtime.sendMessage(message);
  if (result.error) {status.textContent=result.error;return;}
  stop.hidden=!result.shared;
  status.textContent=result.shared ? `Cortex is working in “${result.shared.title || result.shared.url}”.`
    : result.connected ? 'Connected to Cortex. Ask the agent in Cortex to work on the tab you are looking at.'
    : 'Cortex is not running. Start Cortex and its agent service; this connects on its own.';
}
stop.onclick=() => send({action:'stop'});
void send({action:'connect'}).then(() => setTimeout(() => send({action:'status'}),500));
