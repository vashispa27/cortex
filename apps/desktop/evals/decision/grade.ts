// Scoring for the decision-model eval. Pure, so it is unit tested without a model.
import type { Intent } from "../../src/lib/intent";
import type { Case, Label } from "./cases";

export type Outcome = Intent | "answer" | null;
export type Graded = { message: string; expect: Label; got: Label | "fallback"; labelOk: boolean; timingOk: boolean | null; detailOk: boolean | null; note: string };

/** What the page would do with this outcome. A veto or fallback writes nothing, so it counts as an answer. */
export function labelOf(outcome: Outcome): Label {
  if (outcome === null || outcome === "answer") return "answer";
  switch (outcome.type) {
    case "schedule_manage": return outcome.operation === "list" ? "list" : outcome.operation;
    case "schedule_reschedule": return "schedule_update";
    case "schedule_create": case "schedule_update": case "schedule_snooze": case "clarify": case "remember": return outcome.type;
    default: return "answer";
  }
}

const subset = (actual: unknown, want: unknown): boolean => {
  if (want && typeof want === "object" && !Array.isArray(want)) return !!actual && typeof actual === "object" && Object.entries(want).every(([k, v]) => subset((actual as Record<string, unknown>)[k], v));
  return JSON.stringify(actual) === JSON.stringify(want);
};
const minutes = (local: string) => Date.parse(`${local}:00Z`) / 60_000;

function timingOf(outcome: Outcome): Record<string, unknown> | undefined {
  if (outcome && outcome !== "answer") {
    if (outcome.type === "schedule_create") return outcome.spec.timing as unknown as Record<string, unknown>;
    if (outcome.type === "schedule_update") return outcome.change.timing as unknown as Record<string, unknown> | undefined;
  }
  return undefined;
}

export function grade(testCase: Case, outcome: Outcome): Graded {
  const got = labelOf(outcome);
  const labelOk = got === testCase.expect;
  let timingOk: boolean | null = null;
  let detailOk: boolean | null = null;
  const notes: string[] = [];
  if (labelOk && testCase.timing) {
    const actual = timingOf(outcome);
    const { local_at: wantAt, ...rest } = testCase.timing as { local_at?: string };
    timingOk = !!actual && subset(actual, rest);
    if (wantAt !== undefined) {
      const gotAt = (actual as { local_at?: string } | undefined)?.local_at;
      timingOk = timingOk && !!gotAt && Math.abs(minutes(gotAt) - minutes(wantAt)) <= (testCase.toleranceMinutes ?? 0);
    }
    if (!timingOk) notes.push(`timing ${JSON.stringify(actual)}`);
  }
  if (labelOk && outcome && outcome !== "answer") {
    const checks: boolean[] = [];
    if (testCase.scheduleId && "selector" in outcome) checks.push(outcome.selector === testCase.scheduleId);
    if (testCase.minutes && outcome.type === "schedule_snooze") checks.push(outcome.minutes === testCase.minutes);
    if (testCase.fact && outcome.type === "remember") checks.push(subset({ subject: outcome.fact.subject.toLowerCase(), attribute: outcome.fact.attribute, value: outcome.fact.value }, { subject: testCase.fact.subject.toLowerCase(), attribute: testCase.fact.attribute, value: testCase.fact.value }));
    if (testCase.action && outcome.type === "schedule_create") checks.push(outcome.spec.action.type === testCase.action);
    if (checks.length) { detailOk = checks.every(Boolean); if (!detailOk) notes.push(`detail ${JSON.stringify(outcome)}`); }
  }
  return { message: testCase.message, expect: testCase.expect, got: outcome === null ? "fallback" : got, labelOk, timingOk, detailOk, note: notes.join("; ") };
}

export type Summary = { perLabel: Record<string, { total: number; correct: number }>; accuracy: number; timing: { total: number; correct: number }; details: { total: number; correct: number }; falseWrites: number; misses: Graded[] };

/** `falseWrites`: cases that must not write but proposed a write. This is the number to keep at zero. */
export function summarize(results: Graded[]): Summary {
  const perLabel: Summary["perLabel"] = {};
  for (const r of results) {
    const row = (perLabel[r.expect] ??= { total: 0, correct: 0 });
    row.total++; if (r.labelOk) row.correct++;
  }
  const timed = results.filter(r => r.timingOk !== null);
  const detailed = results.filter(r => r.detailOk !== null);
  return {
    perLabel,
    accuracy: results.filter(r => r.labelOk).length / (results.length || 1),
    timing: { total: timed.length, correct: timed.filter(r => r.timingOk).length },
    details: { total: detailed.length, correct: detailed.filter(r => r.detailOk).length },
    falseWrites: results.filter(r => r.expect === "answer" && !["answer", "fallback"].includes(r.got) && !["clarify", "list"].includes(r.got)).length,
    misses: results.filter(r => !r.labelOk || r.timingOk === false || r.detailOk === false),
  };
}

export function report(summary: Summary, model: string): string {
  const pct = (a: number, b: number) => b ? `${((a / b) * 100).toFixed(0)}% (${a}/${b})` : "n/a";
  const rows = Object.entries(summary.perLabel).map(([label, v]) => `  ${label.padEnd(18)} ${pct(v.correct, v.total)}`);
  return [
    `Decision model eval · ${model}`,
    `Overall label accuracy: ${pct(Object.values(summary.perLabel).reduce((n, v) => n + v.correct, 0), Object.values(summary.perLabel).reduce((n, v) => n + v.total, 0))}`,
    "Per expected action:", ...rows,
    `Timing correct (creates/updates that got the right action): ${pct(summary.timing.correct, summary.timing.total)}`,
    `Target ids / fact fields / snooze minutes correct: ${pct(summary.details.correct, summary.details.total)}`,
    `False writes on must-not-write phrasings: ${summary.falseWrites}`,
    summary.misses.length ? "Misses:" : "No misses.",
    ...summary.misses.map(m => `  - ${JSON.stringify(m.message)} expected ${m.expect}, got ${m.got}${m.note ? ` (${m.note})` : ""}`),
  ].join("\n");
}
