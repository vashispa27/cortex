import { describe, expect, it, vi } from 'vitest';
import { executeIntent, routeIntent, type IntentServices, type RoutingContext } from './intent';
import type { PersonalFact } from './memories';
import type { Schedule, ScheduleSpec } from './schedules';

const context: RoutingContext = { now: new Date('2026-10-25T07:00:00Z'), timezone: 'Asia/Kolkata' };
const fact: PersonalFact = { id: 'fact-1', kind: 'personal_fact', key: '["rajesh","phone"]', subject: 'Rajesh', attribute: 'phone', value: '213132', source: 'Explicit request', channel: 'chat', revision: 2, created_ms: 1, updated_ms: 2 };
const spec: ScheduleSpec = { title: 'send my resume', timezone: context.timezone, timing: { type: 'once', local_at: '2026-10-26T14:00' }, action: { type: 'reminder', message: 'send my resume' } };
const schedule: Schedule = { ...spec, id: 'schedule-1', revision: 3, status: 'active', next_due_ms: 1, created_ms: 1, updated_ms: 1 };
function services(): IntentServices {
  return {
    memories: { recall: vi.fn().mockResolvedValue({ items: [], next_offset: null, total: 0, kind: 'personal_fact' }), remember: vi.fn().mockResolvedValue(fact), update: vi.fn().mockResolvedValue(fact), search: vi.fn(), delete: vi.fn() },
    schedules: { create: vi.fn().mockResolvedValue(schedule), get: vi.fn().mockResolvedValue(schedule), list: vi.fn().mockResolvedValue({ items: [schedule], total: 1, next_offset: null }), update: vi.fn(), pause: vi.fn().mockResolvedValue({ ...schedule, status: 'paused' }), resume: vi.fn(), cancel: vi.fn(), history: vi.fn() },
    answer: vi.fn().mockResolvedValue({ body: 'Activity answer [42]', hits: [], retrieved: [], searchQuery: '', source: 'memory', timings: { rewrite: 0, prepare: 0, model: 0 } }), newId: () => 'request-1',
  };
}
const route = (text: string) => routeIntent(text, context);

