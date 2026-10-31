import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserTarget } from './BrowserTabControls';
import { describeEvent, type AgentEvent } from '../lib/agents';

it('names the current Chrome tab and shows whether the agent will use it', () => {
  expect(renderToStaticMarkup(<BrowserTarget status={null} selected={false} onChange={() => {}} />)).toBe('');
  const status = { connected: true, current_tab: { tab_id: 4, title: 'Application', site: 'example.com', url: 'https://example.com' }, shared_tab: null };
  expect(renderToStaticMarkup(<BrowserTarget status={status} selected={false} onChange={() => {}} />)).toContain('Use Chrome: Application');
  const on = renderToStaticMarkup(<BrowserTarget status={status} selected onChange={() => {}} />);
  expect(on).toContain('Using Chrome: Application');
  expect(on).toContain('aria-pressed="true"');
});

it('shows readable browser actions without typed values', () => {
  const event = { id: 1, created_at: '2026-10-30T00:00:00Z', event_type: 'browser_action', payload: { action: 'type', label: 'Email', outcome: 'ok' } } as AgentEvent;
  expect(describeEvent(event)).toBe('Typed into Email');
  expect(describeEvent({ ...event, payload: { reason: 'user_takeover' }, event_type: 'browser_paused' })).toBe('Browser paused: user takeover');
});
