import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { defaultLayers, dueOccurrence, loadPreferences, type Reminder } from "./storage";

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

describe("per-step model settings", () => {
  const stored = (value: unknown) => vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(value), setItem: () => {}, removeItem: () => {} });
  afterEach(() => vi.unstubAllGlobals());

  it("starts with every step following the default provider, and context on this Mac", () => {
    stored({});
    const prefs = loadPreferences();
    expect(prefs.localOnly).toBe(false);
    expect(prefs.layers).toEqual(defaultLayers());
    expect(prefs.layers.answer.provider).toBe("default");
    expect(prefs.layers.context.provider).toBe("local");
  });

  it("moves the old autocomplete model into the autocomplete step", () => {
    stored({ fastModel: " a/fast ", openrouterModel: "a/main" });
    const prefs = loadPreferences();
    expect(prefs.layers.autocomplete.cloudModel).toBe("a/fast");
    expect(prefs.layers.answer.cloudModel).toBe("");
    expect(prefs.openrouterModel).toBe("a/main");
  });

  it("keeps saved steps and fills in any the saved settings predate", () => {
    stored({ layers: { answer: { provider: "local", localModel: "q" } } });
    const prefs = loadPreferences();
    expect(prefs.layers.answer).toEqual({ provider: "local", cloudModel: "", localModel: "q" });
    expect(prefs.layers.writing).toEqual(defaultLayers().writing);
  });
});
