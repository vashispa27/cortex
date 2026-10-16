import { describe, expect, it } from "vitest";
import { dueOccurrence, type Reminder } from "./storage";

const base: Reminder = {
  id: "test", text: "Review", at: "2026-10-16T09:00:00.000Z", repeat: "none", delivered: [],
};

describe("reminder occurrence deduplication", () => {
  it("delivers a one-time reminder only after its time and once", () => {
    expect(dueOccurrence(base, new Date("2026-10-16T08:59:59Z"))).toBeNull();
    expect(dueOccurrence(base, new Date("2026-10-16T09:00:01Z"))).toBe(base.at);
    expect(dueOccurrence({ ...base, delivered: [base.at] }, new Date("2026-10-16T09:01:00Z"))).toBeNull();
  });

  it("delivers one occurrence per local day for repeating reminders", () => {
    const recurring = { ...base, repeat: "daily" as const };
    const now = new Date("2026-10-18T09:01:00Z");
    const key = dueOccurrence(recurring, now);
    expect(key).not.toBeNull();
    expect(dueOccurrence({ ...recurring, delivered: [key!] }, now)).toBeNull();
  });
});
