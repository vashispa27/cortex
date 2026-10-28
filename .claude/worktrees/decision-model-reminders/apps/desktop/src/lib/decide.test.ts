import { describe, expect, it, vi } from 'vitest';
import { ambiguousHour, buildContext, DECIDE_SYSTEM_PROMPT, DECIDE_TOOL, decide, isDiscussion, mayWrite, resolveDecision, resolveTimezone, type DecideCall, type DecisionContext } from './decide';
import { decideWrite, type DecisionDeps } from './decision-flow';
import { executeIntent, routeIntent, type Intent, type IntentServices, type RoutingContext } from './intent';
import type { PersonalFact } from './memories';
import type { Schedule } from './schedules';
import { defaultLayers, defaultPreferences, type Preferences } from './storage';

// Sunday 2026-10-25 12:30 in Kolkata.
const now = new Date('2026-10-25T07:00:00Z');
const timezone = 'Asia/Kolkata';
const routing: RoutingContext = { now, timezone };
const rent: Schedule = { id: 's-rent', revision: 2, status: 'active', title: 'Pay rent', timezone, timing: { type: 'monthly', day: 1, time: '09:00' }, action: { type: 'reminder', message: 'Pay rent' }, next_due_ms: 1, next_due_local: '2026-11-01T09:00', created_ms: 1, updated_ms: 1 };
const water: Schedule = { ...rent, id: 's-water', title: 'Drink water', timing: { type: 'interval', every_minutes: 120, start_local: '2026-10-25T09:00', window_start: '09:00', window_end: '21:00' }, action: { type: 'reminder', message: 'Drink water' } };
const standup: Schedule = { ...rent, id: 's-standup', title: 'Check standup notes', timing: { type: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, action: { type: 'reminder', message: 'Check standup notes' } };
const rajesh: PersonalFact = { id: 'f-1', kind: 'personal_fact', key: '["rajesh","phone"]', subject: 'Rajesh', attribute: 'phone', value: '213132', source: 'Explicit request', channel: 'chat', revision: 4, created_ms: 1, updated_ms: 2 };
const ctx = (extra: Partial<DecisionContext> = {}): DecisionContext => ({ now, timezone, schedules: [rent, water, standup], facts: [{ subject: 'Rajesh', attribute: 'phone' }], recent: [], ...extra });

const preferences = (changes: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, layers: defaultLayers(), openrouterModel: 'a/haiku', ...changes });
function deps(call: DecideCall, changes: Partial<Preferences> = {}, local = false): DecisionDeps & { listed: ReturnType<typeof vi.fn> } {
  const listed = vi.fn().mockResolvedValue({ items: [rent, water, standup], total: 3, next_offset: null });
  return {
    preferences: preferences(changes), target: { model: 'a/haiku', endpoint: null, local },
    schedules: { list: listed } as never, memories: { search: vi.fn().mockResolvedValue({ items: [rajesh], total: 1, next_offset: null, kind: 'personal_fact' }) } as never,
    ready: vi.fn().mockResolvedValue(undefined), call: () => call, listed,
  };
}
function services(): IntentServices & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockImplementation(async (id, spec) => ({ ...spec, id, revision: 1, status: 'active', next_due_ms: 1, next_due_local: '2026-10-26T10:00', created_ms: 1, updated_ms: 1 }));
  return {
    memories: { recall: vi.fn().mockResolvedValue({ items: [rajesh], next_offset: null, total: 1, kind: 'personal_fact' }), remember: vi.fn().mockImplementation(async input => ({ ...rajesh, ...input, id: 'f-new', revision: 1 })), update: vi.fn().mockResolvedValue(rajesh), search: vi.fn(), delete: vi.fn().mockResolvedValue({ id: 'f-new', deleted: true, deleted_ms: 1 }) },
    schedules: { create, get: vi.fn().mockImplementation(async id => [rent, water, standup].find(s => s.id === id)), list: vi.fn().mockResolvedValue({ items: [rent, water, standup], total: 3, next_offset: null }), update: vi.fn().mockImplementation(async (_s, spec) => ({ ...rent, ...spec })), pause: vi.fn().mockResolvedValue({ ...water, status: 'paused' }), resume: vi.fn(), cancel: vi.fn().mockImplementation(async s => ({ ...s, status: 'cancelled' })), snooze: vi.fn().mockImplementation(async s => ({ ...s, next_due_local: '2026-10-25T12:40' })), history: vi.fn() },
    answer: vi.fn().mockResolvedValue({ body: 'general answer', hits: [], retrieved: [], searchQuery: '', source: 'general', timings: { rewrite: 0, prepare: 0, model: 0 } }), newId: () => 'req-1', create,
  };
}
/** A fake provider keyed by the user's message, standing in for the cloud model. */
const fake = (table: Record<string, unknown>): DecideCall & ReturnType<typeof vi.fn> => vi.fn(async ({ message }: { message: string }) => { if (!(message in table)) throw new Error(`unexpected message: ${message}`); return table[message]; }) as never;
const run = (message: string, call: DecideCall, pending?: RoutingContext['pending'], d = deps(call)) => decideWrite(message, [], { ...routing, pending }, routeIntent(message, { ...routing, pending }), d);

