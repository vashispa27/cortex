import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptableRewrite, answerFromMemory, fallbackQuery, needsRewrite, parseSource } from "./answer";
import { prepareAssistantRequest } from "./api";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./api", () => ({ prepareAssistantRequest: vi.fn() }));
const prefs = vi.hoisted(() => {
  const step = { provider: "default", cloudModel: "", localModel: "" };
  const base = { openrouterModel: "example/model", aiProvider: "openrouter", localOnly: false, layers: { answer: { ...step }, followup: { ...step }, context: { ...step } } } as Record<string, any>;
  return { base, current: base };
});
vi.mock("./storage", () => ({ loadPreferences: () => prefs.current }));
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
    expect(invoke).toHaveBeenCalledWith("openrouter_chat", { model: "example/model", messages, endpoint: null });
    expect(answer).toMatchObject({ body: "The launch is Monday. [42]", source: "memory", hits: [hit] });
  });

  it("resolves follow-ups before retrieval, and shows the model both the user's words and the resolution", async () => {
    script("SOURCE: memory\nFriday. [42]", "When did Mira reply in Example?");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    const history = [{ role: "user" as const, body: "What did Mira say in Example?" }];
    await answerFromMemory("What date?", history);
    expect(prepareAssistantRequest).toHaveBeenCalledExactlyOnceWith("When did Mira reply in Example?", "What date?\n(Meaning: When did Mira reply in Example?)", [{ role: "user", content: "What did Mira say in Example?" }]);
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
    script("SOURCE: none\nI couldn't find that in what Cortex captured. Can you add a detail?");
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

describe("local model", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("sends the same request to the local server, with no API key check", async () => {
    prefs.current = { ...prefs.base, aiProvider: "local", localModel: "mlx-community/Qwen3.5-2B-4bit", localEndpoint: "http://127.0.0.1:8080/v1" };
    script("SOURCE: general\nHello.");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared({ results: [], sources: [], abstained: true }));
    await answerFromMemory("hi there", []);
    expect(invoke).toHaveBeenCalledWith("openrouter_chat", expect.objectContaining({ model: "mlx-community/Qwen3.5-2B-4bit", endpoint: "http://127.0.0.1:8080/v1" }));
    expect(invoke).not.toHaveBeenCalledWith("openrouter_has_key");
    prefs.current = { ...prefs.base, openrouterModel: "example/model" };
  });
});

describe("a reply that is only a source tag", () => {
  beforeEach(() => { vi.resetAllMocks(); prefs.current = { ...prefs.base, openrouterModel: "example/model" }; vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared({ results: [], sources: [], abstained: true })); });

  it("is retried once with a reminder instead of being shown", async () => {
    const replies = ["SOURCE: none", "SOURCE: none\n\nI could not find Brandon Smith in what was captured."];
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "openrouter_has_key") return true;
      const sent = (args as { messages: { content: string }[] }).messages;
      if (replies.length === 2) expect(sent.at(-1)?.content).not.toMatch(/Reminder/);
      else expect(sent.at(-1)?.content).toMatch(/Reminder: after the SOURCE line/);
      return { content: replies.shift() };
    });
    const answer = await answerFromMemory("do u have brandon smith on X", []);
    expect(answer.body).toBe("I could not find Brandon Smith in what was captured.");
    expect(answer.source).toBe("none");
  });

  it("is an error when the model still gives no answer, and never reaches the history", async () => {
    vi.mocked(invoke).mockImplementation(async (command) => command === "openrouter_has_key" ? true : { content: "SOURCE: none" });
    await expect(answerFromMemory("do u know shivani", [])).rejects.toThrow(/only a source tag/);
  });
});

describe("follow-up rewrites from small models", () => {
  it("rejects a rewrite that answers the question or refuses instead", () => {
    expect(acceptableRewrite("Do you have the X handle of Roop Reddy?", "do u have X handle of him?")).toBe(true);
    expect(acceptableRewrite("No, I do not have access to your X (Twitter) handle or any other personal account information.", "do u have X handle of him?")).toBe(false);
    expect(acceptableRewrite("", "him?")).toBe(false);
    expect(acceptableRewrite("x".repeat(400), "him?")).toBe(false);
  });

  it("falls back to the last question plus the follow-up, so the person is not lost", () => {
    const history = [{ role: "user" as const, content: "what did Roop reddy reply?" }, { role: "assistant" as const, content: "I could not find a reply." }];
    expect(fallbackQuery("do u have X handle of him?", history)).toBe("what did Roop reddy reply? do u have X handle of him?");
    expect(fallbackQuery("hello", [])).toBe("hello");
  });

  it("uses the fallback query for retrieval when the model's rewrite is unusable", async () => {
    prefs.current = { ...prefs.base, openrouterModel: "example/model" };
    vi.resetAllMocks();
    script("SOURCE: general\nOk.", "No, I do not have access to your X handle.");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    await answerFromMemory("do u have X handle of him?", [{ role: "user", body: "what did Roop reddy reply?" }, { role: "assistant", body: "No reply found." }]);
    expect(prepareAssistantRequest).toHaveBeenCalledWith("what did Roop reddy reply? do u have X handle of him?", "do u have X handle of him?", expect.anything());
  });
});

