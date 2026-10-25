import { beforeEach, expect, it, vi } from 'vitest';
import { answerCortex } from './answer';
import { prepareAssistantRequest } from './api';
import { invoke } from '@tauri-apps/api/core';
import { memoryService } from './memories';
import { scheduleService } from './schedules';
import { routeIntent } from './intent';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./api', () => ({ prepareAssistantRequest: vi.fn() }));
vi.mock('./memories', () => ({ memoryService: { recall: vi.fn(), remember: vi.fn() } }));
vi.mock('./schedules', () => ({ scheduleService: { create: vi.fn() } }));
const context = { now: new Date('2026-10-25T07:00Z'), timezone: 'Asia/Kolkata' };
beforeEach(() => vi.resetAllMocks());

it('the chat entry point persists reminders before any model setup or memory retrieval', async () => {
  vi.mocked(scheduleService.create).mockImplementation(async (id, spec) => ({ ...spec, id, revision: 1, status: 'active', next_due_ms: 1, created_ms: 1, updated_ms: 1 }));
  const answer = await answerCortex('Remind me to send my resume tomorrow at 2pm', [], context);
  expect(answer.body).toContain('2026-10-26 at 14:00');
  expect(scheduleService.create).toHaveBeenCalledOnce();
  expect(memoryService.recall).not.toHaveBeenCalled();
  expect(prepareAssistantRequest).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it('the chat entry point saves explicit facts without model setup', async () => {
  vi.mocked(memoryService.recall).mockResolvedValue({ kind: 'personal_fact', items: [], total: 0, next_offset: null });
  vi.mocked(memoryService.remember).mockImplementation(async input => ({ ...input, kind: 'personal_fact', id: 'f1', key: '', revision: 1, created_ms: 1, updated_ms: 1 }));
  const result = await answerCortex('Remember Rajesh’s phone number is 213132', [], context);
  expect(result.body).toContain('Saved:');
  expect(memoryService.remember).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Rajesh', attribute: 'phone', value: '213132' }));
  expect(prepareAssistantRequest).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it('restores the immediately preceding clarification from chat history', async () => {
  const decision = routeIntent('Remind me to call tomorrow at 2', context);
  if (decision.type !== 'clarify') throw Error('Expected clarification');
  vi.mocked(scheduleService.create).mockImplementation(async (id, spec) => ({ ...spec, id, revision: 1, status: 'active', next_due_ms: 1, created_ms: 1, updated_ms: 1 }));
  await answerCortex('2pm', [{ role: 'assistant', body: decision.question, pendingIntent: decision.pending }]);
  expect(scheduleService.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timing: { type: 'once', local_at: '2026-10-26T14:00' } }));
  expect(invoke).not.toHaveBeenCalled();
});

it('the chat entry point propagates failed persistence without a success response', async () => {
  vi.mocked(scheduleService.create).mockRejectedValue(new Error('Schedule backend unavailable'));
  await expect(answerCortex('Remind me to call tomorrow at 2pm', [], context)).rejects.toThrow('Schedule backend unavailable');
  expect(prepareAssistantRequest).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it('keeps a contradictory recurring request out of the model and persists the resolved draft', async () => {
  vi.mocked(scheduleService.create).mockImplementation(async (id, spec) => ({ ...spec, id, revision: 1, status: 'active', next_due_ms: 1, created_ms: 1, updated_ms: 1 }));
  const clarification = await answerCortex('every morning at 11 pm remind me to read nes', [], context);
  expect(clarification.intent).toBe('clarify');
  expect(clarification.body).toContain('AM');
  expect(scheduleService.create).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  const result = await answerCortex('11pm', [{ role: 'assistant', body: clarification.body, pendingIntent: clarification.pendingIntent }]);
  expect(scheduleService.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timing: { type: 'daily', time: '23:00' }, action: { type: 'reminder', message: 'read nes' } }));
  expect(result.body).toContain('Daily at 23:00');
  expect(prepareAssistantRequest).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it('preserves the known dinner time across a date-only clarification in chat history', async () => {
  vi.mocked(scheduleService.create).mockImplementation(async (id, spec) => ({ ...spec, id, revision: 1, status: 'active', next_due_ms: 1, created_ms: 1, updated_ms: 1 }));
  const clarification = await answerCortex('remind me to eat dinner at 11pm', [], context);
  if (!clarification.pendingIntent) throw Error('Expected pending reminder');
  await answerCortex('today', [{ role: 'assistant', body: clarification.body, pendingIntent: clarification.pendingIntent }], context);
  expect(scheduleService.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ title: 'eat dinner', timing: { type: 'once', local_at: '2026-10-25T23:00' } }));
  expect(invoke).not.toHaveBeenCalled();
});

it('persists the reported typoed email shorthand through chat without invoking a model', async () => {
  vi.mocked(memoryService.recall).mockResolvedValue({ kind: 'personal_fact', items: [], total: 0, next_offset: null });
  vi.mocked(memoryService.remember).mockImplementation(async input => ({ ...input, kind: 'personal_fact', id: 'email', key: '', revision: 1, created_ms: 1, updated_ms: 1 }));
  const result = await answerCortex('remember my emial 27abhinav10@gmail.coim', [], context);
  expect(memoryService.remember).toHaveBeenCalledWith(expect.objectContaining({ subject: 'self', attribute: 'email', value: '27abhinav10@gmail.coim' }));
  expect(result.body).toContain('27abhinav10@gmail.coim');
  expect(result.body).toContain('Saved:');
  expect(prepareAssistantRequest).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled();
});
