import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { grade, labelOf, report, summarize } from "./grade";
import { mayWrite } from "../../src/lib/decide";

const find = (message: string) => CASES.find(c => c.message === message)!;

describe("decision eval grading", () => {
  it("has about forty labeled phrasings, each message once, covering every action", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map(c => c.message)).size).toBe(CASES.length);
    for (const label of ["schedule_create", "schedule_update", "schedule_snooze", "clarify", "answer", "remember", "list", "pause", "resume", "cancel"]) expect(CASES.some(c => c.expect === label), label).toBe(true);
  });
  it("every phrasing that should write or ask passes the pre-gate, so the model is judged on it", () => {
    for (const c of CASES.filter(c => c.expect !== "answer")) expect(mayWrite(c.message), c.message).toBe(true);
  });
  it("labels outcomes by what the page would do; a veto or fallback is an answer", () => {
    expect(labelOf(null)).toBe("answer");
    expect(labelOf("answer")).toBe("answer");
    expect(labelOf({ type: "schedule_manage", operation: "cancel", selector: "s" })).toBe("cancel");
    expect(labelOf({ type: "schedule_manage", operation: "list", selector: "" })).toBe("list");
    expect(labelOf({ type: "clarify", question: "?" })).toBe("clarify");
  });
  it("checks timing, with a tolerance only where the case allows one", () => {
    const rel = find("remind me in 45 minutes to take the laundry out");
    const make = (local_at: string) => ({ type: "schedule_create" as const, spec: { title: "x", timezone: "Asia/Kolkata", timing: { type: "once" as const, local_at }, action: { type: "reminder" as const, message: "x" } } });
    expect(grade(rel, make("2026-10-25T13:16")).timingOk).toBe(true);
    expect(grade(rel, make("2026-10-25T13:40")).timingOk).toBe(false);
    const exact = find("remind me tomorrow at 9am to submit the report");
    expect(grade(exact, make("2026-10-26T09:00")).timingOk).toBe(true);
    expect(grade(exact, make("2026-10-26T09:01")).timingOk).toBe(false);
  });
  it("checks target ids, snooze minutes and fact fields", () => {
    expect(grade(find("pause the water reminder"), { type: "schedule_manage", operation: "pause", selector: "s-water" }).detailOk).toBe(true);
    expect(grade(find("pause the water reminder"), { type: "schedule_manage", operation: "pause", selector: "s-rent" }).detailOk).toBe(false);
    expect(grade(find("snooze the water reminder for 20 minutes"), { type: "schedule_snooze", selector: "s-water", minutes: 10 }).detailOk).toBe(false);
    const fact = find("my wife's birthday is 14 March");
    expect(grade(fact, { type: "remember", fact: { subject: "wife", attribute: "birthday", value: "14 March", source: "", channel: "chat" } }).detailOk).toBe(true);
  });
  it("counts a write on a must-not-write phrasing as a false write", () => {
    const wrong = grade(find("how do I set a reminder?"), { type: "remember", fact: { subject: "self", attribute: "x", value: "y", source: "", channel: "chat" } });
    const summary = summarize([wrong, grade(find("my phone is dead again"), "answer")]);
    expect(summary.falseWrites).toBe(1);
    expect(report(summary, "m")).toContain("False writes on must-not-write phrasings: 1");
  });
});
