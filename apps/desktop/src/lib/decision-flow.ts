/** When chat consults the decision model, and what it is allowed to see. Dependencies are injected so
 * the whole flow is tested with a fake provider; `answer.ts` binds the real ones. */
import { decide, DECIDE_LOCAL_TIMEOUT_MS, DECIDE_SYSTEM_PROMPT, DECIDE_TIMEOUT_MS, mayWrite, ROUTER_SHORT_PROMPT, type DecideCall, type DecisionContext } from './decide';
import type { Intent, RoutingContext } from './intent';
import { normalize } from './intent';
import type { MemoryService } from './memories';
import type { AiTarget } from './provider';
import type { ScheduleService } from './schedules';
import type { Preferences } from './storage';
import type { ChatMessage } from './types';

export interface DecisionDeps {
  preferences: Preferences;
  target: AiTarget;
  schedules: ScheduleService;
  memories: MemoryService;
  /** Throws when the provider is not set up; the flow then quietly uses the regex router. */
  ready(target: AiTarget): Promise<void>;
  call(target: AiTarget): DecideCall;
}

const SELF_CONTAINED = new Set<Intent['type']>(['schedule_create', 'remember']);

/** Whether the regex router already produced a write that needs nothing resolved. */
function confident(regex: Intent): boolean {
  return SELF_CONTAINED.has(regex.type) || ('confirmed' in regex && regex.confirmed === true);
}

/**
 * The decision model's proposal for this message, or `null` to use the regex router's result. `null` is
 * returned without any network call when the step is off, the message does not look like a write, or the
 * regex router is already sure. The step runs on the local model, with the fine-tuned routing adapter
 * (and the one-line prompt it was trained with) when one is set.
 */
export async function decideWrite(question: string, history: ChatMessage[], routing: RoutingContext, regex: Intent, deps: DecisionDeps): Promise<Intent | null> {
  const { preferences, target } = deps;
  if (!preferences.decideEnabled || preferences.sampleMode) return null;
  const pending = routing.pending;
  // A regex-owned draft or a yes/no question is resumed by the regex router, never the model.
  if (pending?.type === 'schedule' || pending?.type === 'confirm') return null;
  if (pending?.type !== 'decision' && !mayWrite(question)) return null;
  if (confident(regex)) return null;
  try {
    await deps.ready(target);
    const [schedulePage, factPage] = await Promise.all([deps.schedules.list({ limit: 100 }), deps.memories.search({ limit: 100 })]);
    // A management command that already names exactly one schedule needs no model.
    if (regex.type === 'schedule_manage' && (regex.operation === 'list' || schedulePage.items.filter(s => s.id === regex.selector || normalize(s.title) === normalize(regex.selector)).length === 1)) return null;
    const ctx: DecisionContext = {
      now: routing.now, timezone: routing.timezone, pending,
      schedules: schedulePage.items.map(s => ({ id: s.id, title: s.title, status: s.status, timing: s.timing, timezone: s.timezone, next_due_local: s.next_due_local })),
      // Subject and attribute only. Values stay on this Mac.
      facts: factPage.items.map(f => ({ subject: f.subject, attribute: f.attribute })),
      recent: history.slice(-4).map(m => ({ role: m.role, content: m.body })),
    };
    const result = await decide(question, ctx, deps.call(target), target.local ? DECIDE_LOCAL_TIMEOUT_MS : DECIDE_TIMEOUT_MS, target.adapter ? ROUTER_SHORT_PROMPT : DECIDE_SYSTEM_PROMPT);
    if (result === null) return null;
    if (result === 'answer') return regex.type === 'clarify' || regex.type.startsWith('schedule_') ? { type: 'mixed', query: question } : null;
    return result;
  } catch {
    return null;
  }
}
