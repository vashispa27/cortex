import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { answerCortex } from './answer';
import { memoryService } from './memories';
import { scheduleService } from './schedules';
import { defaultLayers, defaultPreferences } from './storage';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./api', () => ({ prepareAssistantRequest: vi.fn() }));
vi.mock('./memories', () => ({ memoryService: { recall: vi.fn(), remember: vi.fn(), search: vi.fn(), update: vi.fn() } }));
vi.mock('./schedules', () => ({ scheduleService: { create: vi.fn(), list: vi.fn(), get: vi.fn() } }));

const context = { now: new Date('2026-10-25T07:00Z'), timezone: 'Asia/Kolkata' };
const message = 'remind me to call mom on Sunday at 10am';
const stored = (changes: Record<string, unknown> = {}) => vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...defaultPreferences, layers: defaultLayers(), openrouterModel: 'a/haiku', ...changes }), setItem: () => {}, removeItem: () => {} });
const decisionCalls = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === 'decide_intent');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(scheduleService.create).mockImplementation(async (id, spec) => ({ ...spec, id, revision: 1, status: 'active', next_due_ms: 1, next_due_local: '2026-11-01T10:00', created_ms: 1, updated_ms: 1 }));
  vi.mocked(scheduleService.list).mockResolvedValue({ items: [], total: 0, next_offset: null });
  vi.mocked(memoryService.search).mockResolvedValue({ kind: 'personal_fact', items: [{ id: 'f1', kind: 'personal_fact', key: '', subject: 'Rajesh', attribute: 'phone', value: '213132', source: '', channel: 'chat', revision: 1, created_ms: 1, updated_ms: 1 }], total: 1, next_offset: null });
});
afterEach(() => vi.unstubAllGlobals());

it('a flexible phrasing goes to the local routing model and is written through the schedule service', async () => {
  stored({ localModel: 'gemma-local', routingAdapter: '/adapters/routing' });
  vi.mocked(invoke).mockImplementation(async () => ({ action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2026-11-01T10:00' } }));
  const answer = await answerCortex(message, [], context);
  expect(answer.body).toContain('Reminder saved: Call mom');
  expect(scheduleService.create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timezone: 'Asia/Kolkata', timing: { type: 'once', local_at: '2026-11-01T10:00' } }));
  const [, args] = decisionCalls()[0] as [string, { model: string; endpoint: string | null; adapter: string | null; context: string; message: string; tool: { function: { name: string } } }];
  expect(args).toMatchObject({ model: 'gemma-local', endpoint: 'http://127.0.0.1:8080/v1', adapter: '/adapters/routing', message, tool: { function: { name: 'decide' } } });
  // The model sees fact keys only, never the saved value.
  expect(args.context).toContain('"attribute":"phone"');
  expect(args.context).not.toContain('213132');
  expect(answer.actions).toEqual([{ kind: 'undo_schedule', label: 'Undo', scheduleId: expect.any(String) }]);
});

it('with no local model set up, nothing is called and the regex router answers', async () => {
  stored({ localOnly: true });
  const answer = await answerCortex(message, [], context);
  expect(invoke).not.toHaveBeenCalled();
  expect(scheduleService.list).not.toHaveBeenCalled();
  expect(memoryService.search).not.toHaveBeenCalled();
  expect(scheduleService.create).not.toHaveBeenCalled();
  expect(answer.body).toContain('On which date should I remind you?');
});

it('the layer switched off behaves the same', async () => {
  stored({ decideEnabled: false });
  await answerCortex(message, [], context);
  expect(invoke).not.toHaveBeenCalled();
});

it('a failing or garbled decision call falls back to the regex router and writes nothing', async () => {
  stored();
  for (const failure of [() => Promise.reject('HTTP 500'), () => Promise.resolve('Done! I created your reminder.'), () => Promise.resolve({ action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2020-01-01T10:00' } })]) {
    vi.mocked(invoke).mockImplementation(async (command: string) => command === 'openrouter_has_key' ? true : failure());
    const answer = await answerCortex(message, [], context);
    expect(scheduleService.create).not.toHaveBeenCalled();
    expect(answer.body).toMatch(/On which date should I remind you|already passed/);
  }
});

it('a message with no write hint skips the model entirely', async () => {
  stored();
  const { prepareAssistantRequest } = await import('./api');
  vi.mocked(prepareAssistantRequest).mockRejectedValue(new Error('stop here'));
  await expect(answerCortex('Find the accessibility checklist', [], context)).rejects.toBeDefined();
  expect(decisionCalls()).toHaveLength(0);
});