describe('intent routing before retrieval', () => {
  it.each([
    ['Remind me to send my resume tomorrow at 2pm', 'schedule_create'],
    ['Please remember Rajesh’s phone number is 213132', 'remember'],
    ["What is Rajesh's phone number?", 'permanent'],
    ['What did I read yesterday?', 'activity'],
    ['Find the accessibility checklist', 'activity'],
    ['Define latency', 'general'],
    ["Compare Rajesh's saved phone number with what I saw yesterday", 'mixed'],
    ['What reminders do I have?', 'schedule_manage'],
    ['Schedule a task to summarize the news every day at 08:00', 'schedule_create'],
  ])('%s → %s', (text, type) => expect(route(text).type).toBe(type));

  it.each([
    '"Remind me to send my resume tomorrow at 2pm"',
    'For example, remind me to send my resume tomorrow at 2pm',
    'Hypothetically, remember Rajesh’s phone number is 213132',
    'Explain what “remind me to send my resume tomorrow at 2pm” means',
    'If I say remember Rajesh’s phone number is 213132, what happens?',
    'Remind me to send my resume tomorrow at 2pm as an example',
    'Do not remind me to send my resume tomorrow at 2pm',
    '`Remember Rajesh’s phone number is 213132`',
    'Rajesh said: "Remember my phone number is 213132"',
  ])('never executes quoted/hypothetical/discussed instructions: %s', async text => {
    const svc = services();
    await executeIntent(route(text), [], svc);
    expect(svc.schedules.create).not.toHaveBeenCalled();
    expect(svc.memories.remember).not.toHaveBeenCalled();
    expect(svc.memories.update).not.toHaveBeenCalled();
  });

  it('creates the requested reminder without provider or retrieval calls', async () => {
    const svc = services();
    const intent = route('Remind me to send my resume tomorrow at 2pm');
    expect(intent).toEqual({ type: 'schedule_create', spec });
    expect((await executeIntent(intent, [], svc)).body).toContain('Reminder saved');
    expect(svc.schedules.create).toHaveBeenCalledWith('request-1', spec);
    expect(svc.memories.recall).not.toHaveBeenCalled();
    expect(svc.answer).not.toHaveBeenCalled();
  });

  it('resolves tomorrow against the given timezone across a UTC date boundary', () => {
    const decision = routeIntent('Remind me to call tomorrow at 12am', { now: new Date('2026-10-25T23:00Z'), timezone: 'Asia/Kolkata' });
    expect(decision).toMatchObject({ spec: { timing: { local_at: '2026-10-27T00:00' } } });
  });

  it.each(['tomorrow at 2', 'tomorrow', 'next Friday at 2pm', 'tomorrow at 25:00', 'tomorrow at 2pm PST'])('clarifies ambiguous or unsupported timing: %s', async timing => {
    const svc = services();
    const decision = route(`Remind me to call ${timing}`);
    expect(decision.type).toBe('clarify');
    await executeIntent(decision, [], svc);
    expect(svc.schedules.create).not.toHaveBeenCalled();
    expect(svc.answer).not.toHaveBeenCalled();
  });

  it('resumes a time clarification and preserves the requested action', () => {
    const decision = route('Remind me to send my resume tomorrow at 2');
    if (decision.type !== 'clarify') throw Error('Expected clarification');
    const next = routeIntent('2pm', { ...context, pending: decision.pending });
    expect(next).toEqual({ type: 'schedule_create', spec });
    expect(routeIntent('Define latency', { ...context, pending: decision.pending }).type).toBe('general');
  });

  it('saves canonical subject/attribute and corrects only an exact existing fact', async () => {
    const svc = services();
    const decision = route('Remember Rajesh’s phone number is 213132');
    await executeIntent(decision, [], svc);
    expect(svc.memories.remember).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Rajesh', attribute: 'phone', value: '213132', channel: 'chat' }));
    vi.mocked(svc.memories.recall).mockResolvedValue({ kind: 'personal_fact', items: [fact], total: 1, next_offset: null });
    await executeIntent(route('Correct Rajesh’s phone number to 999'), [], svc);
    expect(svc.memories.update).toHaveBeenCalledWith(fact, expect.objectContaining({ value: '999' }));
    expect(svc.answer).not.toHaveBeenCalled();
  });

  it('answers permanent facts directly, with source domain and no activity retrieval', async () => {
    const svc = services();
    vi.mocked(svc.memories.recall).mockResolvedValue({ kind: 'personal_fact', items: [fact], total: 1, next_offset: null });
    const answer = await executeIntent(route('What is Rajesh’s phone number?'), [], svc);
    expect(answer.body).toContain('213132');
    expect(answer.body).toContain('Saved fact');
    expect(answer.hits).toEqual([]);
    expect(svc.answer).not.toHaveBeenCalled();
  });

  it('passes permanent facts separately into mixed activity synthesis', async () => {
    const svc = services();
    vi.mocked(svc.memories.recall).mockResolvedValue({ kind: 'personal_fact', items: [fact], total: 1, next_offset: null });
    const question = 'Compare Rajesh’s saved phone with what I read yesterday';
    await executeIntent(route(question), [], svc);
    expect(svc.answer).toHaveBeenCalledWith(question, [], [fact]);
  });

  it('uses the existing answer path for ordinary searches and general questions', async () => {
    const svc = services();
    for (const text of ['What did I read yesterday?', 'Define latency']) await executeIntent(route(text), [], svc);
    expect(svc.answer).toHaveBeenCalledTimes(2);
    expect(svc.memories.recall).not.toHaveBeenCalled();
  });

  it('reads the current schedule revision before managing it', async () => {
    const svc = services();
    expect((await executeIntent(route('Pause reminder send my resume'), [], svc)).body).toContain('paused');
    expect(svc.schedules.get).toHaveBeenCalledWith('schedule-1');
    expect(svc.schedules.pause).toHaveBeenCalledWith(schedule);
    expect((await executeIntent(route('Cancel reminder unknown'), [], svc)).intent).toBe('clarify');
    expect(svc.schedules.cancel).not.toHaveBeenCalled();
  });

  it.each(['schedule', 'fact', 'revision', 'recall'])('propagates %s failures without success or fallback retrieval', async failure => {
    const svc = services();
    const error = new Error('backend unavailable or revision conflict');
    let command = 'Remind me to send my resume tomorrow at 2pm';
    if (failure === 'schedule') vi.mocked(svc.schedules.create).mockRejectedValue(error);
    if (failure === 'fact') { command = 'Remember Rajesh’s phone is 213132'; vi.mocked(svc.memories.remember).mockRejectedValue(error); }
    if (failure === 'revision') { command = 'Pause reminder send my resume'; vi.mocked(svc.schedules.pause).mockRejectedValue(error); }
    if (failure === 'recall') { command = 'What is Rajesh’s phone number?'; vi.mocked(svc.memories.recall).mockRejectedValue(error); }
    await expect(executeIntent(route(command), [], svc)).rejects.toBe(error);
    expect(svc.answer).not.toHaveBeenCalled();
  });
});

