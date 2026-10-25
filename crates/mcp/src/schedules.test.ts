import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchedules, scheduleSchema } from './schedules.js';
import type { McpServer } from '@modelcontextprotocol/server';

test('structured schedules validate timezone, day, action, time and wake window', () => {
  const base = { title: 'Briefing', timezone: 'Asia/Kolkata', timing: { type: 'daily', time: '08:00', weekdays: [1, 2, 3, 4, 5] }, action: { type: 'task', prompt: 'Stock market briefing', requires_live_sources: true } };
  assert.ok(scheduleSchema.safeParse(base).success);
  for (const patch of [ { timezone: 'Not/AZone' }, { timing: 'tomorrow at 2pm' }, { timing: { type: 'daily', time: '25:00' } }, { timing: { type: 'daily', time: '08:00', weekdays: [0] } }, { action: { type: 'shell', command: 'run' } }, { timing: { type: 'after_wake', time: '12:00', window_end: '06:00' } }, { extra: true } ]) {
    assert.equal(scheduleSchema.safeParse({ ...base, ...patch }).success, false);
  }
});
test('all schedule tools forward validated structured input to shared API', async () => {
  const tools = new Map<string, { config: any; handler: (input: any) => Promise<unknown> }>();
  const calls: unknown[] = [];
  registerSchedules({ registerTool(name: string, config: any, handler: any) { tools.set(name, { config, handler }); } } as unknown as McpServer, async (path, body) => { calls.push({ path, body }); return { content: [] }; });
  assert.equal(tools.size, 8);
  for (const op of ['pause', 'resume', 'cancel']) {
    const tool = tools.get(`${op}_schedule`)!;
    assert.equal(tool.config.inputSchema.safeParse({ schedule_id: 'one' }).success, false);
    const input = tool.config.inputSchema.parse({ schedule_id: 'one', expected_revision: 3 });
    await tool.handler(input);
    assert.deepEqual(calls.pop(), { path: `/v1/schedules/${op}`, body: input });
  }
  const create = tools.get('create_schedule')!;
  assert.equal(create.config.inputSchema.safeParse({ id: 'one', prompt: 'remind me tomorrow' }).success, false);
  const input = { id: 'resume', schedule: { title: 'Resume', timezone: 'Asia/Kolkata', timing: { type: 'once', local_at: '2026-10-26T14:00' }, action: { type: 'reminder', message: 'Send resume' } } };
  await create.handler(create.config.inputSchema.parse(input));
  assert.deepEqual(calls.pop(), { path: '/v1/schedules/create', body: input });
});