describe('pre-gate', () => {
  it.each([
    'remind me to call mom on Sunday at 10', 'every weekday at 9am remind me to check standup notes', 'remind me in 45 minutes to take the laundry out',
    'remind me on the 1st of every month to pay rent', 'every 2 hours remind me to drink water', 'next Friday 3pm: dentist',
    'don’t forget, I have a call with Roop tomorrow at 5', 'move my rent reminder to the 5th', 'pause the water reminder', 'cancel standup reminder',
    'what reminders do I have?', 'remember that my passport number is X', 'Rajesh’s phone is 213132', 'my wife’s birthday is 14 March', 'actually Rajesh’s phone is 99999',
    'snooze the water reminder for 10 minutes', 'save this: the wifi password is hunter2', 'note that Priya moved to Pune',
  ])('lets %j through to the model', text => expect(mayWrite(text)).toBe(true));
  it.each(['What did I read yesterday?', 'Find the accessibility checklist', 'Define latency', 'Explain how transformers work', 'What is Rajesh’s phone number?'])('skips %j without a model call', text => {
    // “yesterday” is not a future-time word; the rest have no write verb or time phrase.
    expect(mayWrite(text)).toBe(false);
  });
  it.each([
    'how do I set a reminder?', 'she said “remind me tomorrow”', 'She told me to remind her to call', 'if I said remember my PIN is 1234, would you store it?',
    '"Remind me to call mom tomorrow at 2pm"', 'For example, remind me to call mom', 'suppose I say remember my email is a@b.c',
  ])('vetoes %j as discussion', text => expect(isDiscussion(text)).toBe(true));
  it.each(['don’t forget, I have a call with Roop tomorrow at 5', 'Remember that Rajesh told me his phone is 213132', 'remind me to ask what she said about the review at 4pm'])('does not veto the real request %j', text => expect(isDiscussion(text)).toBe(false));
});

describe('ambiguous hours are asked about, never guessed', () => {
  it.each(['call with Roop tomorrow at 5', 'remind me to call mom on Sunday at 10', 'meeting @ 3', 'dentist friday 3:30'])('%j is ambiguous', t => expect(ambiguousHour(t)).toBe(true));
  it.each(['call at 5pm', 'at 5 in the evening', 'at 09:30', 'at 17:00', 'every 2 hours', 'in 45 minutes', 'on the 5th', 'at noon', 'at 5 a.m.', 'every weekday at 9am'])('%j is not', t => expect(ambiguousHour(t)).toBe(false));
});