it('does not substitute a different person’s overlapping phone fact', async () => {
  const svc = services();
  vi.mocked(svc.memories.recall).mockResolvedValue({ kind: 'personal_fact', items: [{ ...fact, subject: 'Maya' }], total: 1, next_offset: null });
  const result = await executeIntent(route('What is Rajesh’s phone number?'), [], svc);
  expect(result.body).not.toContain('213132');
  expect(result.body).toContain('don’t have a saved fact');
});

it('does not confirm a write while persistence is pending', async () => {
  const svc = services();
  let persisted!: (value: Schedule) => void;
  vi.mocked(svc.schedules.create).mockReturnValue(new Promise(resolve => { persisted = resolve; }));
  let replied = false;
  const reply = executeIntent(route('Remind me to send my resume tomorrow at 2pm'), [], svc).then(value => { replied = true; return value; });
  await Promise.resolve();
  expect(replied).toBe(false);
  persisted(schedule);
  expect((await reply).body).toContain('saved');
});

it('reschedules using the saved action and current revision', async () => {
  const svc = services();
  vi.mocked(svc.schedules.update).mockResolvedValue(schedule);
  await executeIntent(route('Reschedule reminder send my resume to tomorrow at 3pm'), [], svc);
  expect(svc.schedules.update).toHaveBeenCalledWith(schedule, { ...spec, timing: { type: 'once', local_at: '2026-10-26T15:00' } });
  expect(route('Reschedule reminder send my resume to tomorrow at 3').type).toBe('clarify');
});

it('rounds relative reminders up to scheduler minute precision and rejects zero delays', () => {
  expect(routeIntent('Remind me to call in 5 minutes', { ...context, now: new Date('2026-10-25T07:00:30Z') })).toMatchObject({ type: 'schedule_create', spec: { timing: { local_at: '2026-10-25T12:36' } } });
  expect(route('Remind me to call in 0 minutes').type).toBe('clarify');
});

it('keeps an explicit dinner time while asking only for the date', () => {
  const first = route('remind me to eat dinner at 11pm');
  expect(first).toMatchObject({ type: 'clarify', pending: { draft: { message: 'eat dinner', time: '23:00' } } });
  if (first.type !== 'clarify') throw Error('Expected date question');
  expect(routeIntent('today', { ...context, pending: first.pending })).toMatchObject({
    type: 'schedule_create', spec: { title: 'eat dinner', timing: { type: 'once', local_at: '2026-10-25T23:00' }, action: { message: 'eat dinner' } },
  });
});

it('asks for missing reminder content without saving the date as its title', () => {
  const first = route('create a reminder for today 11pm');
  expect(first).toMatchObject({ type: 'clarify', pending: { draft: { message: '', date: '2026-10-25', time: '23:00' } } });
  if (first.type !== 'clarify') throw Error('Expected content question');
  expect(routeIntent('eat dinner', { ...context, pending: first.pending })).toMatchObject({ type: 'schedule_create', spec: { title: 'eat dinner', action: { message: 'eat dinner' }, timing: { local_at: '2026-10-25T23:00' } } });
  expect(routeIntent('Define latency', { ...context, pending: first.pending }).type).toBe('general');
});

it.each(['11am', '11pm'])('clarifies conflicting morning/PM wording and resumes with %s', async time => {
  const svc = services();
  const first = route('every morning at 11 pm remind me to read nes');
  expect(first).toMatchObject({ type: 'clarify', pending: { draft: { message: 'read nes', daily: true, time: '23:00', period: 'morning' } } });
  if (first.type !== 'clarify') throw Error('Expected contradiction question');
  await executeIntent(first, [], svc);
  expect(svc.schedules.create).not.toHaveBeenCalled(); expect(svc.answer).not.toHaveBeenCalled();
  const next = routeIntent(time, { ...context, pending: first.pending });
  expect(next).toMatchObject({ type: 'schedule_create', spec: { timing: { type: 'daily', time: time === '11am' ? '11:00' : '23:00' }, action: { type: 'reminder', message: 'read nes' } } });
  await executeIntent(next, [], svc);
  expect(svc.schedules.create).toHaveBeenCalledOnce(); expect(svc.answer).not.toHaveBeenCalled();
});

