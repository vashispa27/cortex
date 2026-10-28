// Scores a finished answers file (answers.eval.ts) with an LLM judge plus deterministic checks.
//   EVAL_RUN=<run> npm run eval:judge
// Default judge: Jev (TypeSafe's classifier on OpenRouter, model ~typesafe/jev-latest). It answers typed
// questions (a three-way choice plus yes/no checks) with probabilities, no prose, so verdicts are consistent.
// Chat-model judge instead: EVAL_JUDGE_KIND=chat EVAL_JUDGE_MODEL=<model> (add EVAL_JUDGE_PROVIDER=local
// EVAL_JUDGE_ENDPOINT=http://127.0.0.1:8080/v1 for a local one).
// The judge sees the question, the reference facts and the reply, so with OpenRouter that text leaves
// this Mac. Use a local chat judge when the gold set holds real people's details you do not want to send.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, it } from "vitest";
import { bridgeCall, doneIds, loadGold, PRIVATE, startRig, stopRig, type GoldQuestion } from "./harness";
import { deterministic, jevRequest, judgeMessages, parseJev, parseVerdict, type Deterministic, type Verdict } from "./judge-lib";
import type { AnswerRecord } from "./answers.eval";

const ANSWERS = process.env.EVAL_ANSWERS ?? join(PRIVATE, "answers", `${process.env.EVAL_RUN ?? "run"}.jsonl`);
const OUT = ANSWERS.replace(/\.jsonl$/, ".judged.jsonl");
const REPORT = ANSWERS.replace(/\.jsonl$/, ".report.md");
const KIND = process.env.EVAL_JUDGE_KIND === "chat" ? "chat" : "jev";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? (KIND === "jev" ? "~typesafe/jev-latest" : "");
const JUDGE_ENDPOINT = process.env.EVAL_JUDGE_PROVIDER === "local" ? (process.env.EVAL_JUDGE_ENDPOINT ?? "http://127.0.0.1:8080/v1") : null;

type Judged = { id: string; family: string; behavior: string; split: string; variant: boolean; source: string | null; error: string | null; det: Deterministic | null; judge: Verdict | null; judge_error: string | null; judge_model: string };

beforeAll(async () => {
  if (!JUDGE_MODEL) throw new Error("Set EVAL_JUDGE_MODEL for the chat judge (an OpenRouter model, or a local model name with EVAL_JUDGE_PROVIDER=local).");
  if (!existsSync(ANSWERS)) throw new Error(`No answers file at ${ANSWERS}. Run npm run eval:answers first.`);
  await startRig({ engine: false });
});
afterAll(() => stopRig());

async function judgeOne(q: GoldQuestion, answer: string): Promise<{ verdict: Verdict | null; error: string | null }> {
  if (KIND === "jev") {
    const { model, state, questions } = jevRequest(q, answer, JUDGE_MODEL);
    try {
      const response = await bridgeCall<unknown>("openrouter_decide", { model, state, questions });
      const verdict = parseJev(response);
      return verdict ? { verdict, error: null } : { verdict: null, error: `unexpected Jev response: ${JSON.stringify(response).slice(0, 300)}` };
    } catch (error) {
      return { verdict: null, error: error instanceof Error ? error.message : String(error) };
    }
  }
  let messages = judgeMessages(q, answer);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await bridgeCall<string>("openrouter_complete", { model: JUDGE_MODEL, messages, maxTokens: 400, temperature: 0, endpoint: JUDGE_ENDPOINT });
      const verdict = parseVerdict(raw);
      if (verdict) return { verdict, error: null };
      messages = [...messages.slice(0, 1), { role: "user", content: `${messages[1].content}\n\n(Reminder: reply with only the JSON object.)` }];
    } catch (error) {
      if (attempt === 1) return { verdict: null, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { verdict: null, error: "judge reply was not valid JSON twice" };
}

it("judges the recorded answers", async () => {
  const gold = new Map(loadGold().map((q) => [q.id, q]));
  const answers = readFileSync(ANSWERS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AnswerRecord).filter((a) => gold.has(a.id));
  const done = doneIds(OUT);
  for (const [i, a] of answers.filter((x) => !done.has(x.id)).entries()) {
    const q = gold.get(a.id)!;
    let row: Judged = { id: q.id, family: q.family, behavior: q.expected_behavior, split: q.split, variant: Boolean(q.variant_of), source: a.source, error: a.error, det: null, judge: null, judge_error: null, judge_model: JUDGE_MODEL };
    if (a.answer !== null) {
      row.det = deterministic(q, a.answer, a.source, a.hit_ids);
      const j = await judgeOne(q, a.answer);
      row = { ...row, judge: j.verdict, judge_error: j.error };
    }
    appendFileSync(OUT, JSON.stringify(row) + "\n");
    console.log(`[${i + 1}] ${q.id} ${row.judge?.verdict ?? row.judge_error ?? row.error}`);
  }
  const rows = readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Judged);
  writeFileSync(REPORT, report(rows, gold));
  console.log(`report: ${REPORT}`);
});

