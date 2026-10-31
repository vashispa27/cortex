import { useCallback, useEffect, useState } from 'react';
import { agentService, type AgentService, type BrowserStatus } from '../lib/agents';
import './browser-tab.css';

export function useBrowserStatus(service: AgentService = agentService, enabled = true) {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const refresh = useCallback(async () => {
    try { setStatus(await service.browserStatus()); }
    catch { setStatus(null); }
  }, [service]);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 2000);
    return () => window.clearInterval(timer);
  }, [refresh, enabled]);
  return { status, refresh };
}

/** One line on the Agents page: whether Chrome is connected, and how to connect it the first time. */
export function BrowserConnection({ service = agentService }: { service?: AgentService }) {
  const { status } = useBrowserStatus(service);
  if (status?.connected) return <p className="cx-hint agent-browser-line">Chrome connected{status.shared_tab ? ` · working in ${status.shared_tab.title || status.shared_tab.site}` : ''}</p>;
  return <p className="cx-hint agent-browser-line">To let agents use Chrome, load the extension once: open chrome://extensions, turn on Developer mode, choose Load unpacked and pick the apps/chrome-extension folder.</p>;
}

/** A chip naming the Chrome tab the agent will work in. Click to turn it on or off. */
export function BrowserTarget({ status, selected, onChange }: { status: BrowserStatus | null; selected: boolean; onChange: (use: boolean) => void }) {
  const tab = status?.current_tab;
  if (!tab) return null;
  return <button type="button" className={`agent-browser-chip${selected ? ' is-on' : ''}`} aria-pressed={selected} onClick={() => onChange(!selected)} title={tab.url}>
    {selected ? 'Using Chrome: ' : 'Use Chrome: '}{tab.title || tab.site}
  </button>;
}
