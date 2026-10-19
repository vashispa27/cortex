import { invoke } from "@tauri-apps/api/core";
import { prepareAssistantRequest, type HistoryTurn, type MemoryHit } from "./api";
import { aiTarget, ensureReady } from "./provider";
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
  // A reply that is only the tag has no answer; the caller retries rather than showing "SOURCE: none".
  if (source) return { source, body: rest.join("\n").trim() };
  const body = raw.trim();
  if (/\[\d+\]/.test(body)) return { source: "memory", body };
  return { source: evidenceShown ? "none" : "general", body };
}

const BARE_TAG_REMINDER = "(Reminder: after the SOURCE line, write the full answer in sentences. If nothing was found, say what you could not find.)";

const FOLLOW_UP = /\b(it|its|that|this|those|these|they|them|their|he|she|him|her|his|hers|there|then|same|again|also|other|another|more|former|latter|one)\b/i;

/** The history rewrite is a second cloud call; skip it when the question can stand alone. */
export function needsRewrite(question: string, history: unknown[]): boolean {
  if (!history.length) return false;
  const words = question.trim().split(/\s+/).length;
  return words <= 6 || FOLLOW_UP.test(question);
}

/** Small models sometimes answer the rewrite prompt instead of rewriting, or invent a subject. */
export function acceptableRewrite(rewrite: string, question: string): boolean {
  const text = rewrite.trim();
  if (!text || text.length > Math.max(300, question.length * 4)) return false;
  if (/^(no|yes|sorry|i|i'm|as an ai|unfortunately)\b/i.test(text)) return false;
  return !/\b(i do not|i don't|i cannot|i can't|i can only|i am unable|as an ai)\b/i.test(text);
}

/** Without a usable rewrite, keep the entities of the last question next to the follow-up so retrieval still has them. */
export function fallbackQuery(question: string, history: HistoryTurn[]): string {
  const previous = [...history].reverse().find((turn) => turn.role === "user")?.content.replace(/\s+/g, " ").trim().slice(0, 300);
  return previous ? `${previous} ${question}` : question;
}

export async function answerFromMemory(question: string, history: ChatMessage[]): Promise<Answer> {
  const target = aiTarget(loadPreferences());
  await ensureReady(target);
  const { model, endpoint } = target;
  // A summarized selection keeps more of its text, so follow-ups such as "shorter" still see it.
  const prior: HistoryTurn[] = history.filter((m) => !(m.role === "assistant" && m.body.startsWith("Rewind could not"))).slice(-12).map((m) => ({ role: m.role, content: m.body.slice(0, m.kind === "summarize" ? 12_000 : 3000) }));
  let t = performance.now();
  // One natural-language query goes to the same Model2Vec + Qdrant hybrid retrieval and evidence
  // preparation used by Rewind. No UI-side token search, application-specific ranking, or fallback.
  let query = question;
  // What the answering model is told the question means; only set when a rewrite was accepted.
  let meaning = "";
  if (needsRewrite(question, prior)) {
    // "Him", "that" and "there" almost always point at the last exchange. Showing the rewriter the
    // whole chat lets it grab an earlier person instead (it picked the first-mentioned one in testing).
    const rewritten = await invoke<string>("openrouter_search_query", { model, question, history: prior.slice(-2), endpoint }).catch(() => "");
    if (acceptableRewrite(rewritten, question)) { query = rewritten.trim(); meaning = query; }
    else query = fallbackQuery(question, prior);
  }
  const rewrite = performance.now() - t;
  t = performance.now();
  // The model always sees the question, with whatever evidence was found (possibly flagged weak or
  // empty), and decides whether it is about the user's memory, general knowledge, or both.
  // The model keeps the user's own words and also sees how the follow-up was resolved, because with a
  // longer chat it otherwise tends to attach "him" to an earlier person.
  const shown = meaning && meaning !== question ? `${question}\n(Meaning: ${meaning})` : question;
  const request = await prepareAssistantRequest(query, shown, prior);
  const prepare = performance.now() - t;
  t = performance.now();
  // The shell runs the model's read-only tool calls (a bounded loop) and returns the final reply.
  const chat = (messages: typeof request.messages) => invoke<{ content: string; hits?: MemoryHit[] }>("openrouter_chat", { model, messages, endpoint });
  let reply = await chat(request.messages);
  let raw = reply.content;
  // Small models sometimes stop after the SOURCE line. Ask once more, with a reminder on the question.
  if (!parseSource(raw, true).body) {
    const last = request.messages.length - 1;
    const nudged = request.messages.map((m, i) => i === last ? { ...m, content: `${BARE_TAG_REMINDER}\n\n${m.content}` } : m);
    reply = await chat(nudged);
    raw = reply.content;
    if (!parseSource(raw, true).body) throw new Error("The model replied with only a source tag and no answer. Try again, or pick a larger model in Settings → AI model.");
  }
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
