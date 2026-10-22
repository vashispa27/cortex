// Runs every gold question through the page's real answer flow (rewrite -> /v1/assistant/prepare ->
// model with the read-only search_memory tool loop -> SOURCE parsing) and records what came back.
// Nothing here judges the answers; judge.eval.ts does that from the file this writes.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, it } from "vitest";
import { answerFromMemory } from "../src/lib/answer";
import type { ChatMessage } from "../src/lib/types";
import { doneIds, loadGold, PRIVATE, startRig, stopRig } from "./harness";

export type AnswerRecord = {
  id: string;
  query: string;
  answer: string | null;
  source: string | null;
  hit_ids: number[];
  /** Snapshots retrieval returned, even when the model tagged the answer `none` (then `hit_ids` is empty). */
  retrieved_ids: number[];
  /** The query searched: the question itself, or the model's rewrite of a follow-up. */
  search_query: string | null;
  timings_ms: { rewrite: number; prepare: number; model: number } | null;
  error: string | null;
  model: string;
};

const OUT = process.env.EVAL_ANSWERS ?? join(PRIVATE, "answers", `${process.env.EVAL_RUN ?? "run"}.jsonl`);

beforeAll(async () => { await startRig(); });
afterAll(() => stopRig());

it("answers the gold questions", async () => {
  mkdirSync(dirname(OUT), { recursive: true });
  const done = doneIds(OUT);
  const todo = loadGold().filter((q) => !done.has(q.id));
  const model = process.env.EVAL_PROVIDER === "local" ? (process.env.EVAL_LOCAL_MODEL ?? process.env.EVAL_MODEL ?? "") : (process.env.EVAL_MODEL ?? "");
  console.log(`answering ${todo.length} questions (${done.size} already in ${OUT}) with ${model || "(no model set)"}`);
  for (const [i, q] of todo.entries()) {
    // The chat sends earlier turns as ChatMessage objects; gold stores them as {role, content}.
    const history: ChatMessage[] = q.history.map((turn) => ({ role: turn.role, body: turn.content }));
    let record: AnswerRecord;
    try {
      const a = await answerFromMemory(q.query, history);
      record = { id: q.id, query: q.query, answer: a.body, source: a.source, hit_ids: a.hits.map((h) => h.snapshot_id), retrieved_ids: a.retrieved.map((h) => h.snapshot_id), search_query: a.searchQuery, timings_ms: a.timings, error: null, model };
    } catch (error) {
      record = { id: q.id, query: q.query, answer: null, source: null, hit_ids: [], retrieved_ids: [], search_query: null, timings_ms: null, error: error instanceof Error ? error.message : String(error), model };
    }
    appendFileSync(OUT, JSON.stringify(record) + "\n");
    console.log(`[${i + 1}/${todo.length}] ${q.id} ${record.error ? "ERROR " + record.error : record.source}`);
  }
});
