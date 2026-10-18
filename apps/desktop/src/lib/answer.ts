import { invoke } from "@tauri-apps/api/core";
import { retrieveMemory, type MemoryHit } from "./api";
import { loadPreferences } from "./storage";
import type { ChatMessage } from "./types";

export async function answerFromMemory(question: string, history: ChatMessage[]): Promise<{ body: string; hits: MemoryHit[] }> {
  const model = loadPreferences().openrouterModel.trim();
  if (!model) throw new Error("Add your OpenRouter model in Settings → AI model.");
  if (!await invoke<boolean>("openrouter_has_key")) throw new Error("Add your OpenRouter API key in Settings → AI model.");
  // One natural-language query goes to the same Model2Vec + Qdrant hybrid
  // retrieval and evidence preparation used by Open Memory. No UI-side token
  // search, application-specific ranking, or unrelated recent-screen fallback.
  const prior = history.slice(-12).map((m) => ({ role: m.role, content: m.body.slice(0, 4000) }));
  const query = prior.length ? await invoke<string>("openrouter_search_query", { model, question, history: prior }) : question;
  const result = await retrieveMemory(query);
  if (result.abstained || !result.results.length) {
    return { body: "I couldn't find a clear match for that yet. Can you give me another detail?", hits: [] };
  }
  const context = result.sources.map((source) => source.text).join("\n\n");
  const body = await invoke<string>("openrouter_answer", {
    model, question, context: context || "No captured evidence available.", history: prior,
  });
  return { body, hits: result.results };
}
