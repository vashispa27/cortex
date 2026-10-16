import { describe, expect, it } from "vitest";
import { canApplyDraft, classifyWriting, draftSample } from "./writing";

describe("local writing sandbox", () => {
  it("prioritizes a selected range over a direct request", () => {
    expect(classifyWriting("/g find the date", 3, 7)).toBe("selection");
    expect(classifyWriting("/g find the date", 0, 0)).toBe("answer");
    expect(classifyWriting("", 0, 0)).toBe("draft");
  });

  it("rejects applying a draft after either text or selection changes", () => {
    expect(canApplyDraft("hello", "hello", 0, 5, 0, 5)).toBe(true);
    expect(canApplyDraft("hello", "hello!", 0, 5, 0, 5)).toBe(false);
    expect(canApplyDraft("hello", "hello", 0, 5, 1, 5)).toBe(false);
  });

  it("does not fabricate an answer in sample mode", () => {
    expect(draftSample("/g What is the deadline?", "answer", "Keep the meaning"))
      .toContain("cannot verify");
  });
});
