// Fixed code installed only by the extension in an isolated execution world.
// Never accepts script, selector, CDP, coordinates or key presses from upstream.
export function installGuard() {
  if (globalThis.__cortexGuard) return;
  const nonce=() => [...crypto.getRandomValues(new Uint32Array(4))].map(x => x.toString(16).padStart(8,'0')).join('');
  const state = {documentNonce:nonce(),revision: 0, snapshot: null, refs: new Map(), paused: false,
    userFields: new WeakSet(), consumed: new Set()};
  const bounded = (value, length = 200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, length);
  const name = el => bounded(el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') ||
    [...(el.labels || [])].map(label => label.textContent).join(' ') || el.getAttribute('alt') ||
    (el.tagName === 'INPUT' && ['submit','button'].includes(el.type) ? el.value : ['BUTTON', 'A'].includes(el.tagName) || el.getAttribute('role') === 'button' ? el.textContent : '') || el.getAttribute('title') || el.name || el.id);
  const sensitive = el => el.type === 'password' || /(?:password|one-time-code|cc-|bank|transaction-)/i.test(el.autocomplete || '') ||
    /(?:password|passcode|one[\s_-]*time|\botp\b|card|cc[\s_-]*(?:number|num|no)|cvv|cvc|expir|\bexp\b|exp[\s_-]*(?:month|year|date)|iban|bank|account[\s_-]*(?:number|no)|routing|sort[\s_-]*code|ssn|social[\s_-]*security|aadhaar|aadhar|(?:\bpan\b|pan[\s_-]*(?:number|no|id))|passport|tax[\s_-]*id|government[\s_-]*id)/i.test([el.name, el.id, name(el)].join(' '));
  const visible = el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    for (let parent=el; parent; parent=parent.parentElement) {
      if (Number(getComputedStyle(parent).opacity) === 0) return false;
    }
    return el.isConnected && rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none' && !el.closest('[hidden],[inert],[aria-hidden="true"]');
  };
  const enabled = el => getComputedStyle(el).pointerEvents !== 'none' && !el.disabled && !el.matches(':disabled') && el.getAttribute('aria-disabled') !== 'true' && !el.readOnly;
  const role = el => el.getAttribute('role') || ({BUTTON:'button',A:'link',SELECT:'combobox',TEXTAREA:'textbox',IFRAME:'iframe'}[el.tagName]) ||
    (el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox');
  const path = el => {
    const result = [];
    while (el && el !== document.documentElement) {
      result.unshift(`${el.tagName}:${[...(el.parentElement?.children || [])].indexOf(el)}`);
      el = el.parentElement;
    }
    return result.join('/');
  };
  const fingerprint = el => JSON.stringify({role:role(el),name:name(el),position:path(el),
    form:el.form ? {position:path(el.form),action:el.form.action,method:el.form.method} : null,
    href:el.getAttribute('href'),target:el.getAttribute('target'),type:el.type || ''});
  const elements = () => [...document.querySelectorAll('input,textarea,select,button,a[href],[role="button"],[role="checkbox"],[contenteditable="true"],iframe')].filter(visible).slice(0,200);
  const fieldValue = el => sensitive(el) ? (state.userFields.has(el) ? 'filled by you' : '[private: fill in tab]') :
    el.type === 'checkbox' || el.type === 'radio' ? !!el.checked : bounded(el.value ?? el.textContent,1000);
  const values = () => elements().filter(el => ['INPUT','TEXTAREA','SELECT'].includes(el.tagName) || el.isContentEditable)
    .map(el => ({label:name(el),value:sensitive(el) ? fieldValue(el) : hashValue(el)}));
  // Sensitive values are never read: trusted input increments revision, binding approval to manual edits.
  const allFields = () => [...document.querySelectorAll('input,textarea,select,[contenteditable="true"]')];
  const hashValue = el => sensitive(el) ? fieldValue(el) : el.type === 'checkbox' || el.type === 'radio' ? !!el.checked : String(el.value ?? el.textContent);
  const pageState = () => JSON.stringify({document:state.documentNonce,url:location.href,revision:state.revision,
    fields:allFields().map(el => [fingerprint(el),hashValue(el)])});

  const notify = reason => {
    if (state.paused) {
      if (reason === 'user_takeover') globalThis.__cortexNotify?.(JSON.stringify({reason}));
      return;
    }
    state.paused = true;
    state.snapshot = null;
    globalThis.__cortexNotify?.(JSON.stringify({reason}));
  };
  new MutationObserver(() => {state.revision++;}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  document.addEventListener('submit', event => {
    if (state.paused) return;
    if (!globalThis.__cortexFinalWindow || Date.now() > globalThis.__cortexFinalWindow) {
      event.preventDefault(); event.stopImmediatePropagation(); notify('unexpected_form_submission');
    }
  },true);
  // Not 'scroll': pages scroll themselves (carousels, smooth scrolling) and the browser marks that trusted too.
  for (const event of ['pointerdown','keydown','wheel','input','change']) {
    document.addEventListener(event, e => {
      if (event === 'input' || event === 'change') {
        state.revision++;
        if (e.isTrusted && e.target instanceof Element) state.userFields.add(e.target);
      }
      if (!e.isTrusted) return;
      notify('user_takeover');
    },true);
  }
  const snapshot = async () => {
    state.refs.clear();
    let items = elements().map((el,index) => {
      const ref = `e${index+1}`;
      state.refs.set(ref,{element:el,fingerprint:fingerprint(el)});
      return {ref,fingerprint:fingerprint(el),role:role(el),name:name(el),label:name(el),input_type:el.type || '',
        required:!!el.required,enabled:enabled(el),sensitive:sensitive(el),value:fieldValue(el),
        options:el.tagName === 'SELECT' ? [...el.options].slice(0,80).map(o => ({value:bounded(o.value,500),label:bounded(o.label,500)})) : undefined};
    });
    // Keep the observation below 128 KiB, including UTF-8 labels and select options.
    let remaining=110000;
    items=items.filter(item => {
      const size=new TextEncoder().encode(JSON.stringify(item)).length;
      if (size>remaining) {state.refs.delete(item.ref);return false;}
      remaining-=size;return true;
    });
    // Walk visible text nodes; never read form values, textarea text, script or hidden instructions.
    const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let text = '', node;
    while (!allFields().some(sensitive) && (node=walker.nextNode()) && text.length < 6000) {
      const parent = node.parentElement;
      if (!parent || parent.closest('input,textarea,select,script,style,noscript,[contenteditable="true"]') || !visible(parent)) continue;
      text += ' ' + bounded(node.textContent,500);
    }
    const raw = pageState();
    const id = nonce();
    state.snapshot = {id,raw};
    const login = /(?:sign[ -]?in|log[ -]?in|verify (?:it.?s )?you|captcha|security challenge)/i.test(document.title+' '+(document.querySelector('h1')?.textContent || '')+' '+location.pathname) ||
      !!document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],input[autocomplete="one-time-code"]');
    return {status:'ok',_state:raw,has_private_fields:allFields().some(sensitive),snapshot_id:id,url:location.href.slice(0,2000),title:bounded(document.title,300),untrusted_content:true,
      elements:items,text:bounded(text,2000),needs_user:login ? 'login_or_verification' : location.href.length > 2000 ? 'url_too_long_handle_manually' : [...document.querySelectorAll('iframe')].some(visible) ? 'embedded_frame_handle_manually' : [...document.querySelectorAll('*')].some(el => el.shadowRoot && visible(el)) ? 'shadow_dom_handle_manually' : allFields().length > 500 || raw.length > 262144 ? 'page_too_large_handle_manually' : null};
  };
  const finalNames = /(?:submit|send|pay|place[ -]?order|buy|book|confirm|delete|remove|apply|post|publish|accept|agree|sign|finish|complete)/i;
  const run = async (action,grant) => {
    globalThis.__cortexFinalWindow=0;
    if (action.action === 'snapshot') return snapshot();
    if (state.paused) return {status:'paused',reason:'user_takeover'};
    const previous = state.snapshot;
    if (!previous || !previous.hash || previous.id !== action.snapshot_id || previous.raw !== pageState()) return {status:'stale_snapshot'};
    const found = action.ref ? state.refs.get(action.ref) : null;
    const el = found?.element;
    if (action.ref && (!el || !visible(el) || !enabled(el) || fingerprint(el) !== found.fingerprint)) return {status:'stale_element'};
    const label = el ? name(el) : action.action;
    if (el && (sensitive(el) || el.type === 'file' || el.tagName === 'IFRAME')) return {status:'needs_user',label,reason:'manual_field'};
    if (['type','select','set_checked'].includes(action.action) && !['INPUT','TEXTAREA','SELECT'].includes(el?.tagName) && !el?.isContentEditable) return {status:'unsafe_action',label};
    if (action.action === 'type' && /[\r\n\u2028\u2029]/.test(action.text)) return {status:'unsafe_action',label,reason:'no_enter_or_newlines'};
    if (action.action === 'click') {
      if (['checkbox','radio'].includes(role(el)) && /(?:accept|agree|terms|consent|sign)/i.test(name(el))) return {status:'needs_user',label,reason:'accept_terms_manually'};
      if (allFields().some(field => sensitive(field))) return {status:'needs_user',label,reason:'private_form_submit_manually'};
      if (el.tagName === 'A' && (el.hasAttribute('download') || /\.(?:pdf|zip|exe|dmg|docx?|xlsx?)(?:[?#]|$)/i.test(el.href))) return {status:'needs_user',label,reason:'downloads_are_manual'};
      if (el.tagName === 'A' && el.target && el.target !== '_self') return {status:'needs_user',label,reason:'share_new_tab_manually'};
      // Every click whose effects cannot be established is final. This intentionally includes
      // vague buttons and JavaScript handlers, including "Next" buttons, in v1.
      const manifest = {url:location.href,action:'click',label,reason:el.form || finalNames.test(label) ? 'final_action' : 'unknown_click_effects',fingerprint:fingerprint(el),values_hash:previous.hash,entered_values:values()};
      if (el.tagName === 'A' && /^https?:/.test(el.href)) manifest.destination=el.href;
      if (pageState() !== previous.raw) return {status:'stale_snapshot'};
      if (!grant) return {status:'approval_required',proposal:manifest};
      if (state.consumed.has(grant.id) || grant.expires_at < Date.now() ||
        ['url','fingerprint','values_hash'].some(key => grant[key] !== manifest[key])) return {status:'stale_approval',label};
      state.consumed.add(grant.id);
      globalThis.__cortexFinalWindow = Date.now()+1500;
      el.click();
    } else if (action.action === 'type') {
      if (!['text','email','tel','url','search','number',''].includes(el.type || '') && el.tagName !== 'TEXTAREA' && !el.isContentEditable) return {status:'needs_user',label};
      const text = (action.clear === false ? (el.value ?? el.textContent) : '') + action.text;
      if (el.isContentEditable) el.textContent=text;
      else {
        const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,text);
      }
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    } else if (action.action === 'select') {
      if (el.tagName !== 'SELECT') return {status:'unsafe_action',label};
      const option = [...el.options].find(o => o.value === action.option || o.label === action.option);
      if (!option || option.disabled) return {status:'invalid_option',label};
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,option.value);
      el.dispatchEvent(new Event('change',{bubbles:true}));
    } else if (action.action === 'set_checked') {
      if (!['checkbox','radio'].includes(el.type)) return {status:'unsafe_action',label};
      if (/(?:accept|agree|terms|consent|sign)/i.test(name(el))) return {status:'needs_user',label,reason:'accept_terms_manually'};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set.call(el,action.checked);
      el.dispatchEvent(new Event('change',{bubbles:true}));
    } else if (action.action === 'scroll') {
      if (el) el.scrollIntoView({block:'center'});
      else window.scrollBy({top:(action.direction === 'up' ? -1 : 1)*innerHeight*.7,behavior:'instant'});
    } else if (action.action === 'wait') {
      const initial = state.revision;
      const deadline = Date.now()+action.milliseconds;
      while (state.revision === initial && Date.now() < deadline && !state.paused) await new Promise(resolve => setTimeout(resolve,50));
    } else if (action.action === 'navigate' || action.action === 'back') {
      return {status:'navigate_ready',url:action.url,label,values_hash:previous.hash,entered_values:values()}; // Background validates site and performs fixed navigation.
    } else return {status:'unsafe_action'};
    state.snapshot=null;
    return {status:'ok',label};
  };
  const seal=(id,hash) => {
    if (state.paused || !state.snapshot || state.snapshot.id !== id || state.snapshot.raw !== pageState()) {state.snapshot=null;return false;}
    state.snapshot.hash=hash;return true;
  };
  globalThis.__cortexGuard={run,seal,resume:() => {state.paused=false;state.snapshot=null;},pause:() => {state.paused=true;state.snapshot=null;globalThis.__cortexFinalWindow=0;},snapshot};
}
