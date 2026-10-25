import { localRequest } from './api';
export type ScheduleTiming =
  | { type: 'once'; local_at: string }
  | { type: 'daily'; time: string; weekdays?: number[] }
  | { type: 'after_wake'; time: string; window_end: string; weekdays?: number[] }
  /** day 1..31, or -1 for the last day; days a short month lacks clamp to its last day. */
  | { type: 'monthly'; day: number; time: string }
  /** Every `every_minutes` (>= 15) from `start_local`, optionally inside a same-day window. */
  | { type: 'interval'; every_minutes: number; start_local: string; window_start?: string; window_end?: string; weekdays?: number[] };
export type ScheduleAction = { type: 'reminder'; message: string } | { type: 'task'; prompt: string; requires_live_sources?: boolean };
export interface ScheduleSpec { title: string; timezone: string; timing: ScheduleTiming; action: ScheduleAction }
export interface Schedule extends ScheduleSpec {
  id: string; revision: number; status: 'active' | 'paused' | 'completed' | 'cancelled';
  next_due_ms: number | null; /** Next fire as YYYY-MM-DDTHH:MM in `timezone`; computed by the API, never stored. */ next_due_local?: string | null; created_ms: number; updated_ms: number;
}
export interface ScheduleRun {
  id: string; schedule_id: string; due_ms: number; started_ms: number; finished_ms: number | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled';
  output: string; error: string | null; delivery_status: 'pending' | 'attempted' | 'submitted' | 'failed'; schedule: Schedule;
}
export interface SchedulePage<T> { items: T[]; total: number; next_offset: number | null }
export interface ScheduleService {
  create(id: string, schedule: ScheduleSpec): Promise<Schedule>;
  get(id: string): Promise<Schedule>;
  list(options?: { status?: Schedule['status']; offset?: number; limit?: number }): Promise<SchedulePage<Schedule>>;
  update(schedule: Schedule, spec: ScheduleSpec): Promise<Schedule>;
  pause(schedule: Schedule): Promise<Schedule>;
  resume(schedule: Schedule): Promise<Schedule>;
  cancel(schedule: Schedule): Promise<Schedule>;
  /** Delay the next fire by `minutes` (1..1440) from now without changing the specification. */
  snooze(schedule: Schedule, minutes: number): Promise<Schedule>;
  history(options?: { schedule_id?: string; offset?: number; limit?: number }): Promise<SchedulePage<ScheduleRun>>;
}
export type ScheduleTransport = <T>(operation: string, body: unknown) => Promise<T>;
export function createScheduleService(request: ScheduleTransport = (operation, body) => localRequest('POST', `/v1/schedules/${operation}`, body)): ScheduleService {
  const mutate = (op: string, schedule: Schedule, rest = {}) => request<Schedule>(op, { schedule_id: schedule.id, expected_revision: schedule.revision, ...rest });
  return {
    create: (id, schedule) => request('create', { id, schedule }),
    get: schedule_id => request('get', { schedule_id }),
    list: (options = {}) => request('list', options),
    update: (schedule, spec) => mutate('update', schedule, { schedule: spec }),
    pause: schedule => mutate('pause', schedule), resume: schedule => mutate('resume', schedule), cancel: schedule => mutate('cancel', schedule),
    snooze: (schedule, minutes) => mutate('snooze', schedule, { minutes }),
    history: (options = {}) => request('history', options),
  };
}
export const scheduleService = createScheduleService();
export function formatScheduleTime(ms: number | null, timezone: string): string {
  return ms === null ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(ms);
}
