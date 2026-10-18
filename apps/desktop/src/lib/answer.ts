import { invoke } from "@tauri-apps/api/core";
import { prepareAssistantRequest, type HistoryTurn, type MemoryHit } from "./api";
import { loadPreferences } from "./storage";
import type { AnswerSource, ChatMessage } from "./types";

export type Answer = {
  body: string;
  hits: MemoryHit[];
  source: AnswerSource;
  /** Milliseconds spent rewriting the follow-up, preparing (retrieval) and waiting for the model. */
  timings: { rewrite: number; prepare: number; model: number };
};

const SOURCES: readonly AnswerSource[] = ["memory", "general", "mixed", "none"];

/** Splits the model's leading `SOURCE: x` line from its answer. A missing tag is inferred:
 *  cited snapshot IDs mean memory, and with no evidence shown the answer is general knowledge. */
export function parseSource(raw: string, evidenceShown: boolean): { source: AnswerSource; body: string } {
  const [first, ...rest] = raw.trimStart().split("\n");
  const tag = /^`?\s*SOURCE:\s*(\w+)\s*`?$/i.exec(first.trim())?.[1]?.toLowerCase();
  const source = SOURCES.find((item) => item === tag);
  if (source) return { source, body: rest.join("\n").trim() || raw.trim() };
  const body = raw.trim();
  if (/\[\d+\]/.test(body)) return { source: "memory", body };
  return { source: evidenceShown ? "none" : "general", body };
}

const FOLLOW_UP = /\b(it|its|that|this|those|these|they|them|their|he|she|him|her|his|hers|there|then|same|again|also|other|another|more|former|latter|one)\b/i;

/** The history rewrite is a second cloud call; skip it when the question can stand alone. */
export function needsRewrite(question: string, history: unknown[]): boolean {
  if (!history.length) return false;
  const words = question.trim().split(/\s+/).length;
  return words <= 6 || FOLLOW_UP.test(question);
}

export async function answerFromMemory(question: string, history: ChatMessage[]): Promise<Answer> {
  const model = loadPreferences().openrouterModel.trim();
  if (!model) throw new Error("Add your OpenRouter model in Settings → AI model.");
  if (!await invoke<boolean>("openrouter_has_key")) throw new Error("Add your OpenRouter API key in Settings → AI model.");
  const prior: HistoryTurn[] = history.slice(-12).map((m) => ({ role: m.role, content: m.body.slice(0, 3000) }));
  let t = performance.now();
  // One natural-language query goes to the same Model2Vec + Qdrant hybrid retrieval and evidence
  // preparation used by Rewind. No UI-side token search, application-specific ranking, or fallback.
  const query = needsRewrite(question, prior) ? await invoke<string>("openrouter_search_query", { model, question, history: prior }) : question;
  const rewrite = performance.now() - t;
  t = performance.now();
  // The model always sees the question, with whatever evidence was found (possibly flagged weak or
  // empty), and decides whether it is about the user's memory, general knowledge, or both.
  const request = await prepareAssistantRequest(query, question, prior);
  const prepare = performance.now() - t;
  t = performance.now();
  // The shell runs the model's read-only tool calls (a bounded loop) and returns the final reply.
  const reply = await invoke<{ content: string; hits?: MemoryHit[] }>("openrouter_chat", { model, messages: request.messages });
  const raw = reply.content;
  const model_ = performance.now() - t;
  const toolHits = reply.hits ?? [];
  const { source, body } = parseSource(raw, request.sources.length > 0 || toolHits.length > 0);
  const found = [...request.results, ...toolHits];
  return {
    body,
    source,
    hits: source === "memory" || source === "mixed" ? found.filter((hit, i) => found.findIndex((other) => other.snapshot_id === hit.snapshot_id) === i) : [],
    timings: { rewrite, prepare, model: model_ },
  };
}