describe('validation turns bad output into a question, never a write', () => {
  const create = (extra: Record<string, unknown>) => ({ action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2026-10-26T10:00' }, ...extra });
  const resolve = (raw: unknown, message = 'remind me to call mom tomorrow at 10am', c = ctx()) => resolveDecision(raw, c, message);
  it('maps a good reminder to a schedule_create with the context timezone', () => {
    expect(resolve(create({}))).toEqual({ type: 'schedule_create', spec: { title: 'Call mom', timezone, timing: { type: 'once', local_at: '2026-10-26T10:00' }, action: { type: 'reminder', message: 'Call mom' } } });
  });
  it('rejects a one-off time in the past', () => {
    expect(resolve(create({ timing: { type: 'once', local_at: '2026-10-25T09:00' } }))).toMatchObject({ type: 'clarify', question: expect.stringContaining('already passed') });
    expect(resolve(create({ timing: { type: 'once', local_at: '2026-10-25T12:30' } }))).toMatchObject({ type: 'clarify' });
  });
  it('rejects impossible dates and malformed timings', () => {
    for (const timing of [{ type: 'once', local_at: '2026-02-30T10:00' }, { type: 'once', local_at: 'tomorrow' }, { type: 'daily', time: '25:00' }, { type: 'daily', time: '09:00', weekdays: [0] }, { type: 'monthly', day: 32, time: '09:00' }, { type: 'weekly' }, 'tomorrow at 2pm', undefined]) {
      expect(resolve(create({ timing })), JSON.stringify(timing)).toMatchObject({ type: 'clarify' });
    }
  });
  it('maps timezone abbreviations in code and rejects unknown zones', () => {
    expect(resolveTimezone('IST', 'UTC')).toBe('Asia/Kolkata');
    expect(resolveTimezone('pst', 'UTC')).toBe('America/Los_Angeles');
    expect(resolveTimezone(undefined, 'Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(resolveTimezone('Mars/Base', 'UTC')).toBeUndefined();
    expect(resolve(create({ timezone: 'IST' }))).toMatchObject({ type: 'schedule_create', spec: { timezone: 'Asia/Kolkata' } });
    expect(resolve(create({ timezone: 'Mars/Base' }))).toMatchObject({ type: 'clarify', question: expect.stringContaining('timezone') });
  });
  it('asks instead of guessing a bare hour, even when the model resolved it', () => {
    expect(resolve(create({ message: 'Call with Roop', timing: { type: 'once', local_at: '2026-10-26T17:00' } }), 'don’t forget, I have a call with Roop tomorrow at 5')).toMatchObject({ type: 'clarify', question: 'Is that time am or pm?' });
    expect(resolve(create({ timing: { type: 'once', local_at: '2026-10-26T17:00' } }), 'call Roop tomorrow at 5pm')).toMatchObject({ type: 'schedule_create' });
  });
  it('rejects empty messages and unknown schedule ids', () => {
    expect(resolve(create({ message: '   ' }))).toMatchObject({ type: 'clarify', question: 'What should the reminder say?' });
    expect(resolve({ action: 'cancel_schedule', schedule_id: 'nope' })).toMatchObject({ type: 'clarify', question: expect.stringContaining('Which reminder') });
    expect(resolve({ action: 'pause_schedule' })).toMatchObject({ type: 'clarify' });
    expect(resolve({ action: 'pause_schedule', schedule_id: 's-water' })).toEqual({ type: 'schedule_manage', operation: 'pause', selector: 's-water' });
  });
  it('enforces interval rules: 15-minute floor, same-day windows, defaults', () => {
    const interval = (timing: Record<string, unknown>) => resolve({ action: 'create_reminder', message: 'Drink water', timing: { type: 'interval', ...timing } }, 'every 2 hours remind me to drink water');
    expect(interval({ every_minutes: 10 })).toMatchObject({ type: 'clarify' });
    expect(interval({ every_minutes: 60, window_start: '22:00', window_end: '06:00' })).toMatchObject({ type: 'clarify' });
    expect(interval({ every_minutes: 60, window_start: '09:00' })).toMatchObject({ type: 'clarify' });
    // No start given: first fire one interval from now; with a window the grid opens at the window start.
    expect(interval({ every_minutes: 120 })).toMatchObject({ type: 'schedule_create', spec: { timing: { type: 'interval', every_minutes: 120, start_local: '2026-10-25T14:30' } } });
    expect(interval({ every_minutes: 120, window_start: '09:00', window_end: '21:00' })).toMatchObject({ spec: { timing: { start_local: '2026-10-25T09:00', window_start: '09:00', window_end: '21:00' } } });
  });
  it('only saves a fact value that appears in what the user typed', () => {
    const fact = (value: string) => ({ action: 'remember_fact', subject: 'Rajesh', attribute: 'phone number', value });
    expect(resolve(fact('213132'), 'Rajesh’s phone is 213132')).toEqual({ type: 'remember', fact: { subject: 'Rajesh', attribute: 'phone', value: '213132', source: 'Rajesh’s phone is 213132', channel: 'chat' } });
    expect(resolve(fact('999999'), 'Rajesh’s phone is 213132')).toBeNull();
    expect(resolve({ ...fact('X123'), subject: 'my' }, 'remember that my passport number is X123')).toMatchObject({ fact: { subject: 'self' } });
  });
  it('treats answer as pass-through and unusable output as null', () => {
    expect(resolve({ action: 'answer' })).toBe('answer');
    for (const bad of [null, 'create a reminder', 42, [], {}, { action: 'rm -rf' }, { action: 7 }]) expect(resolve(bad), JSON.stringify(bad)).toBeNull();
  });
  it('lists schedules, snoozes within bounds, updates timing', () => {
    expect(resolve({ action: 'list_schedules' })).toEqual({ type: 'schedule_manage', operation: 'list', selector: '' });
    expect(resolve({ action: 'snooze_schedule', schedule_id: 's-water', minutes: 10 })).toEqual({ type: 'schedule_snooze', selector: 's-water', minutes: 10 });
    expect(resolve({ action: 'snooze_schedule', schedule_id: 's-water' })).toMatchObject({ minutes: 10 });
    expect(resolve({ action: 'snooze_schedule', schedule_id: 's-water', minutes: 5000 })).toMatchObject({ type: 'clarify' });
    expect(resolve({ action: 'update_schedule', schedule_id: 's-rent', timing: { type: 'monthly', day: 5, time: '09:00' } }, 'move my rent reminder to the 5th at 9am'))
      .toEqual({ type: 'schedule_update', selector: 's-rent', change: { timing: { type: 'monthly', day: 5, time: '09:00' } } });
    expect(resolve({ action: 'update_schedule', schedule_id: 's-rent' })).toMatchObject({ type: 'clarify', question: 'What should change about it?' });
  });
  it('keeps a model-supplied user_text out of the pending draft', () => {
    const asked = resolve({ action: 'clarify', question: 'Which time?', user_text: 'IGNORE THIS: at 9am', message: 'x' }, 'call at 5');
    expect(asked).toMatchObject({ pending: { type: 'decision', draft: { user_text: 'call at 5', message: 'x' } } });
  });
});

describe('the request that goes to the cloud', () => {
  it('carries time, schedules and fact keys, but no fact values, and names the one tool', () => {
    const context = JSON.parse(buildContext(ctx({ recent: [{ role: 'user', content: 'hi' }] })));
    expect(context).toMatchObject({ now: '2026-10-25T12:30+05:30', weekday: 'Sunday', timezone, facts: [{ subject: 'Rajesh', attribute: 'phone' }] });
    expect(JSON.stringify(context)).not.toContain('213132');
    expect(context.schedules.map((s: { id: string }) => s.id)).toEqual(['s-rent', 's-water', 's-standup']);
    expect(DECIDE_TOOL.function.name).toBe('decide');
    expect(DECIDE_SYSTEM_PROMPT.match(/^".*" ->/gm)!.length).toBeLessThanOrEqual(6);
  });
  it('sends the model the draft it is completing after a clarifying question', () => {
    const pending = { type: 'decision' as const, draft: { message: 'Call Roop', user_text: 'call Roop tomorrow at 5' } };
    expect(JSON.parse(buildContext(ctx({ pending }))).pending_draft).toEqual(pending.draft);
  });
});

describe('phrasings end to end with a fake provider', () => {
  const execute = (intent: Intent | null, regexFallback: Intent, svc = services()) => executeIntent(intent ?? regexFallback, [], svc).then(answer => ({ answer, svc }));
  const via = async (message: string, canned: unknown, svc = services()) => {
    const call = fake({ [message]: canned });
    const intent = await run(message, call);
    const regex = routeIntent(message, routing);
    return { call, intent, ...(await execute(intent, regex, svc)) };
  };

  it('remind me to call mom on Sunday at 10 asks am/pm, then the reply completes it', async () => {
    const first = 'remind me to call mom on Sunday at 10';
    const asked = await via(first, { action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2026-11-01T10:00' } });
    expect(asked.answer.body).toBe('Is that time am or pm?');
    expect(asked.svc.create).not.toHaveBeenCalled();
    expect(asked.answer.pendingIntent).toMatchObject({ type: 'decision', draft: { message: 'Call mom', user_text: first } });
    const reply = await via('10am', { action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2026-11-01T10:00' } }, services()).catch(() => null);
    // The reply goes through the same call with the pending draft in context.
    const call = fake({ '10am': { action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2026-11-01T10:00' } } });
    const intent = await run('10am', call, asked.answer.pendingIntent);
    expect(call).toHaveBeenCalledOnce();
    expect(JSON.parse((call.mock.calls[0][0] as { context: string }).context).pending_draft.message).toBe('Call mom');
    expect(intent).toMatchObject({ type: 'schedule_create', spec: { action: { message: 'Call mom' }, timing: { local_at: '2026-11-01T10:00' } } });
    expect(reply).not.toBeNull();
  });

  it('weekday recurrence is parsed by the regex router with no model call', async () => {
    const message = 'every weekday at 9am remind me to check standup notes';
    const call = fake({});
    expect(await run(message, call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
    expect(routeIntent(message, routing)).toMatchObject({ type: 'schedule_create', spec: { timing: { type: 'daily', time: '09:00', weekdays: [1, 2, 3, 4, 5] } } });
  });

  it('relative minutes become a concrete one-off time with Undo', async () => {
    const { answer, svc, intent } = await via('remind me in 45 minutes to take the laundry out', { action: 'create_reminder', message: 'Take the laundry out', timing: { type: 'once', local_at: '2026-10-25T13:15' } });
    expect(intent).toMatchObject({ type: 'schedule_create' });
    expect(svc.create).toHaveBeenCalledWith('req-1', expect.objectContaining({ timezone, timing: { type: 'once', local_at: '2026-10-25T13:15' } }));
    expect(answer.body).toContain('Reminder saved: Take the laundry out');
    expect(answer.actions).toEqual([{ kind: 'undo_schedule', label: 'Undo', scheduleId: 'req-1' }]);
  });

  it('monthly: the 1st of every month needs a time, then saves', async () => {
    const message = 'remind me on the 1st of every month to pay rent';
    const asked = await via(message, { action: 'clarify', question: 'What time on the 1st?', message: 'Pay rent', timing: { type: 'monthly', day: 1 } });
    expect(asked.answer.body).toBe('What time on the 1st?');
    const done = await via('remind me on the 1st of every month to pay rent at 9am', { action: 'create_reminder', message: 'Pay rent', timing: { type: 'monthly', day: 1, time: '09:00' } });
    expect(done.answer.body).toContain('the 1st of every month at 09:00');
  });

  it('interval with a window: every 2 hours between 9 and 21', async () => {
    const message = 'every 2 hours remind me to drink water between 09:00 and 21:00';
    const { svc, intent } = await via(message, { action: 'create_reminder', message: 'Drink water', timing: { type: 'interval', every_minutes: 120, window_start: '09:00', window_end: '21:00' } });
    expect(intent).toMatchObject({ type: 'schedule_create' });
    expect(svc.create).toHaveBeenCalledWith('req-1', expect.objectContaining({ timing: { type: 'interval', every_minutes: 120, start_local: '2026-10-25T09:00', window_start: '09:00', window_end: '21:00' } }));
  });

  it('next Friday 3pm: dentist', async () => {
    const { svc } = await via('next Friday 3pm: dentist', { action: 'create_reminder', message: 'Dentist', timing: { type: 'once', local_at: '2026-10-30T15:00' } });
    expect(svc.create).toHaveBeenCalledWith('req-1', expect.objectContaining({ timing: { type: 'once', local_at: '2026-10-30T15:00' }, action: { type: 'reminder', message: 'Dentist' } }));
  });

  it('Roop at 5: asks am or pm even though the model picked 17:00', async () => {
    const { answer, svc } = await via('don’t forget, I have a call with Roop tomorrow at 5', { action: 'create_reminder', message: 'Call with Roop', timing: { type: 'once', local_at: '2026-10-26T17:00' } });
    expect(answer.body).toBe('Is that time am or pm?');
    expect(svc.create).not.toHaveBeenCalled();
  });

  it('moving a recurring reminder asks first, then updates only on confirm', async () => {
    const { answer, svc } = await via('move my rent reminder to the 5th', { action: 'update_schedule', schedule_id: 's-rent', timing: { type: 'monthly', day: 5, time: '09:00' } });
    expect(answer.body).toContain('Change “Pay rent” from the 1st of every month at 09:00 to the 5th of every month at 09:00?');
    expect(svc.schedules.update).not.toHaveBeenCalled();
    expect(answer.actions?.map(a => a.kind)).toEqual(['confirm', 'dismiss']);
    await executeIntent(routeIntent('yes', { ...routing, pending: answer.pendingIntent }), [], svc);
    expect(svc.schedules.update).toHaveBeenCalledWith(rent, expect.objectContaining({ title: 'Pay rent', timing: { type: 'monthly', day: 5, time: '09:00' } }));
  });

  it('pause by fuzzy name resolves to an id; cancel asks first', async () => {
    const paused = await via('pause the water reminder', { action: 'pause_schedule', schedule_id: 's-water' });
    expect(paused.svc.schedules.pause).toHaveBeenCalledWith(water);
    const cancel = await via('cancel standup reminder', { action: 'cancel_schedule', schedule_id: 's-standup' });
    expect(cancel.svc.schedules.cancel).not.toHaveBeenCalled();
    expect(cancel.answer.body).toContain('Cancel “Check standup notes” (every weekday at 09:00)?');
    await executeIntent(routeIntent('yes', { ...routing, pending: cancel.answer.pendingIntent }), [], cancel.svc);
    expect(cancel.svc.schedules.cancel).toHaveBeenCalledWith(standup);
  });

  it('listing reminders is handled by the regex router', async () => {
    const call = fake({});
    expect(await run('what reminders do I have?', call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it('snoozes by id', async () => {
    const { answer, svc } = await via('snooze the water reminder for 10 minutes', { action: 'snooze_schedule', schedule_id: 's-water', minutes: 10 });
    expect(svc.schedules.snooze).toHaveBeenCalledWith(water, 10);
    expect(answer.body).toContain('Snoozed: Drink water');
  });

  it('saves facts: regex for the verb form, the model for bare statements', async () => {
    const call = fake({ 'my wife’s birthday is 14 March': { action: 'remember_fact', subject: 'wife', attribute: 'birthday', value: '14 March' } });
    expect(await run('remember that my passport number is X123', call)).toBeNull();
    expect(routeIntent('remember that my passport number is X123', routing)).toMatchObject({ type: 'remember', fact: { subject: 'self', attribute: 'passport number', value: 'X123' } });
    const { svc, answer } = await via('my wife’s birthday is 14 March', { action: 'remember_fact', subject: 'wife', attribute: 'birthday', value: '14 March' });
    expect(svc.memories.remember).toHaveBeenCalledWith(expect.objectContaining({ subject: 'wife', attribute: 'birthday', value: '14 March', channel: 'chat' }));
    expect(answer.actions).toEqual([{ kind: 'undo_fact', label: 'Undo', factId: 'f-new', revision: 1 }]);
  });

  it('actually Rajesh’s phone is 99999 asks before overwriting, then updates on confirm', async () => {
    const { answer, svc } = await via('actually Rajesh’s phone is 99999', { action: 'update_fact', subject: 'Rajesh', attribute: 'phone', value: '99999' });
    expect(svc.memories.update).not.toHaveBeenCalled();
    expect(answer.body).toContain('Replace it with “99999”?');
    await executeIntent(routeIntent('yes', { ...routing, pending: answer.pendingIntent }), [], svc);
    expect(svc.memories.update).toHaveBeenCalledWith(rajesh, expect.objectContaining({ value: '99999' }));
  });

  it.each(['how do I set a reminder?', 'she said “remind me tomorrow”', 'if I said remember my PIN is 1234, would you store it?'])('negative %j never reaches the model or writes', async message => {
    const call = fake({});
    expect(await run(message, call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
    const svc = services();
    await executeIntent(routeIntent(message, routing), [], svc);
    expect(svc.create).not.toHaveBeenCalled();
    expect(svc.memories.remember).not.toHaveBeenCalled();
    expect(svc.memories.update).not.toHaveBeenCalled();
  });

  it('a model that answers for a write-looking message falls through to the normal answer path', async () => {
    const message = 'remind me what the plan was';
    const call = fake({ [message]: { action: 'answer' } });
    const intent = await run(message, call);
    expect(call).toHaveBeenCalledOnce();
    expect(intent === null || intent.type === 'mixed').toBe(true);
  });

  it('a model that writes for a message the user never made is not trusted for facts', async () => {
    const message = 'Rajesh’s phone is 213132';
    const { intent } = await via(message, { action: 'remember_fact', subject: 'Rajesh', attribute: 'phone', value: '555000' });
    expect(intent).toBeNull();
  });
});

describe('fallback to the regex router', () => {
  const message = 'remind me to call mom on Sunday at 10am';
  const good = { action: 'create_reminder', message: 'Call mom', timing: { type: 'once', local_at: '2026-11-01T10:00' } };
  it('uses the model when everything is on', async () => {
    const call = fake({ [message]: good });
    expect(await run(message, call)).toMatchObject({ type: 'schedule_create' });
    expect(call).toHaveBeenCalledOnce();
  });
  it('never calls the cloud in local-only mode, with the layer off, on a local target or in sample mode', async () => {
    for (const [changes, local] of [[{ localOnly: true }, true], [{ decideEnabled: false }, false], [{}, true], [{ sampleMode: true }, false]] as const) {
      const call = fake({ [message]: good });
      const d = deps(call, changes, local);
      expect(await decideWrite(message, [], routing, routeIntent(message, routing), d)).toBeNull();
      expect(call).not.toHaveBeenCalled();
      expect(d.ready).not.toHaveBeenCalled();
      expect(d.listed).not.toHaveBeenCalled();
    }
  });
  it('falls back when the call fails, returns prose, or returns invalid JSON', async () => {
    for (const result of [() => Promise.reject(new Error('HTTP 500')), () => Promise.resolve('Sure, reminder set!'), () => Promise.resolve('{not json'), () => Promise.resolve({ action: 'delete_everything' }), () => Promise.resolve(null)]) {
      expect(await run(message, vi.fn(result))).toBeNull();
    }
  });
  it('falls back when the call times out', async () => {
    vi.useFakeTimers();
    try {
      const pending = decide(message, ctx(), () => new Promise(() => {}), 50);
      await vi.advanceTimersByTimeAsync(1_100);
      expect(await pending).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('falls back when the provider is not set up or local data cannot be read', async () => {
    const call = fake({ [message]: good });
    const notReady = deps(call); notReady.ready = vi.fn().mockRejectedValue(new Error('Add your OpenRouter API key'));
    expect(await decideWrite(message, [], routing, routeIntent(message, routing), notReady)).toBeNull();
    const broken = deps(call); broken.listed.mockRejectedValue(new Error('engine offline'));
    expect(await decideWrite(message, [], routing, routeIntent(message, routing), broken)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
  it('leaves regex-owned drafts and yes/no replies to the regex router', async () => {
    const call = fake({});
    expect(await run('11pm', call, { type: 'schedule', draft: { message: 'read news', timezone, daily: true } })).toBeNull();
    expect(await run('yes', call, { type: 'confirm', summary: 'x', intent: { type: 'schedule_manage', operation: 'cancel', selector: 's-rent' } })).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
  it('lets “never mind” cancel a model question without another call', async () => {
    const call = fake({});
    const pending = { type: 'decision' as const, draft: { message: 'Call mom', user_text: 'remind me to call mom at 10' } };
    expect(routeIntent('never mind', { ...routing, pending })).toMatchObject({ type: 'clarify', question: 'Okay, nothing was saved.' });
    expect(await run('never mind', call, pending)).toBeNull();
  });
});
