import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerFromMemory } from "./answer";
import { retrieveMemory } from "./api";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./api", () => ({ retrieveMemory: vi.fn() }));
vi.mock("./storage", () => ({ loadPreferences: () => ({ openrouterModel: "example/model" }) }));
const hit = { snapshot_id: 42, observed_ms: 0, app_id: "example.app", title: "Plan", excerpt: "excerpt", evidence_available: true, truncated: false };
describe("shared semantic memory answers", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("sends the whole question once and preserves backend ranking, prepared evidence, and chat history", async () => {
    vi.mocked(invoke).mockImplementation(async (command) => command === "openrouter_has_key" ? true : command === "openrouter_search_query" ? "What did I ask about the launch in Example?" : "The launch is Monday.");
    vi.mocked(retrieveMemory).mockResolvedValue({ results: [hit], sources: [{ id: 42, text: "Launch is on Monday. URL=https://example.test/plan" }], abstained: false, retrieval: { engine: "qdrant_edge_hybrid", dense: true, bm25: true, fusion: "rrf", candidates: 40 } });
    const question = "What did I ask about the launch in Example?";
    const answer = await answerFromMemory(question, [{ role: "user", body: "Tell me about the plan" }]);
    expect(retrieveMemory).toHaveBeenCalledExactlyOnceWith(question);
    expect(answer.hits).toEqual([hit]);
    expect(invoke).toHaveBeenCalledWith("openrouter_answer", { model: "example/model", question, context: "Launch is on Monday. URL=https://example.test/plan", history: [{ role: "user", content: "Tell me about the plan" }] });
  });
  it("resolves follow-ups before semantic retrieval without app-specific code", async () => {
    vi.mocked(invoke).mockImplementation(async (command) => command === "openrouter_has_key" ? true : command === "openrouter_search_query" ? "When did Mira reply in Example?" : "Friday.");
    vi.mocked(retrieveMemory).mockResolvedValue({ results: [hit], sources: [{id:42,text:"Friday"}], abstained: false, retrieval: { engine: "qdrant_edge_hybrid", dense: true, bm25: true, fusion: "rrf", candidates: 4 } });
    await answerFromMemory("What date?", [{role:"user",body:"What did Mira say in Example?"}]);
    expect(retrieveMemory).toHaveBeenCalledExactlyOnceWith("When did Mira reply in Example?");
  });
  it("surfaces semantic engine failures without falling back to keyword search", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    vi.mocked(retrieveMemory).mockRejectedValue(new Error("Qdrant unavailable"));
    await expect(answerFromMemory("What happened?", [])).rejects.toThrow("Qdrant unavailable");
    expect(invoke).not.toHaveBeenCalledWith("openrouter_answer", expect.anything());
  });
  it("respects the shared engine's weak-match decision", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    vi.mocked(retrieveMemory).mockResolvedValue({ results: [hit], sources: [], abstained: true, retrieval: { engine: "qdrant_edge_hybrid", dense: true, bm25: true, fusion: "rrf", candidates: 40 } });
    const answer = await answerFromMemory("Unknown person", []);
    expect(answer.hits).toEqual([]);
    expect(invoke).not.toHaveBeenCalledWith("openrouter_answer", expect.anything());
  });
  it("checks model credentials before retrieving private content", async () => {
    vi.mocked(invoke).mockResolvedValue(false);
    await expect(answerFromMemory("What happened?", [])).rejects.toThrow("API key");
    expect(retrieveMemory).not.toHaveBeenCalled();
  });
});
