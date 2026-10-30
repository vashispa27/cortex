/** Decision step for reminders and permanent memories typed into chat.
 *
 * A cloud model proposes ONE action as structured JSON; this module validates it and maps it onto the
 * existing `Intent` type, and `executeIntent` performs any write through the same endpoints the UI uses.
 * The model never writes: output that does not validate becomes a question to the user or is dropped,
 * and any failure falls back to the regex router in `intent.ts`.
 */
import { attributeName, normalize, type Intent, type PendingIntent, type ScheduleChange } from './intent';
import type { ScheduleSpec } from './schedules';

export const DECIDE_PROMPT_VERSION = 'decide-v2';

export const DECIDE_SYSTEM_PROMPT = `You are the action classifier inside Cortex, a personal memory app. Read the user's latest message and call the decide tool exactly once. You never write anything yourself: code validates your output and then performs the action.

Actions: create_reminder, create_task (Cortex generates an answer on a schedule, such as a daily briefing), update_schedule, pause_schedule, resume_schedule, cancel_schedule, snooze_schedule, list_schedules, remember_fact, update_fact, clarify, answer.

Rules:
- Choose answer unless the user directly asks, in the present, to set, change or remove a reminder or to save a fact. These are always answer: questions about how reminders or memory work ("how do I set a reminder?"), quoted text, code, hypotheticals ("if I said remember my PIN is 1234, would you store it?"), examples, reported speech ("she said 'remind me tomorrow'"), and ordinary questions. "What reminders do I have?" is list_schedules.
- Context gives now (local, with offset), weekday, upcoming_days, timezone, the user's schedules (id, title, timing) and saved facts (subject and attribute only). For a named weekday, copy its date from upcoming_days; "Friday" is the next Friday after today, or today if the time is still ahead. Resolve other relative phrases (next week, in 2 hours, the 1st, end of month) yourself into concrete values.
- timing is one of: {"type":"once","local_at":"YYYY-MM-DDTHH:MM"}; {"type":"daily","time":"HH:MM","weekdays":[1..7]} (weekdays Monday=1..Sunday=7, omit for every day; this is also the weekly form); {"type":"monthly","day":1..31 or -1 for the last day,"time":"HH:MM"}; {"type":"interval","every_minutes":N>=15,"start_local":"YYYY-MM-DDTHH:MM","window_start":"HH:MM","window_end":"HH:MM","weekdays":[...]} with the window only if the user gave hours. Times are 24-hour local time in timezone.
- A bare hour with no am/pm and no morning/afternoon/evening/night ("at 5", "call at 3") is ambiguous: use clarify and ask am or pm. Never guess.
- message is the thing to be reminded of in the user's words, without "remind me" ("Call mom"). For create_task, prompt is what Cortex should write each time.
- schedule_id must be copied from the schedules list. If none or several fit, use clarify.
- Facts: subject is "self" for I/my/me, otherwise the person's name; attribute is a short lowercase noun (phone, email, birthday, passport number); value is copied exactly from the user's message. A bare statement giving a person's stable detail ("Rajesh's phone is 213132", "my wife's birthday is 14 March") is remember_fact. Moods, plans, opinions and anything transient ("my phone is dead") are answer. If the facts list already has that subject and attribute and the user gives a different value, use update_fact.
- clarify asks ONE short question and repeats everything already known in the matching fields. If pending_draft is present, the user's message answers your earlier question: complete the draft.

Examples (message -> call):
"remind me to call mom on Sunday at 10am" (now Sat 2026-10-24) -> {"action":"create_reminder","message":"Call mom","timing":{"type":"once","local_at":"2026-10-25T10:00"}}
"every weekday at 9am remind me to check standup notes" -> {"action":"create_reminder","message":"Check standup notes","timing":{"type":"daily","time":"09:00","weekdays":[1,2,3,4,5]}}
"remind me on the 1st of every month to pay rent at 9am" -> {"action":"create_reminder","message":"Pay rent","timing":{"type":"monthly","day":1,"time":"09:00"}}
"call with Roop tomorrow at 5" -> {"action":"clarify","question":"Is 5 am or pm?","message":"Call with Roop"}
"pause the water reminder" (schedules has id s1 "Drink water") -> {"action":"pause_schedule","schedule_id":"s1"}
"how do I set a reminder?" -> {"action":"answer"}`;

