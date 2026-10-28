import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const id = z.string().trim().min(1).max(100);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdays = z.array(z.number().int().min(1).max(7)).max(7).optional();
export const timingSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('once'), local_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/) }),
  z.strictObject({ type: z.literal('daily'), time, weekdays }),
  z.strictObject({ type: z.literal('after_wake'), time, window_end: time, weekdays }).refine(v => v.window_end > v.time, 'window_end must be after time'),
  z.strictObject({ type: z.literal('monthly'), day: z.number().int().refine(d => d === -1 || (d >= 1 && d <= 31), 'day must be 1..31, or -1 for the last day'), time }),
  z.strictObject({
    type: z.literal('interval'), every_minutes: z.number().int().min(15).max(525_600),
    start_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/), window_start: time.optional(), window_end: time.optional(), weekdays,
  }).refine(v => (v.window_start === undefined) === (v.window_end === undefined), 'window_start and window_end go together')
    .refine(v => v.window_start === undefined || v.window_end! > v.window_start, 'window_end must be after window_start; windows cannot cross midnight'),
]);
export const scheduleSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  timezone: z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Use an IANA timezone'),
  timing: timingSchema,
  action: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('reminder'), message: z.string().trim().min(1).max(12_000) }),
    z.strictObject({ type: z.literal('task'), prompt: z.string().trim().min(1).max(12_000), requires_live_sources: z.boolean().optional() }),
  ]),
});
const mutation = { schedule_id: id, expected_revision: z.number().int().positive() };
const page = { offset: z.number().int().nonnegative().max(1_000_000).optional(), limit: z.number().int().min(1).max(100).optional() };
type Call = (path: string, body?: unknown) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>;
export function registerSchedules(server: McpServer, call: Call) {
  const register = <T extends z.ZodRawShape>(name: string, operation: string, description: string, shape: T) => {
    server.registerTool(name, { description, inputSchema: z.strictObject(shape) }, input => call(`/v1/schedules/${operation}`, input));
  };
  register('create_schedule', 'create', 'Create a persistent reminder or answer-generating task. Supply a stable unique id for safe retries, an explicit IANA timezone, and structured timing; do not send natural language timing. Once uses local_at YYYY-MM-DDTHH:MM (ambiguous/nonexistent DST times rejected). Daily uses HH:MM and optional ISO weekdays 1=Monday..7=Sunday; it is also the weekly form (every Sunday 10:00 = {"type":"daily","time":"10:00","weekdays":[7]}, weekdays 9am = {"type":"daily","time":"09:00","weekdays":[1,2,3,4,5]}). Monthly is {"type":"monthly","day":1,"time":"09:00"}: day 1..31 or -1 for the last day, and a day a short month lacks (31 in February) clamps to that month\'s last day. Interval is {"type":"interval","every_minutes":120,"start_local":"2026-10-26T09:00","window_start":"09:00","window_end":"21:00","weekdays":[1,2,3,4,5]}: every N minutes (minimum 15) counted from start_local, optionally limited to a same-day window (cannot cross midnight) and weekdays; choose start_local as the first fire time. After a sleep or restart a missed recurrence fires once, never as a backlog. after_wake fires once per eligible local day on activity within [time,window_end). Tasks require a configured provider; current briefings require live search and citations. Desktop notifications require a running Cortex engine and OS permission.', { id, schedule: scheduleSchema });
  register('list_schedules', 'list', 'List persisted upcoming, paused, completed and cancelled schedules. Responses include revisions, timezone and next_due_ms (wake eligibility time, not a guaranteed execution time).', { ...page, status: z.enum(['active', 'paused', 'cancelled', 'completed']).optional() });
  register('get_schedule', 'get', 'Read a schedule and its latest revision before editing.', { schedule_id: id });
  register('update_schedule', 'update', 'Replace a schedule specification using its latest revision. Recomputes future occurrence; an in-flight external call may already have started. Cancelled schedules are terminal.', { ...mutation, schedule: scheduleSchema });
  register('pause_schedule', 'pause', 'Pause an active schedule. Paused daily occurrences are skipped. An elapsed one-time reminder catches up when resumed.', mutation);
  register('resume_schedule', 'resume', 'Resume a paused schedule using its latest revision. Daily schedules start at the next future local time. Wake schedules wait for a new activity event, possibly within the current window.', mutation);
  register('snooze_schedule', 'snooze', 'Delay a schedule\'s next fire to now + minutes (1..1440) using its latest revision, without changing its specification. Re-arms a one-time reminder that already fired. A recurring schedule cannot be snoozed past its own next occurrence. After-wake schedules cannot snooze. Returns the schedule with the new next_due_ms.', { ...mutation, minutes: z.number().int().min(1).max(1440) });
  register('cancel_schedule', 'cancel', 'Permanently cancel future occurrences; preserve history. An external delivery already started cannot be recalled.', mutation);
  register('get_schedule_history', 'history', 'Read paginated execution history including answer text and sources, provider failures, notification submission status, and interrupted/uncertain runs. No automatic replay of uncertain deliveries.', { ...page, schedule_id: id.optional() });
}
