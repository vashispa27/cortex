import { describe, expect, it } from 'vitest';
import { createScheduleService, formatScheduleTime, type Schedule, type ScheduleSpec } from './schedules';
describe('shared scheduling service', () => {
  it('routes all operations through the shared backend and passes revision guards', async () => {
    const calls: unknown[] = [];
    const service = createScheduleService(async <T>(operation: string, body: unknown) => { calls.push({ operation, body }); return {} as T; });
    const spec: ScheduleSpec = { title: 'Resume', timezone: 'Asia/Kolkata', timing: { type: 'once', local_at: '2026-10-26T14:00' }, action: { type: 'reminder', message: 'Send resume' } };
    const schedule = { ...spec, id: 'resume', revision: 7 } as Schedule;
    await service.create('resume', spec); await service.update(schedule, spec);
    await service.pause(schedule); await service.resume(schedule); await service.cancel(schedule);
    await service.list({ status: 'active' }); await service.get('resume'); await service.history({ schedule_id: 'resume', offset: 50 });
    expect(calls).toEqual([
      { operation: 'create', body: { id: 'resume', schedule: spec } },
      { operation: 'update', body: { schedule_id: 'resume', expected_revision: 7, schedule: spec } },
      ...['pause', 'resume', 'cancel'].map(operation => ({ operation, body: { schedule_id: 'resume', expected_revision: 7 } })),
      { operation: 'list', body: { status: 'active' } }, { operation: 'get', body: { schedule_id: 'resume' } },
      { operation: 'history', body: { schedule_id: 'resume', offset: 50 } },
    ]);
  });
  it('renders schedule timezone independently of machine timezone', () => {
    const text = formatScheduleTime(Date.parse('2026-10-26T08:30:00Z'), 'Asia/Kolkata');
    expect(text).toMatch(/(2:00|14:00)/); expect(formatScheduleTime(null, 'UTC')).toBe('—');
  });
});
