import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerFromMemory, needsRewrite, parseSource } from "./answer";
import { prepareAssistantRequest } from "./api";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./api", () => ({ prepareAssistantRequest: vi.fn() }));
vi.mock("./storage", () => ({ loadPreferences: () => ({ openrouterModel: "example/model" }) }));
const hit = { snapshot_id: 42, observed_ms: 0, app_id: "example.app", title: "Plan", excerpt: "excerpt", evidence_available: true, truncated: false };
const retrieval = { engine: "qdrant_edge_hybrid" as const, dense: true, bm25: true, fusion: "rrf", candidates: 4 };
const messages = [{ role: "system" as const, content: "prompt" }, { role: "user" as const, content: "Question: q" }];
const prepared = (over: Record<string, unknown> = {}) => ({ results: [hit], sources: [{ id: 42, text: "Launch is on Monday." }], abstained: false, retrieval, messages, prompt_version: "answer-v3", ...over });
/** Scripts the Tauri commands: the model reply and, optionally, the follow-up rewrite. */
const script = (reply: string, rewrite = "rewritten", hits: unknown[] = []) => vi.mocked(invoke).mockImplementation(async (command) => command === "openrouter_has_key" ? true : command === "openrouter_search_query" ? rewrite : { content: reply, hits });

describe("assistant answers", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("retrieves on the question, sends the engine-built messages, and keeps hits for memory answers", async () => {
    script("SOURCE: memory\nThe launch is Monday. [42]");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    const answer = await answerFromMemory("What did I ask about the launch in Example?", []);
    expect(prepareAssistantRequest).toHaveBeenCalledExactlyOnceWith("What did I ask about the launch in Example?", "What did I ask about the launch in Example?", []);
    expect(invoke).toHaveBeenCalledWith("openrouter_chat", { model: "example/model", messages });
    expect(answer).toMatchObject({ body: "The launch is Monday. [42]", source: "memory", hits: [hit] });
  });

  it("resolves follow-ups before retrieval, but answers the user's own wording", async () => {
    script("SOURCE: memory\nFriday. [42]", "When did Mira reply in Example?");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    const history = [{ role: "user" as const, body: "What did Mira say in Example?" }];
    await answerFromMemory("What date?", history);
    expect(prepareAssistantRequest).toHaveBeenCalledExactlyOnceWith("When did Mira reply in Example?", "What date?", [{ role: "user", content: "What did Mira say in Example?" }]);
  });

  it.each([
    ["who is the president of India", "SOURCE: general\nDroupadi Murmu (as of my knowledge)."],
    ["what is the date today", "SOURCE: general\nIt is Sunday, 18 October 2026."],
  ])("still calls the model when nothing matched: %s", async (question, reply) => {
    script(reply);
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared({ results: [], sources: [], abstained: true }));
    const answer = await answerFromMemory(question, []);
    expect(invoke).toHaveBeenCalledWith("openrouter_chat", expect.anything());
    expect(answer.source).toBe("general");
    expect(answer.hits).toEqual([]);
    expect(answer.body).not.toContain("couldn't find a clear match");
  });

  it("passes weak hits through, and lets the model (not the UI) say it found nothing", async () => {
    script("SOURCE: none\nI couldn't find that in what Rewind captured. Can you add a detail?");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared({ abstained: true }));
    const answer = await answerFromMemory("Unknown person", []);
    expect(invoke).toHaveBeenCalledWith("openrouter_chat", expect.anything());
    expect(answer).toMatchObject({ source: "none", hits: [] });
  });

  it("adds hits found by tool calls, without duplicates, and labels them as memory", async () => {
    const extra = { ...hit, snapshot_id: 43 };
    script("SOURCE: memory\nHe asked for 5pm. [43]", "rewritten", [hit, extra]);
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared({ results: [hit], sources: [], abstained: true }));
    const answer = await answerFromMemory("Book what Saurav asked for yesterday", []);
    expect(answer.hits).toEqual([hit, extra]);
    expect(answer.source).toBe("memory");
  });

  it("keeps evidence for mixed answers only", async () => {
    script("SOURCE: mixed\nGeneral fact. Your note says Monday. [42]");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    expect((await answerFromMemory("Compare my note with the news", [])).hits).toEqual([hit]);
    script("SOURCE: general\nDefinition.");
    expect((await answerFromMemory("Define latency", [])).hits).toEqual([]);
  });

  it("surfaces semantic engine failures without falling back to keyword search", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    vi.mocked(prepareAssistantRequest).mockRejectedValue(new Error("Qdrant unavailable"));
    await expect(answerFromMemory("What happened?", [])).rejects.toThrow("Qdrant unavailable");
    expect(invoke).not.toHaveBeenCalledWith("openrouter_chat", expect.anything());
  });

  it("checks model credentials before retrieving private content", async () => {
    vi.mocked(invoke).mockResolvedValue(false);
    await expect(answerFromMemory("What happened?", [])).rejects.toThrow("API key");
    expect(prepareAssistantRequest).not.toHaveBeenCalled();
  });
});

describe("source tag", () => {
  it("parses the leading line in any case, with or without backticks", () => {
    expect(parseSource("SOURCE: general\nHello", false)).toEqual({ source: "general", body: "Hello" });
    expect(parseSource("`source: Mixed`\n\nBoth [3]", true)).toEqual({ source: "mixed", body: "Both [3]" });
  });
  it("infers a missing tag", () => {
    expect(parseSource("It was Monday [42].", true).source).toBe("memory");
    expect(parseSource("Paris.", false).source).toBe("general");
    expect(parseSource("Paris.", true).source).toBe("none");
    expect(parseSource("SOURCE: bogus\nx", false).body).toBe("SOURCE: bogus\nx");
  });
});

describe("follow-up rewrite", () => {
  const history = [{ role: "user", body: "x" }];
  it("is skipped without history and for self-contained questions", () => {
    expect(needsRewrite("What did Maya say about the quarterly review in Slack?", [])).toBe(false);
    expect(needsRewrite("What did Maya say about the quarterly review in Slack yesterday?", history)).toBe(false);
  });
  it("runs for short or pronoun follow-ups", () => {
    expect(needsRewrite("What date?", history)).toBe(true);
    expect(needsRewrite("Can you open the link they shared in that thread for me please", history)).toBe(true);
  });
});
