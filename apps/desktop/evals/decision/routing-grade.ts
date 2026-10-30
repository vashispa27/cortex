// Scoring for the routing dataset (evals/routing/*.jsonl). Pure, so it is unit tested without a model.
// The model's raw `decide` arguments and the expected ones both go through the app's own validation
// (resolveDecision), and the resulting intents are compared. Wording (reminder text, clarify question)
// is not graded; what Cortex would do is.
import { resolveDecision, type DecisionContext } from "../../src/lib/decide";
import type { Intent, PendingIntent } from "../../src/lib/intent";

export type Situation = {
  now: string; timezone: string;
  schedules: { id: string; title: string; status: string; timing: unknown; timezone: string; next: string | null }[];
  facts: { subject: string; attribute: string }[];
  recent_turns: { role: "user" | "assistant"; content: string }[];
  pending_draft: Record<string, unknown> | null;
};
export type Row = { id: string; kind: string; scenario: string; situation: Situation; message: string; expected: Record<string, unknown> };
export type Resolved = Intent | "answer" | null;
export type Result = { id: string; kind: string; message: string; expected: Record<string, unknown>; raw: unknown; error?: string; ok: boolean; actionOk: boolean; wrongWrite: boolean; got: string; latencyMs: number };

export function contextOf(s: Situation): DecisionContext {
  return {
    now: new Date(s.now), timezone: s.timezone,
    schedules: s.schedules.map(({ next, ...rest }) => ({ ...rest, timing: rest.timing as DecisionContext["schedules"][number]["timing"], next_due_local: next })),
    facts: s.facts, recent: s.recent_turns,
    ...(s.pending_draft ? { pending: { type: "decision", draft: s.pending_draft } as PendingIntent } : {}),
  };
}

/** Short name for what Cortex would do; also used for the "got" column. */
export function labelOf(r: Resolved): string {
  if (r === null) return "invalid";
  if (r === "answer") return "answer";
  if (r.type === "schedule_manage") return r.operation;
  return r.type;
}

const WRITES = new Set(["schedule_create", "schedule_update", "schedule_snooze", "pause", "resume", "cancel", "remember"]);
const minutes = (local: string) => Date.parse(`${local}:00Z`) / 60_000;
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

function sameTiming(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return a === b;
  const { local_at: atA, start_local: _sa, ...restA } = a as Record<string, unknown>;
  const { local_at: atB, start_local: _sb, ...restB } = b as Record<string, unknown>;
  if ((atA === undefined) !== (atB === undefined)) return false;
  // "in 45 mins" can land a minute either side depending on rounding.
  if (typeof atA === "string" && typeof atB === "string" && Math.abs(minutes(atA) - minutes(atB)) > 1) return false;
  const norm = (t: Record<string, unknown>) => JSON.stringify(Object.keys(t).sort().map(k => [k, Array.isArray(t[k]) ? [...(t[k] as number[])].sort() : t[k]]));
  return norm(restA) === norm(restB);
}

/** Does the model's resolved intent do the same thing as the expected one? `facts` decides whether a new
 *  fact's attribute name matters: it does only when that person already has a fact by the expected name
 *  (a different name would add a second record instead of updating). "employer" for "company" is fine
 *  otherwise. */
export function sameOutcome(got: Resolved, want: Resolved, facts: Situation["facts"] = []): boolean {
  if (got === null || want === null) return false;
  if (got === "answer" || want === "answer") return got === want;
  if (got.type !== want.type) return false;
  switch (want.type) {
    case "clarify": return true;
    case "schedule_create": {
      const g = got as typeof want;
      return g.spec.action.type === want.spec.action.type && sameTiming(g.spec.timing, want.spec.timing);
    }
    case "schedule_update": {
      const g = got as typeof want;
      if (g.selector !== want.selector) return false;
      if (want.change.timing !== undefined && !sameTiming(g.change.timing, want.change.timing)) return false;
      return Object.keys(want.change).every(k => k in g.change);
    }
    case "schedule_snooze": { const g = got as typeof want; return g.selector === want.selector && g.minutes === want.minutes; }
    case "schedule_manage": { const g = got as typeof want; return g.operation === want.operation && g.selector === want.selector; }
    case "remember": {
      const g = got as typeof want;
      const existing = facts.some(f => lower(f.subject) === lower(want.fact.subject) && lower(f.attribute) === lower(want.fact.attribute));
      return lower(g.fact.subject) === lower(want.fact.subject) && lower(g.fact.value) === lower(want.fact.value)
        && (!existing || lower(g.fact.attribute) === lower(want.fact.attribute));
    }
    default: return false;
  }
}

export function gradeRow(row: Row, raw: unknown, latencyMs: number, error?: string): Result {
  const ctx = contextOf(row.situation);
  const want = resolveDecision(row.expected, ctx, row.message);
  const got = error ? null : resolveDecision(raw, ctx, row.message);
  const ok = sameOutcome(got, want, row.situation.facts);
  const rawAction = raw && typeof raw === "object" ? (raw as Record<string, unknown>).action : undefined;
  return {
    id: row.id, kind: row.kind, message: row.message, expected: row.expected, raw, ...(error ? { error } : {}),
    ok, actionOk: rawAction === row.expected.action,
    // Anything saved or changed that is not exactly what the user asked for.
    wrongWrite: !ok && WRITES.has(labelOf(got)),
    got: labelOf(got), latencyMs,
  };
}

const pct = (c: number, t: number) => (t ? `${Math.round((100 * c) / t)}% (${c}/${t})` : "n/a");

export function report(results: Result[], model: string, dataset: string): string {
  const kinds = [...new Set(results.map(r => r.kind))];
  const lat = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const q = (p: number) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0;
  const rows = [
    `Routing baseline: ${model} on ${dataset}`,
    `Correct: ${pct(results.filter(r => r.ok).length, results.length)}`,
    `Right action chosen (ignoring details): ${pct(results.filter(r => r.actionOk).length, results.length)}`,
    `Wrong writes (must be 0): ${results.filter(r => r.wrongWrite).length}`,
    `Invalid or failed outputs: ${results.filter(r => r.got === "invalid").length}`,
    `Latency p50/p90: ${q(0.5)} / ${q(0.9)} ms`,
    "",
    "Per kind:",
    ...kinds.map(k => { const rs = results.filter(r => r.kind === k); return `  ${k.padEnd(24)} ${pct(rs.filter(r => r.ok).length, rs.length)}`; }),
  ];
  const wrong = results.filter(r => r.wrongWrite);
  if (wrong.length) rows.push("", "Wrong writes:", ...wrong.map(r => `  ${r.id} ${JSON.stringify(r.message)} -> ${r.got} ${JSON.stringify(r.raw)}`));
  return rows.join("\n");
}
