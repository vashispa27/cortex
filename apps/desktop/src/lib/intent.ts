/** Natural-language boundary shared by chat hosts. Structured API/MCP calls bypass this module.
 * Only the current user's direct command can authorize a write; retrieved text never enters it.
 */
import type { FactInput, MemoryService, PersonalFact } from './memories';
import type { ScheduleService, ScheduleSpec } from './schedules';
import type { ChatMessage } from './types';
import type { Answer } from './answer';

export type ScheduleDraft = { message: string; date?: string; time?: string; daily?: boolean; weekdays?: number[]; period?: 'morning' | 'evening' | 'night'; actionType?: 'reminder' | 'task'; timezone: string };
export type PendingIntent = { type: 'schedule'; draft: ScheduleDraft };
export type Intent =
  | { type: 'clarify'; question: string; pending?: PendingIntent }
  | { type: 'schedule_create'; spec: ScheduleSpec }
  | { type: 'schedule_reschedule'; selector: string; timing: ScheduleSpec['timing']; timezone: string }
  | { type: 'schedule_manage'; operation: 'list' | 'pause' | 'resume' | 'cancel'; selector: string }
  | { type: 'remember'; fact: FactInput }
  | { type: 'permanent' | 'activity' | 'general' | 'mixed'; query: string; factSubject?: string; factAttribute?: string };
export type RoutingContext = { now: Date; timezone: string; pending?: PendingIntent };
export type RoutedAnswer = Answer & { intent: Intent['type']; pendingIntent?: PendingIntent };
export interface IntentServices {
  memories: MemoryService;
  schedules: ScheduleService;
  /** The existing answer pipeline; permanent facts stay separate from captured snapshots. */
  answer(question: string, history: ChatMessage[], facts?: PersonalFact[]): Promise<Answer>;
  newId(): string;
}

const attributes = /\b(name|employer|occupation|timezone|phone(?: number)?|(?:email|emial|e-mail)(?: address)?|address|birthday|favorite\s+\w+|favourite\s+\w+|preference|allerg(?:y|ies)|pronouns|saved facts?|permanent memor(?:y|ies))\b/i;
const activity = /\b(read|reading|saw|seen|viewed|visited|browsed|worked|working|opened|watched|said|reply|replied|messages?|screen|activity|captured|yesterday|last week)\b/i;
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const attributeName = (value: string) => normalize(value).replace(/^phone number$/, 'phone').replace(/^(?:email|emial|e-mail)(?: address)?$/, 'email').replace(/^favourite /, 'favorite ');
const clarify = (question: string): Intent => ({ type: 'clarify', question });