export const DECIDE_TOOL = {
  type: 'function',
  function: {
    name: 'decide',
    description: 'Report the one action the user asked for. Output is validated by code before anything happens.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create_reminder', 'create_task', 'update_schedule', 'pause_schedule', 'resume_schedule', 'cancel_schedule', 'snooze_schedule', 'list_schedules', 'remember_fact', 'update_fact', 'clarify', 'answer'] },
        title: { type: 'string', description: 'Short title; optional.' },
        message: { type: 'string', description: 'What to be reminded of.' },
        prompt: { type: 'string', description: 'For create_task: what Cortex should write each run.' },
        requires_live_sources: { type: 'boolean' },
        timing: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['once', 'daily', 'monthly', 'interval'] },
            local_at: { type: 'string' }, time: { type: 'string' }, day: { type: 'integer' },
            every_minutes: { type: 'integer' }, start_local: { type: 'string' },
            window_start: { type: 'string' }, window_end: { type: 'string' },
            weekdays: { type: 'array', items: { type: 'integer' } },
          },
          required: ['type'],
        },
        timezone: { type: 'string', description: 'IANA name; omit to use the context timezone.' },
        schedule_id: { type: 'string' },
        minutes: { type: 'integer' },
        subject: { type: 'string' }, attribute: { type: 'string' }, value: { type: 'string' },
        question: { type: 'string', description: 'For clarify: the one question to ask.' },
      },
      required: ['action'],
    },
  },
} as const;

// ---- Pre-gate (no model) --------------------------------------------------------------------

const WEEKDAY = '(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?';
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
/** Broad on purpose: a false positive costs one cheap call, a false negative silently drops a request. */
const WRITE_HINT = new RegExp([
  String.raw`\b(?:remind(?:ers?)?|remember|forget|save|note|schedule[sd]?|alarm|snooze|reschedule|cancel|pause|resume|delete|update|correct(?:ion)?|actually|instead|change|move)\b`,
  String.raw`\bdon[’']?t\s+forget\b`,
  String.raw`\b(?:every|each|daily|weekly|monthly|hourly|tomorrow|tonight|today|weekdays?|weekends?)\b`,
  String.raw`\b(?:at|@|by|around)\s+\d{1,2}(?::\d{2})?\b`,
  String.raw`\bin\s+\d+\s+(?:min(?:ute)?s?|hours?|days?|weeks?)\b`,
  String.raw`\bnext\s+(?:week|month|${WEEKDAY})\b`,
  String.raw`\bon\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b`,
  String.raw`\b${WEEKDAY}\b`,
  String.raw`\b${MONTH}\s+\d{1,2}\b`,
  // A bare statement of a person's detail: "Rajesh's phone is 213132", "my wife's birthday is 14 March".
  String.raw`^(?:my|[\p{L}][\p{L} .'-]{0,40}?[’']s)\s+[\p{L} ]{2,40}\s+(?:is|are|was)\s+\S`,
].join('|'), 'iu');
export const mayWrite = (text: string): boolean => WRITE_HINT.test(text);