describe("pronouns in a longer chat", () => {
  it("rewrites from the last exchange only, so him means the person just discussed", async () => {
    prefs.current = { ...prefs.base, openrouterModel: "example/model" };
    vi.resetAllMocks();
    script("SOURCE: none\nNot captured.", "Do you have Roop Reddy's X handle?");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    const chat = [
      { role: "user" as const, body: "do u have the X handle of Connor Loi?" }, { role: "assistant" as const, body: "Not captured." },
      { role: "user" as const, body: "what did Roop reddy reply?" }, { role: "assistant" as const, body: "No reply found." },
    ];
    await answerFromMemory("do u have X handle of him?", chat);
    const rewrite = vi.mocked(invoke).mock.calls.find(([name]) => name === "openrouter_search_query")![1] as { history: { content: string }[] };
    expect(rewrite.history.map((turn) => turn.content)).toEqual(["what did Roop reddy reply?", "No reply found."]);
    expect(prepareAssistantRequest).toHaveBeenCalledWith("Do you have Roop Reddy's X handle?", "do u have X handle of him?\n(Meaning: Do you have Roop Reddy's X handle?)", expect.anything());
  });
});

describe("per-step providers", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("answers in the cloud while rewriting the follow-up on this Mac", async () => {
    prefs.current = { ...prefs.base, localEndpoint: "http://127.0.0.1:8080/v1", localModel: "qwen-main", layers: { ...prefs.base.layers, followup: { provider: "local", cloudModel: "", localModel: "qwen-small" } } };
    script("SOURCE: memory\nFriday. [42]", "When did Mira reply in Example?");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    await answerFromMemory("What date?", [{ role: "user" as const, body: "What did Mira say in Example?" }]);
    expect(invoke).toHaveBeenCalledWith("openrouter_search_query", expect.objectContaining({ model: "qwen-small", endpoint: "http://127.0.0.1:8080/v1" }));
    expect(invoke).toHaveBeenCalledWith("openrouter_chat", expect.objectContaining({ model: "example/model", endpoint: null }));
    prefs.current = prefs.base;
  });
  it("local only keeps both steps on this Mac even if a step asks for the cloud", async () => {
    prefs.current = { ...prefs.base, localOnly: true, localEndpoint: "http://127.0.0.1:8080/v1", localModel: "qwen-main", layers: { ...prefs.base.layers, answer: { provider: "cloud", cloudModel: "a/big", localModel: "" } } };
    script("SOURCE: memory\nFriday. [42]", "When did Mira reply in Example?");
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    await answerFromMemory("What date?", [{ role: "user" as const, body: "What did Mira say in Example?" }]);
    for (const call of vi.mocked(invoke).mock.calls) if (call[0] === "openrouter_chat" || call[0] === "openrouter_search_query") expect(call[1]).toMatchObject({ endpoint: "http://127.0.0.1:8080/v1", model: "qwen-main" });
    expect(invoke).not.toHaveBeenCalledWith("openrouter_has_key");
    prefs.current = prefs.base;
  });
});

describe('mixed permanent and activity evidence', () => {
  it('passes saved facts through the engine redaction boundary, separately from snapshot evidence', async () => {
    vi.resetAllMocks();
    prefs.current = prefs.base;
    script('SOURCE: memory\nRajesh’s saved phone is 213132 [fact:f1]; yesterday he shared another number [42].');
    vi.mocked(prepareAssistantRequest).mockResolvedValue(prepared());
    const fact = { id: 'f1', kind: 'personal_fact' as const, subject: 'Rajesh', attribute: 'phone', value: '213132', source: 'User request', channel: 'chat' as const, key: '', revision: 1, created_ms: 0, updated_ms: 0 };
    await answerFromMemory('Compare Rajesh’s phone with yesterday', [], [fact]);
    expect(prepareAssistantRequest).toHaveBeenCalledWith('Compare Rajesh’s phone with yesterday', 'Compare Rajesh’s phone with yesterday', [], expect.stringContaining('"id":"f1"'));
  });
});
