import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeRow, type Row } from "./routing-grade";

const situation = {
  now: "2026-11-03T14:07+05:30", timezone: "Asia/Kolkata",
  schedules: [{ id: "sch_1", title: "Water plants", status: "active", timing: { type: "daily", time: "08:00" }, timezone: "Asia/Kolkata", next: null }],
  facts: [], recent_turns: [], pending_draft: null,
};
const row = (message: string, expected: Record<string, unknown>): Row => ({ id: "r", kind: "k", scenario: "s", situation, message, expected });

describe("routing grade", () => {
  it("accepts the same reminder with different wording and a minute of rounding", () => {
    const r = row("remind me in 45 mins to call mom", { action: "create_reminder", message: "Call mom", timing: { type: "once", local_at: "2026-11-03T14:52" } });
    expect(gradeRow(r, { action: "create_reminder", message: "call mom", timing: { type: "once", local_at: "2026-11-03T14:53" } }, 1).ok).toBe(true);
  });

  it("counts a wrong time as a wrong write", () => {
    const r = row("remind me in 45 mins to call mom", { action: "create_reminder", message: "Call mom", timing: { type: "once", local_at: "2026-11-03T14:52" } });
    const result = gradeRow(r, { action: "create_reminder", message: "Call mom", timing: { type: "once", local_at: "2026-11-03T15:52" } }, 1);
    expect(result).toMatchObject({ ok: false, actionOk: true, wrongWrite: true });
  });

  it("counts a write where a question was needed as a wrong write", () => {
    const r = row("remind me to call mom", { action: "clarify", question: "When?", message: "Call mom" });
    const result = gradeRow(r, { action: "create_reminder", message: "Call mom", timing: { type: "daily", time: "09:00" } }, 1);
    expect(result).toMatchObject({ ok: false, wrongWrite: true, got: "schedule_create" });
  });

  it("grades any clarify question as right when a question is expected", () => {
    const r = row("remind me at 5 to leave", { action: "clarify", question: "Is that 5am or 5pm?", message: "Leave" });
    expect(gradeRow(r, { action: "clarify", question: "am or pm?" }, 1).ok).toBe(true);
  });

  it("needs the right schedule for a change", () => {
    const r = row("pause the plants reminder", { action: "pause_schedule", schedule_id: "sch_1" });
    expect(gradeRow(r, { action: "pause_schedule", schedule_id: "sch_1" }, 1).ok).toBe(true);
    expect(gradeRow(r, { action: "pause_schedule", schedule_id: "sch_2" }, 1).ok).toBe(false);
  });

  it("lets a new fact use another attribute name, but not one that should update a saved fact", () => {
    const fresh = row("Store Laila's employer as Glass Finch Design.", { action: "remember_fact", subject: "Laila", attribute: "company", value: "Glass Finch Design" });
    expect(gradeRow(fresh, { action: "remember_fact", subject: "Laila", attribute: "employer", value: "Glass Finch Design" }, 1).ok).toBe(true);
    const saved: Row = { ...fresh, situation: { ...situation, facts: [{ subject: "Laila", attribute: "company" }] }, expected: { ...fresh.expected, action: "update_fact" } };
    expect(gradeRow(saved, { action: "update_fact", subject: "Laila", attribute: "employer", value: "Glass Finch Design" }, 1).ok).toBe(false);
  });

  it("marks a failed call as invalid, not a write", () => {
    const r = row("what did Priya say", { action: "answer" });
    expect(gradeRow(r, null, 1, "HTTP 500")).toMatchObject({ ok: false, got: "invalid", wrongWrite: false });
  });

  it("every expected answer in the dataset grades as correct against itself", () => {
    for (const file of ["train", "test"]) {
      let text = "";
      try { text = readFileSync(new URL(`../../../../evals/routing/${file}.jsonl`, import.meta.url), "utf8"); } catch { continue; }
      for (const line of text.split("\n").filter(Boolean)) {
        const r = JSON.parse(line) as Row;
        expect(gradeRow(r, r.expected, 1).ok, r.id).toBe(true);
      }
    }
  });
});