/** Code-side veto: text that quotes, hypothesizes or reports a command can never authorize a write. */
export function isDiscussion(text: string): boolean {
  const t = text.trim();
  return /^["“'‘`>]/.test(t)
    || /^(?:if|suppose|imagine|pretend|how|why)\b/i.test(t)
    || /\b(?:hypothetical(?:ly)?|for example|as an example|for instance|would you (?:store|save|remember|remind)|without (?:saving|creating))\b/i.test(t)
    // Reported speech: "she said remind me…", "he told me to remember…".
    || /\b(?:said|says|told(?: me)?|tells(?: me)?|asked(?: me)?|wrote|texted|messaged)\b[^.?!]*\b(?:remind|remember)\b/i.test(t);
}

// ---- Context --------------------------------------------------------------------------------

export interface ScheduleBrief { id: string; title: string; status: string; timing: ScheduleSpec['timing']; timezone: string; next_due_local?: string | null }
export interface FactBrief { subject: string; attribute: string }
export interface DecisionContext {
  now: Date;
  timezone: string;
  schedules: ScheduleBrief[];
  facts: FactBrief[];
  recent: { role: 'user' | 'assistant'; content: string }[];
  pending?: PendingIntent;
}

function parts(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  return values as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}
/** Local wall-clock time as YYYY-MM-DDTHH:MM, comparable as a string. */
export function localMinute(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function upcomingDays(date: Date, timeZone: string): string[] {
  const p = parts(date, timeZone);
  const localDate = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  return Array.from({ length: 8 }, (_, index) => {
    const day = new Date(localDate.getTime() + index * 86_400_000);
    const label = `${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(day)} ${day.toISOString().slice(0, 10)}`;
    return index === 0 ? `${label} (today)` : label;
  });
}
function localWithOffset(date: Date, timeZone: string): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';
  return `${localMinute(date, timeZone)}${offset === '' ? 'Z' : offset}`;
}

export function buildContext(ctx: DecisionContext): string {
  return JSON.stringify({
    prompt_version: DECIDE_PROMPT_VERSION,
    now: localWithOffset(ctx.now, ctx.timezone),
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: ctx.timezone, weekday: 'long' }).format(ctx.now),
    upcoming_days: upcomingDays(ctx.now, ctx.timezone),
    timezone: ctx.timezone,
    schedules: ctx.schedules.slice(0, 40).map(s => ({ id: s.id, title: s.title.slice(0, 120), status: s.status, timing: s.timing, timezone: s.timezone, next: s.next_due_local ?? null })),
    // Subject and attribute only: values never leave the Mac for this step.
    facts: ctx.facts.slice(0, 100).map(f => ({ subject: f.subject, attribute: f.attribute })),
    recent_turns: ctx.recent.slice(-4).map(t => ({ role: t.role, content: t.content.slice(0, 300) })),
    ...(ctx.pending?.type === 'decision' ? { pending_draft: ctx.pending.draft } : {}),
  });
}

// ---- Validation -----------------------------------------------------------------------------

