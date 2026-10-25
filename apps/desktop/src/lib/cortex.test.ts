import { describe, expect, it, vi } from "vitest";
import type { MemoryHit } from "./api";
import { appendMessage, commitSession, composeAnswer, loadSessions, sessionTitle, triggerName, triggerSymbol, upsertSession, type CortexSession } from "./cortex";

const hit: MemoryHit = {
  snapshot_id: 1,
  observed_ms: Date.now(),
  app_id: "Example Mail",
  title: "Launch review",
  excerpt: "Maya suggested moving the design review to Thursday.",
  evidence_available: true,
  truncated: false,
};

const session = (id: string, updatedAt: number): CortexSession => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  messages: [{ role: "user", body: id }],
});

describe("cortex sessions", () => {
  it("turns a question into a compact chat title", () => {
    expect(sessionTitle("  What did   Maya say about the review?  ")).toBe("What did Maya say about the review?");
    expect(sessionTitle("A".repeat(80))).toHaveLength(54);
    expect(sessionTitle("")).toBe("Untitled chat");
  });

  it("uses the closest source as an evidence-backed answer", () => {
    const answer = composeAnswer("What did Maya say?", [hit], true);
    expect(answer).toContain("Maya suggested moving the design review to Thursday.");
    expect(answer).toContain("From the sample workspace");
    expect(answer).toContain("1 related source");
    expect(composeAnswer("missing", [], false)).toContain("couldn't find a match");
  });

  it("appends messages and keeps the latest sessions first", () => {
    const next = appendMessage(session("one", 1), { role: "assistant", body: "answer" }, 5);
    expect(next.messages).toHaveLength(2);
    expect(next.updatedAt).toBe(5);
    const list = upsertSession([session("older", 2), session("newest", 9)], session("middle", 4));
    expect(list.map((item) => item.id)).toEqual(["newest", "middle", "older"]);
  });

  it("maps trigger keys to a visible symbol", () => {
    expect(triggerSymbol("rightOption")).toBe("⌥");
    expect(triggerSymbol("fn")).toBe("fn");
    expect(triggerSymbol("leftShift")).toBe("⇧");
    expect(triggerName("rightControl")).toBe("Right Control");
  });

  it("commits into the stored list so another window's sessions survive", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    commitSession(session("from-dashboard", 10));
    commitSession(session("from-notch", 20));
    expect(loadSessions().map((item) => item.id)).toEqual(["from-notch", "from-dashboard"]);
    vi.unstubAllGlobals();
  });
});

describe("summaries and the command key", () => {
  it("names the Command trigger", async () => {
    const { triggerName: name, triggerSymbol: symbol } = await import("./cortex");
    expect(symbol("rightCommand")).toBe("⌘");
    expect(symbol("leftCommand")).toBe("⌘");
    expect(name("rightCommand")).toBe("Right Command");
    expect(name("leftCommand")).toBe("Left Command");
  });

  it("starts a summary chat with the excerpt as a collapsed quote and a short title", async () => {
    const { newSummarySession } = await import("./cortex");
    const created = newSummarySession("The council voted on Tuesday to approve the new transit levy after a long debate.", "Safari · example.com", "Summarized the first ~24k characters", 5);
    expect(created.title).toBe("Summary: The council voted on Tuesday to");
    expect(created.messages).toHaveLength(1);
    expect(created.messages[0]).toMatchObject({ role: "user", kind: "summarize", origin: "Safari · example.com", note: "Summarized the first ~24k characters" });
    expect(created.messages[0].body).toContain("transit levy");
  });
});
