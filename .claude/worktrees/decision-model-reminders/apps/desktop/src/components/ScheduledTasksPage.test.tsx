import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduledTasksPage, cadence } from './ScheduledTasksPage';
import type { ScheduleService } from '../lib/schedules';

const idle = new Promise<never>(() => {});
const service = { list: () => idle, history: () => idle } as unknown as ScheduleService;

it('opens on the reminder list with a create button instead of an inline form', () => {
  const html = renderToStaticMarkup(<ScheduledTasksPage service={service} />);
  expect(html).toContain('New reminder');
  expect(html).toContain('aria-label="Reminder view"');
  expect(html).not.toContain('<form');
});

it('describes cadence in plain words', () => {
  expect(cadence({ type: 'once', local_at: '2026-10-26T09:00' })).toBe('One time');
  expect(cadence({ type: 'daily', time: '08:00', weekdays: [5, 1] })).toBe('Mon, Fri at 08:00');
  expect(cadence({ type: 'after_wake', time: '06:00', window_end: '12:00' })).toBe('After waking, 06:00–12:00 · Every day');
});