const ABBREVIATIONS: Record<string, string> = {
  IST: 'Asia/Kolkata', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles', EST: 'America/New_York', EDT: 'America/New_York',
  CST: 'America/Chicago', CDT: 'America/Chicago', MST: 'America/Denver', MDT: 'America/Denver', UTC: 'UTC', GMT: 'UTC',
  BST: 'Europe/London', CET: 'Europe/Paris', CEST: 'Europe/Paris', JST: 'Asia/Tokyo', AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney',
};
/** The IANA name for what the model returned, or undefined when it is not one. Abbreviations are mapped here, not by the model. */
export function resolveTimezone(value: unknown, fallback: string): string | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return undefined;
  const name = ABBREVIATIONS[value.trim().toUpperCase()] ?? value.trim();
  try { new Intl.DateTimeFormat('en', { timeZone: name }); return name; } catch { return undefined; }
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_AT = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d$/;
function realDate(value: string): boolean {
  const m = LOCAL_AT.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
const weekdaysOk = (value: unknown): value is number[] | undefined =>
  value === undefined || (Array.isArray(value) && value.length <= 7 && value.every(d => Number.isInteger(d) && d >= 1 && d <= 7));

/** A bare hour 1–12 after “at”/“@” (or h:mm) with no am/pm and no part of day. Never guessed; the user is asked. */
export function ambiguousHour(message: string): boolean {
  if (/\d\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])|\b(?:noon|midnight|morning|afternoon|evening|night|tonight|o['’]?clock)\b/i.test(message)) return false;
  const bare = /(?:\b(?:at|by|around)\s+|@\s*|(?<![\d:]))(0?[1-9]|1[0-2])(?::([0-5]\d))?(?![\d:]|\s*(?:am|pm|a\.m|p\.m|th|st|nd|rd|%|minutes?|hours?|days?|weeks?|months?))/gi;
  for (const m of message.matchAll(bare)) {
    const prefixed = /^(?:at|@|by|around)\s*/i.test(m[0]);
    // A leading zero or a 24-hour value is explicit; “5” and “5:30” alone are not.
    if (prefixed && !m[0].match(/\s0\d/)) return true;
    if (!prefixed && m[2] !== undefined && !m[1].startsWith('0')) return true;
  }
  return false;
}

type Raw = Record<string, unknown>;
type Checked<T> = { ok: true; value: T } | { ok: false; question: string };
const fail = (question: string): { ok: false; question: string } => ({ ok: false, question });

function checkTiming(raw: unknown, ctx: DecisionContext, timezone: string): Checked<ScheduleSpec['timing']> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('When should it happen?');
  const t = raw as Raw;
  const nowLocal = localMinute(ctx.now, timezone);
  switch (t.type) {
    case 'once': {
      if (typeof t.local_at !== 'string' || !realDate(t.local_at)) return fail('Which date and time (with am/pm)?');
      if (t.local_at <= nowLocal) return fail(`${t.local_at.replace('T', ' ')} has already passed. When should it be instead?`);
      return { ok: true, value: { type: 'once', local_at: t.local_at } };
    }
    case 'daily': {
      if (typeof t.time !== 'string' || !HH_MM.test(t.time) || !weekdaysOk(t.weekdays)) return fail('What time of day (with am/pm), and on which days?');
      return { ok: true, value: { type: 'daily', time: t.time, ...(t.weekdays?.length ? { weekdays: [...new Set(t.weekdays)].sort() } : {}) } };
    }
    case 'monthly': {
      if (typeof t.time !== 'string' || !HH_MM.test(t.time) || !Number.isInteger(t.day) || !((t.day as number) === -1 || ((t.day as number) >= 1 && (t.day as number) <= 31))) return fail('Which day of the month, and at what time?');
      return { ok: true, value: { type: 'monthly', day: t.day as number, time: t.time } };
    }
    case 'interval': {
      const every = t.every_minutes;
      if (typeof every !== 'number' || !Number.isInteger(every) || every < 15 || every > 525_600) return fail('Reminders can repeat at most every 15 minutes. How often should this one repeat?');
      if (!weekdaysOk(t.weekdays)) return fail('Which days of the week?');
      const hasWindow = t.window_start !== undefined || t.window_end !== undefined;
      if (hasWindow && (typeof t.window_start !== 'string' || typeof t.window_end !== 'string' || !HH_MM.test(t.window_start) || !HH_MM.test(t.window_end) || t.window_end <= t.window_start)) return fail('Between which hours should it repeat? The window must end later the same day.');
      let start = t.start_local;
      if (start !== undefined && (typeof start !== 'string' || !realDate(start))) start = undefined;
      if (start === undefined) {
        // With a window the grid starts at the window's opening today; otherwise the first fire is one interval from now.
        start = hasWindow ? `${nowLocal.slice(0, 10)}T${t.window_start}` : localMinute(new Date(Math.ceil(ctx.now.getTime() / 60_000) * 60_000 + every * 60_000), timezone);
      }
      return { ok: true, value: { type: 'interval', every_minutes: every, start_local: start as string, ...(hasWindow ? { window_start: t.window_start as string, window_end: t.window_end as string } : {}), ...(t.weekdays?.length ? { weekdays: [...new Set(t.weekdays)].sort() } : {}) } };
    }
    default: return fail('Should it happen once, daily, weekly, monthly, or every few hours?');
  }
}

const text = (value: unknown, max: number): string | undefined => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined;

/** Asks one question. The draft carries what the model knew plus `user_text`, everything the user has
 * typed toward this request (set here, never by the model), so a reply like “10am” is judged with it. */
function clarify(question: string, raw: Raw, userText: string): Intent {
  const { action: _action, user_text: _ignored, ...known } = raw;
  const draft = JSON.stringify(known).length <= 4000 ? known : {};
  return { type: 'clarify', question, pending: { type: 'decision', draft: { ...draft, user_text: userText.slice(-2000) } } };
}
function whichSchedule(ctx: DecisionContext, raw: Raw, userText: string): Intent {
  const live = ctx.schedules.filter(s => s.status === 'active' || s.status === 'paused');
  return clarify(live.length ? `Which reminder do you mean? ${live.slice(0, 5).map(s => `“${s.title}”`).join(', ')}${live.length > 5 ? '…' : ''}` : 'You have no reminders to change.', raw, userText);
}

/** The model's value must be what the user typed; a paraphrase or invention is never saved. */
const quoted = (message: string, value: string) => normalize(message).includes(normalize(value));

/**
 * Validates a `decide` call and maps it to an `Intent`. Returns `'answer'` when the model says this is not
 * a write, and `null` when the output is unusable (the caller then falls back to the regex router).
 */
export function resolveDecision(rawInput: unknown, ctx: DecisionContext, message: string): Intent | 'answer' | null {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return null;
  const raw = rawInput as Raw;
  const action = raw.action;
  if (typeof action !== 'string') return null;
  if (action === 'answer') return 'answer';
  // Everything the user typed toward this request. A reply to a clarifying question is judged together with
  // the message it answers (the saved value or the “5” may be in the earlier one).
  const earlier = ctx.pending?.type === 'decision' && typeof ctx.pending.draft.user_text === 'string' ? ctx.pending.draft.user_text : '';
  const userText = `${earlier} ${message}`.trim();
  const evidence = userText;
  const timezone = resolveTimezone(raw.timezone, ctx.timezone);
  switch (action) {
    case 'clarify': return clarify(text(raw.question, 300) ?? 'Could you say a little more about what you want me to do?', raw, userText);
    case 'list_schedules': return { type: 'schedule_manage', operation: 'list', selector: '' };
    case 'create_reminder':
    case 'create_task': {
      const task = action === 'create_task';
      const content = text(task ? raw.prompt ?? raw.message : raw.message, 12_000);
      if (!content) return clarify(task ? 'What should Cortex write each time?' : 'What should the reminder say?', raw, userText);
      if (!timezone) return clarify('Which timezone? Please give a place such as Asia/Kolkata.', raw, userText);
      const timing = checkTiming(raw.timing, ctx, timezone);
      if (!timing.ok) return clarify(timing.question, raw, userText);
      if (ambiguousHour(evidence)) return clarify('Is that time am or pm?', raw, userText);
      const title = (text(raw.title, 300) ?? content).slice(0, 150);
      return { type: 'schedule_create', spec: { title, timezone, timing: timing.value, action: task ? { type: 'task', prompt: content, ...(raw.requires_live_sources === true ? { requires_live_sources: true } : {}) } : { type: 'reminder', message: content } } };
    }
    case 'update_schedule':
    case 'pause_schedule':
    case 'resume_schedule':
    case 'cancel_schedule':
    case 'snooze_schedule': {
      const id = text(raw.schedule_id, 100);
      if (!id || !ctx.schedules.some(s => s.id === id)) return whichSchedule(ctx, raw, userText);
      if (action === 'pause_schedule') return { type: 'schedule_manage', operation: 'pause', selector: id };
      if (action === 'resume_schedule') return { type: 'schedule_manage', operation: 'resume', selector: id };
      if (action === 'cancel_schedule') return { type: 'schedule_manage', operation: 'cancel', selector: id };
      if (action === 'snooze_schedule') {
        const minutes = raw.minutes === undefined ? 10 : raw.minutes;
        if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return clarify('Snooze for how many minutes (1 to 1440)?', raw, userText);
        return { type: 'schedule_snooze', selector: id, minutes };
      }
      const change: ScheduleChange = {};
      if (raw.timing !== undefined) {
        if (!timezone) return clarify('Which timezone? Please give a place such as Asia/Kolkata.', raw, userText);
        const existing = ctx.schedules.find(s => s.id === id)!;
        const timing = checkTiming(raw.timing, ctx, raw.timezone === undefined ? existing.timezone : timezone);
        if (!timing.ok) return clarify(timing.question, raw, userText);
        if (ambiguousHour(evidence)) return clarify('Is that time am or pm?', raw, userText);
        change.timing = timing.value;
      }
      if (raw.timezone !== undefined) { if (!timezone) return clarify('Which timezone? Please give a place such as Asia/Kolkata.', raw, userText); change.timezone = timezone; }
      const newMessage = text(raw.message, 12_000); if (newMessage) change.message = newMessage;
      const newPrompt = text(raw.prompt, 12_000); if (newPrompt) change.prompt = newPrompt;
      const newTitle = text(raw.title, 300); if (newTitle) change.title = newTitle;
      if (!Object.keys(change).length) return clarify('What should change about it?', raw, userText);
      return { type: 'schedule_update', selector: id, change };
    }
    case 'remember_fact':
    case 'update_fact': {
      const subjectRaw = text(raw.subject, 120), attribute = text(raw.attribute, 120), value = text(raw.value, 2000);
      if (!subjectRaw || !attribute || !value) return clarify('Which fact should I save? For example: “Rajesh’s phone number is 213132”.', raw, userText);
      if (!quoted(evidence, value)) return null;
      const subject = /^(?:i|me|my|myself|self|mine)$/i.test(subjectRaw) ? 'self' : subjectRaw;
      return { type: 'remember', fact: { subject, attribute: attributeName(attribute), value, source: userText, channel: 'chat' } };
    }
    default: return null;
  }
}

// ---- Calling the model ----------------------------------------------------------------------

export interface DecideRequest { system: string; context: string; message: string; tool: typeof DECIDE_TOOL; timeoutMs: number }
/** Returns the `decide` call's arguments. The desktop binds this to the `decide_intent` command; tests pass a fake. */
export type DecideCall = (request: DecideRequest) => Promise<unknown>;
export const DECIDE_TIMEOUT_MS = 6_000;
/** A local model may first have to load (or swap in its routing adapter), which takes a few seconds. */
export const DECIDE_LOCAL_TIMEOUT_MS = 15_000;

/** The system prompt for the local model fine-tuned on evals/routing/train.jsonl. It learned the rules from
 * examples, so it gets one line instead of DECIDE_SYSTEM_PROMPT; the tool and context stay the same. */
export const ROUTER_SHORT_PROMPT = "You route messages for Cortex, a personal memory app. Call the decide tool exactly once with the action for the user's latest message, using the context.";

/**
 * One decision. `null` means “use the regex router”: the message is vetoed as discussion, the call failed or
 * timed out, or the output did not validate. Nothing is written from an output that did not validate.
 */
export async function decide(message: string, ctx: DecisionContext, call: DecideCall, timeoutMs = DECIDE_TIMEOUT_MS, system = DECIDE_SYSTEM_PROMPT): Promise<Intent | 'answer' | null> {
  if (isDiscussion(message)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      call({ system, context: buildContext(ctx), message, tool: DECIDE_TOOL, timeoutMs }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('decision timed out')), timeoutMs + 1_000); }),
    ]);
    return resolveDecision(result, ctx, message);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