it.each([
  ['Every morning at 11am remind me to read news', 'reminder', '11:00', undefined],
  ['Every night at 11pm remind me to read news', 'reminder', '23:00', undefined],
  ['Remind me every morning at 11am to read news', 'reminder', '11:00', undefined],
  ['Remind me to read news every morning at 11am', 'reminder', '11:00', undefined],
  ['Every weekday at 09:00 remind me to read news', 'reminder', '09:00', [1,2,3,4,5]],
  ['Every morning at 08:00 give me a stock market briefing', 'task', '08:00', undefined],
])('routes recurring command to shared schedule API: %s', (text, type, time, weekdays) => {
  expect(route(text as string)).toMatchObject({ type: 'schedule_create', spec: { timing: { type: 'daily', time, ...(weekdays ? { weekdays } : {}) }, action: { type } } });
});

it('retains a recurring task prompt while clarifying its time and timezone', () => {
  const first = route('Every morning give me a stock market briefing');
  if (first.type !== 'clarify') throw Error('Expected time question');
  expect(routeIntent('08:00 in America/New_York', { ...context, pending: first.pending })).toMatchObject({ type: 'schedule_create', spec: { timezone: 'America/New_York', timing: { type: 'daily', time: '08:00' }, action: { type: 'task', prompt: 'Give me a stock market briefing' } } });
  const cancelled = routeIntent('never mind', { ...context, pending: first.pending });
  expect(cancelled.type).toBe('clarify');
  expect(cancelled).not.toHaveProperty('pending');
});

it.each(['"Every night at 11pm remind me to read"', 'For example every morning at 11am remind me to read', 'If I say every night at 11pm remind me to read, what happens?'])('does not schedule discussed recurrence: %s', async text => {
  const svc = services(); await executeIntent(route(text), [], svc); expect(svc.schedules.create).not.toHaveBeenCalled();
});


it('clarifies unsupported recurring write commands instead of falling through to the answer model', async () => {
  const svc = services();
  const decision = route('Every month at 9am remind me to pay rent');
  expect(decision.type).toBe('clarify');
  await executeIntent(decision, [], svc);
  expect(svc.answer).not.toHaveBeenCalled(); expect(svc.schedules.create).not.toHaveBeenCalled();
});

it('preserves an explicit trailing timezone when normalizing leading recurrence', () => {
  expect(route('Every morning at 08:00 remind me to read news in America/New_York')).toMatchObject({ type: 'schedule_create', spec: { title: 'read news', timezone: 'America/New_York', timing: { type: 'daily', time: '08:00' } } });
});

it.each([
  'remember my emial 27abhinav10@gmail.coim',
  'remember my email 27abhinav10@gmail.coim',
  'remember my email is 27abhinav10@gmail.coim',
  'remember my e-mail address: 27abhinav10@gmail.coim',
])('accepts email shorthand and preserves the exact address: %s', async text => {
  const svc = services();
  const decision = route(text);
  expect(decision).toMatchObject({ type: 'remember', fact: { subject: 'self', attribute: 'email', value: '27abhinav10@gmail.coim', source: text, channel: 'chat' } });
  await executeIntent(decision, [], svc);
  expect(svc.memories.remember).toHaveBeenCalledWith(expect.objectContaining({ subject: 'self', attribute: 'email', value: '27abhinav10@gmail.coim' }));
  expect(svc.answer).not.toHaveBeenCalled();
});

it.each(['Remember my email', 'Remember my email address', 'Remember my phone number', 'Remember my email is', 'Remember something useful'])('does not invent a missing fact value: %s', async text => {
  const svc = services();
  const decision = route(text);
  expect(decision.type).toBe('clarify'); await executeIntent(decision, [], svc);
  expect(svc.memories.remember).not.toHaveBeenCalled();
});

it('uses the canonical email attribute for shorthand corrections and typoed recall', async () => {
  const svc = services();
  const email = { ...fact, subject: 'self', attribute: 'email', value: 'old@example.com' };
  vi.mocked(svc.memories.recall).mockResolvedValue({ kind: 'personal_fact', items: [email], total: 1, next_offset: null });
  await executeIntent(route('Correct my emial 27abhinav10@gmail.coim'), [], svc);
  expect(svc.memories.update).toHaveBeenCalledWith(email, expect.objectContaining({ attribute: 'email', value: '27abhinav10@gmail.coim' }));
  expect(route('What is my emial?')).toMatchObject({ type: 'permanent', factSubject: 'self', factAttribute: 'email' });
});

it.each(['"remember my emial 27abhinav10@gmail.coim"', 'For example remember my email 27abhinav10@gmail.coim', 'Do not remember my email 27abhinav10@gmail.coim'])('does not write quoted or negated email shorthand: %s', async text => {
  const svc = services(); await executeIntent(route(text), [], svc);
  expect(svc.memories.remember).not.toHaveBeenCalled(); expect(svc.memories.update).not.toHaveBeenCalled();
});
