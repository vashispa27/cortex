import { describe, expect, it, vi } from "vitest";
import type { MemoryHit } from "./api";
import { appendMessage, commitSession, composeAnswer, loadSessions, sessionTitle, triggerName, triggerSymbol, upsertSession, type RewindSession } from "./rewind";

const hit: MemoryHit = {
  snapshot_id: 1,
  observed_ms: Date.now(),
  app_id: "Example Mail",
  title: "Launch review",
  excerpt: "Maya suggested moving the design review to Thursday.",
  evidence_available: true,
  truncated: false,
};

const session = (id: string, updatedAt: number): RewindSession => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  messages: [{ role: "user", body: id }],
});

describe("rewind sessions", () => {
  it("turns a question into a compact chat title", () => {
    expect(sessionTitle("  What did   Maya say about the review?  ")).toBe("What did Maya say about the review?");
    expect(sessionTitle("A".repeat(80))).toHaveLength(54);
    expect(sessionTitle("")).toBe("Untitled rewind");
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