function localDate(now: Date, timezone: string, days = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (key: string) => Number(parts.find(p => p.type === key)?.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day') + days)).toISOString().slice(0, 10);
}
function clock(text: string): string | undefined {
  if (/^noon$/i.test(text)) return '12:00';
  if (/^midnight$/i.test(text)) return '00:00';
  const m = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i.exec(text);
  if (!m) return;
  let hour = Number(m[1]);
  if (m[3]) {
    if (hour < 1 || hour > 12) return;
    hour = hour % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  } else if (!m[2] || hour > 23) return; // Bare “2” needs AM/PM; 14:00 is explicit.
  return `${String(hour).padStart(2, '0')}:${m[2] ?? '00'}`;
}
function scheduleIntent(draft: ScheduleDraft): Intent {
  const pending: PendingIntent = { type: 'schedule', draft };
  if (draft.time && ((draft.period === 'morning' && Number(draft.time.slice(0, 2)) >= 12)
    || ((draft.period === 'night' || draft.period === 'evening') && Number(draft.time.slice(0, 2)) < 12))) {
    return { type: 'clarify', question: `“${draft.period}” conflicts with ${draft.time}. Did you mean every morning with an AM time, or every evening/night with a PM time? Please reply with the intended time, for example 11am or 11pm (${draft.timezone}).`, pending };
  }
  if (!draft.message.trim()) return { type: 'clarify', question: `What should the ${draft.actionType === 'task' ? 'task do' : 'reminder say'}?`, pending };
  if (!draft.date && !draft.daily) return { type: 'clarify', question: 'On which date should I remind you?', pending: { type: 'schedule', draft } };
  if (!draft.time) return { type: 'clarify', question: `What time${draft.date ? ` on ${draft.date}` : ' each day'} (${draft.timezone})? Please include AM/PM or a 24-hour time.`, pending: { type: 'schedule', draft } };
  return { type: 'schedule_create', spec: {
    title: draft.message.slice(0, 150), timezone: draft.timezone,
    timing: draft.daily ? { type: 'daily', time: draft.time, ...(draft.weekdays ? { weekdays: draft.weekdays } : {}) } : { type: 'once', local_at: `${draft.date}T${draft.time}` },
    action: draft.actionType === 'task' ? { type: 'task', prompt: draft.message } : { type: 'reminder', message: draft.message },
  } };
}

export function routeIntent(input: string, context: RoutingContext): Intent {
  const original = input.trim();
  const text = original.replace(/^(?:(?:(?:can|could|would) you|I want you to|I(?:'|’)d like you to)\s+)?(?:please\s+)?/i, '').replace(/^I (?:want|would like) to be reminded to\s+/i, 'remind me to ').replace(/[.!?]+$/, '').trim();
  // Command recognition is anchored. Quotes/code, examples, conditionals and reported speech cannot write.
  const discussion = /^["“'‘`>]/.test(text) || /\b(hypothetical(?:ly)?|for example|as an example|suppose|pretend|if|don[’']t|do not|do not actually|without (?:saving|creating))\b/i.test(text);
  if (!discussion && context.pending?.type === 'schedule') {
    // Only the immediately preceding user-authorized draft can resume a write.
    const draft = { ...context.pending.draft };
    if (/^(?:never mind|nevermind|forget it|cancel(?: that| it)?)$/i.test(text)) return clarify('Okay, no reminder was created.');
    let reply = text;
    const tz = /(?:^|\s)(?:in\s+)?(UTC|[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/i.exec(reply);
    if (tz) {
      try { new Intl.DateTimeFormat('en', { timeZone: tz[1] }); } catch { return { type: 'clarify', question: 'Which IANA timezone should I use, for example Asia/Kolkata?', pending: context.pending }; }
      draft.timezone = tz[1]; reply = reply.slice(0, tz.index).trim();
    }
    const temporal = /^(?:(?:today|tomorrow|tonight|\d{4}-\d{2}-\d{2}|every (?:day|morning|evening|night|weekday)|daily)(?:\s+at)?\s*)?(?:(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight))?$/i;
    if ((reply || tz) && temporal.test(reply)) {
      const date = /today|tomorrow|tonight|\d{4}-\d{2}-\d{2}/i.exec(reply)?.[0];
      if (date) draft.date = /^tomorrow$/i.test(date) ? localDate(context.now, draft.timezone, 1) : /^(today|tonight)$/i.test(date) ? localDate(context.now, draft.timezone) : date;
      const recurring = /every (day|morning|evening|night|weekday)|daily/i.exec(reply);
      if (recurring) {
        draft.daily = true;
        draft.weekdays = recurring[1]?.toLowerCase() === 'weekday' ? [1, 2, 3, 4, 5] : undefined;
        draft.period = /^(morning|evening|night)$/i.test(recurring[1] ?? '') ? recurring[1].toLowerCase() as ScheduleDraft['period'] : undefined;
      }
      const time = reply.replace(/today|tomorrow|tonight|\d{4}-\d{2}-\d{2}|every (?:day|morning|evening|night|weekday)|daily/i, '').replace(/^\s*at\s+/i, '').trim();
      if (time) {
        draft.time = clock(time);
        // A direct time reply resolves the preceding morning/night contradiction.
        if (!recurring && draft.time) draft.period = undefined;
      }
      return scheduleIntent(draft);
    }
    if (!draft.message.trim() && text && !/^(?:what|which|who|where|when|why|how|define|explain|write|translate|calculate|find|search|remember|create|set|schedule|remind|every|daily)\b/i.test(text) && !/[?\n]/.test(text)) {
      draft.message = text.replace(/^to\s+/i, '');
      return scheduleIntent(draft);
    }
  }
  if (!discussion) {
    if (/^(?:list|show)(?: me)? (?:my |all )?(?:saved facts|permanent memor(?:y|ies))$/i.test(text)) return { type: 'permanent', query: '' };
    const reschedule = /^(?:reschedule|move|change) (?:my |the )?(?:reminder|schedule) (.+?) (?:to|for) (today|tomorrow|\d{4}-\d{2}-\d{2}|every day|daily) at (.+)$/i.exec(text);
    if (reschedule) {
      const timing = routeIntent(`Remind me to placeholder ${reschedule[2]} at ${reschedule[3]}`, { ...context, pending: undefined });
      if (timing.type !== 'schedule_create') return clarify('Please repeat the reschedule command with its exact title or ID, date, time with AM/PM, and timezone.');
      return { type: 'schedule_reschedule', selector: reschedule[1], timing: timing.spec.timing, timezone: timing.spec.timezone };
    }
    const listQuestion = /^(?:what|which) (?:reminders|schedules)(?: do I have| are (?:active|scheduled))?$/i.test(text);
    if (listQuestion) return { type: 'schedule_manage', operation: 'list', selector: '' };
    const manage = /^(list|show|pause|resume|cancel|delete)\s+(?:my\s+|the\s+)?(?:reminders?|schedules?)(?:\s+(.+))?$/i.exec(text)
      ?? /^(pause|resume|cancel|delete)\s+(?:my\s+|the\s+)?(.+?)\s+(reminder|schedule)$/i.exec(text);
    if (manage) {
      const operation = /list|show/i.test(manage[1]) ? 'list' : /cancel|delete/i.test(manage[1]) ? 'cancel' : manage[1].toLowerCase() as 'pause' | 'resume';
      return { type: 'schedule_manage', operation, selector: manage[2] ?? '' };
    }
    // Normalize leading recurrence without sending a write request through the answer model.
    const reordered = /^remind me ((?:every|each) (?:morning|evening|night|day|weekday)|daily)(.*?) to (.+)$/i.exec(text);
    if (reordered) return routeIntent(`${reordered[1]}${reordered[2]} remind me to ${reordered[3]}`, { ...context, pending: undefined });
    const leading = /^((?:every|each) (?:morning|evening|night|day|weekday)|daily)(.*?)\s+(remind me to|give me|provide me with|send me)\s+(.+)$/i.exec(text);
    if (leading) {
      const cadence = leading[1].replace(/^each /i, 'every ');
      const command = /^remind/i.test(leading[3]) ? 'Remind me to' : 'Schedule a task to';
      const message = /^remind/i.test(leading[3]) ? leading[4] : `Give me ${leading[4]}`;
      const tz = /\s+(?:in\s+)?(UTC|[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/i.exec(message);
      return routeIntent(`${command} ${tz ? message.slice(0, tz.index) : message} ${cadence}${leading[2]}${tz ? ` in ${tz[1]}` : ''}`, { ...context, pending: undefined });
    }
    const reminder = /^(?:remind me to|(?:create|set|schedule)(?: me)? (?:a )?(?:reminder|task)(?:\s+(?:to|for))?)\b\s*(.*)$/i.exec(text);
    if (reminder) {
      let rest = reminder[1];
      const actionType = /^(?:create|set|schedule)(?: me)? (?:a )?task\b/i.test(text) ? 'task' as const : 'reminder' as const;
      let timezone = context.timezone;
      const tz = /\s+(?:in\s+)?(UTC|[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/.exec(rest);
      if (tz) { timezone = tz[1]; rest = rest.slice(0, tz.index); }
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(context.now); } catch { return clarify('Which IANA timezone should I use, for example Asia/Kolkata?'); }
      const relative = /\s+in\s+(\d+)\s+(minutes?|hours?)$/i.exec(rest);
      if (relative) {
        const amount = Number(relative[1]);
        if (!Number.isSafeInteger(amount) || amount <= 0) return clarify('How many minutes or hours from now? Please give a positive number.');
        // The scheduler stores minute precision. Round up so the reminder never runs early.
        const future = new Date(Math.ceil((context.now.getTime() + amount * (/hour/i.test(relative[2]) ? 3600000 : 60000)) / 60000) * 60000);
        if (!Number.isFinite(future.getTime())) return clarify('Please provide a valid reminder date and time.');
        const time = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(future);
        return scheduleIntent({ message: rest.slice(0, relative.index), actionType, timezone, date: localDate(future, timezone), time });
      }
      const timing = /(?:^|\s)(today|tomorrow|tonight|\d{4}-\d{2}-\d{2}|every (?:day|morning|night|evening|weekday)|daily)(?:\s+(?:at\s+)?(.+))?$/i.exec(rest);
      if (timing) {
        const when = timing[1].toLowerCase();
        return scheduleIntent({ message: rest.slice(0, timing.index).trim(), actionType, timezone, daily: /every|daily/.test(when),
          period: /morning|evening|night/.exec(when)?.[0] as ScheduleDraft['period'], weekdays: when === 'every weekday' ? [1, 2, 3, 4, 5] : undefined,
          date: when === 'tomorrow' ? localDate(context.now, timezone, 1) : /^(today|tonight)$/.test(when) ? localDate(context.now, timezone) : /^\d{4}-/.test(when) ? when : undefined,
          time: timing[2] ? clock(timing[2]) : undefined });
      }
      const timeOnly = /(?:^|\s)at\s+(.+)$/i.exec(rest);
      if (timeOnly && clock(timeOnly[1])) return scheduleIntent({ message: rest.slice(0, timeOnly.index).trim(), actionType, timezone, time: clock(timeOnly[1]) });
      // Unsupported calendar expressions must be clarified, never silently dropped from the action.
      if (/\b(at|on|every|next|tonight|morning|evening|week|month|timezone|UTC|GMT|IST|EST|PST)\b/i.test(rest)) return clarify('Please specify the reminder date, time with AM/PM, and timezone (for example tomorrow at 2pm in Asia/Kolkata).');
      return scheduleIntent({ message: rest, actionType, timezone });
    }
    if (/^(?:every|each)\b.*\b(?:remind me|give me|provide me with|send me)\b/i.test(text)) {
      return clarify('Please specify a supported daily or weekday schedule and an exact time with AM/PM (for example every weekday at 9am remind me to read news).');
    }
    if (/^(?:(?:every|each) (?:morning|evening|night|day|weekday)|daily|remind me|schedule\b|set (?:a |an )?(?:alarm|reminder)|create (?:a )?(?:schedule|reminder)|(?:change|edit|reschedule|move)\b.*\b(?:reminder|schedule))\b/i.test(text) && !/^remind me (?:what|who|where|when|why|how)\b/i.test(text)) {
      return clarify('What should the reminder say, and on which date and time (including timezone) should it run?');
    }
    if (/^(remember|save (?:a |this )?(?:fact|memory)|update|correct)\b/i.test(text)) {
      const value = text.replace(/^(?:remember(?: that)?|save (?:a |this )?(?:fact|memory)[: ]*|update|correct)\s*/i, '');
      const fact = /^(?:(my)|(.+?)[’']s)\s+(.+?)\s+(?:is|to|=)\s+(.+)$/i.exec(value)
        // Delimiter-free shorthand is limited to known fields so arbitrary prose
        // cannot silently become a guessed subject/attribute/value split.
        ?? /^(?:(my)|(.+?)[’']s)\s+((?:email|emial|e-mail)(?: address)?(?!\s+address\b)|phone(?: number)?(?!\s+number\b)|name|employer|occupation|timezone|birthday|pronouns)(?:\s*[:=]\s*|\s+)(.+)$/i.exec(value);
      if (fact && !/^(?:is|to|=|:)$/i.test(fact[4].trim()) && !/["“”`]/.test(fact[2] ?? '') && !/\b(and|then)\b/i.test(fact[4])) return { type: 'remember', fact: {
        subject: fact[1] ? 'self' : fact[2].trim(), attribute: attributeName(fact[3]), value: fact[4].trim(), source: original, channel: 'chat',
      } };
      if (/^(remember|save)\b/i.test(text) || fact) return clarify('Which fact should I save? For example: “Remember Rajesh’s phone number is 213132”.');
    }
  }
  if (discussion) return { type: 'general', query: original };
  const personal = (attributes.test(text) && /(?:[’']s\s|\b(?:my|your|his|her|their|saved|permanent)\b)/i.test(text)) || /\b(what (?:do you|have you) (?:know|remember|saved)|saved about|remember about)\b/i.test(text);
  const observed = activity.test(text);
  if (personal) {
    const possessive = /^(?:what(?: is|’s|'s)?|which|compare|tell me|show me|do you (?:know|have))?\s*(.+?)[’']s\s/i.exec(text);
    const factSubject = /\bmy\b/i.test(text) ? 'self' : possessive?.[1]?.trim();
    const factAttribute = attributes.exec(text)?.[1];
    return { type: observed ? 'mixed' : 'permanent', query: original, factSubject,
      factAttribute: factAttribute && !/saved|permanent/.test(factAttribute) ? attributeName(factAttribute) : undefined };
  }
  if (observed || /^(find|search|recall)\b/i.test(text)) return { type: 'activity', query: original };
  if (/^(explain|define|how (?:do|does|can|to)|what (?:is|are)|who is|write|translate|calculate)\b/i.test(text)) return { type: 'general', query: original };
  // Uncertain personal questions retain the activity path and can find saved facts too.
  return { type: 'mixed', query: original };
}

function response(body: string, intent: Intent['type'], source: Answer['source'] = 'none'): RoutedAnswer {
  return { body, intent, source, hits: [], retrieved: [], searchQuery: '', timings: { rewrite: 0, prepare: 0, model: 0 } };
}
export function formatFacts(facts: PersonalFact[]): string {
  // Render values as text rather than Markdown links or numeric activity citations.
  const literal = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&').replace(/\n/g, ' ');
  return facts.map(f => `${literal(f.subject === 'self' ? 'Your' : f.subject + '’s')} ${literal(f.attribute)}: ${literal(f.value)}. (Saved fact; ${new Date(f.updated_ms).toISOString().slice(0, 10)})`).join('\n\n');
}
export async function executeIntent(intent: Intent, history: ChatMessage[], services: IntentServices): Promise<RoutedAnswer> {
  if (intent.type === 'clarify') return { ...response(intent.question, intent.type), pendingIntent: intent.pending };
  if (intent.type === 'remember') {
    const page = await services.memories.recall(`${intent.fact.subject} ${intent.fact.attribute}`);
    if (page.next_offset !== null) throw new Error('Too many matching facts. Please specify the person and attribute more precisely.');
    const matches = page.items.filter(f => normalize(f.subject) === normalize(intent.fact.subject) && attributeName(f.attribute) === intent.fact.attribute);
    if (matches.length > 1) return response('More than one saved fact matches. Please specify the exact person and attribute.', 'clarify');
    const saved = matches[0] && matches[0].value !== intent.fact.value
      ? await services.memories.update(matches[0], intent.fact) : await services.memories.remember(intent.fact);
    return response(`Saved: ${formatFacts([saved])}`, intent.type, 'memory');
  }
  if (intent.type === 'schedule_create') {
    const saved = await services.schedules.create(services.newId(), intent.spec);
    const when = saved.timing.type === 'once' ? saved.timing.local_at.replace('T', ' at ') : `${saved.timing.type === 'daily' ? saved.timing.weekdays?.length ? saved.timing.weekdays.map(day => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1]).join(', ') : 'Daily' : 'After wake'} at ${saved.timing.time}`;
    return response(`${saved.action.type === 'task' ? 'Task' : 'Reminder'} saved: ${saved.title} — ${when} (${saved.timezone}).`, intent.type);
  }
  if (intent.type === 'schedule_manage' || intent.type === 'schedule_reschedule') {
    const page = await services.schedules.list();
    if (intent.type === 'schedule_manage' && intent.operation === 'list') return response(page.items.length ? page.items.map(s => `${s.title} (${s.status}; ID: ${s.id})`).join('\n\n') + (page.next_offset !== null ? '\n\nMore schedules are available in Scheduled Tasks.' : '') : 'You have no schedules.', intent.type);
    const matches = page.items.filter(s => s.id === intent.selector || normalize(s.title) === normalize(intent.selector));
    if (matches.length !== 1 || page.next_offset !== null) return response('Which schedule should I change? Please repeat the command with its exact title or ID.', 'clarify');
    // Get the current revision before mutation; conflicts/failures propagate without a success message.
    const current = await services.schedules.get(matches[0].id);
    if (intent.type === 'schedule_reschedule') {
      const saved = await services.schedules.update(current, { title: current.title, action: current.action, timezone: intent.timezone, timing: intent.timing });
      return response(`Schedule rescheduled: ${saved.title}.`, intent.type);
    }
    if (intent.operation === 'list') throw new Error('Unexpected schedule operation');
    const saved = await services.schedules[intent.operation](current);
    return response(`Schedule ${saved.status}: ${saved.title}.`, intent.type);
  }
  if (intent.type === 'permanent' || intent.type === 'mixed') {
    const page = await services.memories.recall([intent.factSubject, intent.factAttribute].filter(Boolean).join(' ') || intent.query.slice(0, 500));
    const facts = page.items.filter(f => (!intent.factSubject || normalize(f.subject) === normalize(intent.factSubject))
      && (!intent.factAttribute || attributeName(f.attribute) === intent.factAttribute));
    if (intent.type === 'permanent') return response(facts.length ? formatFacts(facts) + (page.next_offset !== null ? '\n\nMore matching saved facts are available.' : '') : page.next_offset !== null ? 'More saved facts may match. Please specify the person and attribute.' : 'I don’t have a saved fact matching that question.', intent.type, facts.length ? 'memory' : 'none');
    const answer = await services.answer(intent.query, history, facts);
    return { ...answer, intent: intent.type };
  }
  return { ...await services.answer(intent.query, history), intent: intent.type };
}