function pct(n: number, d: number): string { return d ? `${((100 * n) / d).toFixed(0)}%` : "-"; }

function table(rows: Judged[], key: (r: Judged) => string): string {
  const groups = new Map<string, Judged[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  const lines = ["| group | n | correct | partial | incorrect | facts all present | source tag ok | cited support |", "|---|---|---|---|---|---|---|---|"];
  for (const [k, g] of [...groups].sort()) {
    const c = (v: string) => g.filter((r) => r.judge?.verdict === v).length;
    const withFacts = g.filter((r) => r.det && r.det.facts_total > 0);
    const supported = g.filter((r) => r.behavior === "memory" || r.behavior === "mixed");
    lines.push(`| ${k} | ${g.length} | ${pct(c("correct"), g.length)} | ${pct(c("partial"), g.length)} | ${pct(c("incorrect"), g.length)} | ${pct(withFacts.filter((r) => r.det!.all_facts).length, withFacts.length)} | ${pct(g.filter((r) => r.det?.source_ok).length, g.length)} | ${pct(supported.filter((r) => r.det?.cited_support).length, supported.length)} |`);
  }
  return lines.join("\n");
}

function report(rows: Judged[], gold: Map<string, GoldQuestion>): string {
  const errored = rows.filter((r) => r.error || r.judge_error);
  const scored = rows.filter((r) => r.judge);
  // Where the cheap string check and the judge disagree is where to read replies by hand.
  const disagree = scored.filter((r) => (r.behavior === "memory" && r.det?.all_facts && r.judge!.verdict === "incorrect") || (r.behavior === "memory" && !r.det?.all_facts && r.judge!.verdict === "correct"));
  return [
    `# Answer eval report`,
    ``,
    `answers judged: ${scored.length} of ${rows.length} (${errored.length} with an answer or judge error). Judge: ${rows[0]?.judge_model ?? JUDGE_MODEL}.`,
    ``, `## By expected behavior`, table(scored, (r) => r.behavior),
    ``, `## By family`, table(scored, (r) => r.family),
    ``, `## By split`, table(scored, (r) => r.split),
    ``, `## Clean vs noisy`, table(scored, (r) => (r.variant ? "noisy" : "clean")),
    ``, `## Read these by hand (string check and judge disagree)`,
    ...disagree.map((r) => `- ${r.id} (${gold.get(r.id)?.query}) judge=${r.judge!.verdict}${r.judge!.reason ? ": " + r.judge!.reason : ""}`),
    ``, `## Low-confidence verdicts (Jev confidence under 0.7)`,
    ...scored.filter((r) => (r.judge!.confidence ?? 1) < 0.7).map((r) => `- ${r.id} (${gold.get(r.id)?.query}) judge=${r.judge!.verdict} confidence=${r.judge!.confidence}`),
    ``, `## Wrong answer mentioned`,
    ...scored.filter((r) => r.det?.wrong_answer_mentioned).map((r) => `- ${r.id} judge=${r.judge!.verdict}`),
    ``, `## Errors`,
    ...errored.map((r) => `- ${r.id}: ${r.error ?? r.judge_error}`),
  ].join("\n");
}
