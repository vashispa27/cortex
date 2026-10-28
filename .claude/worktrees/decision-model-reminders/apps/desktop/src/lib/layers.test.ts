import { describe, expect, it } from "vitest";
import { engineChanges, engineSettingsFor, whereEachStepRuns } from "./layers";
import { defaultLayers, defaultPreferences, type Preferences } from "./storage";
import type { ServiceSettings } from "./api";

const prefs = (changes: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, layers: defaultLayers(), openrouterModel: "a/main", localModel: "qwen-main", ...changes });

describe("where each step runs", () => {
  it("lists every step and marks contextual indexing off until it is enabled", () => {
    const rows = whereEachStepRuns(prefs());
    expect(rows.map((row) => row.id)).toEqual(["answer", "followup", "decide", "context"]);
    expect(rows.find((row) => row.id === "answer")).toMatchObject({ where: "cloud", model: "a/main" });
    expect(rows.find((row) => row.id === "context")?.where).toBe("off");
  });

  it("shows a cloud step, a local step, and the local-only override", () => {
    const p = prefs({ contextEnabled: true });
    p.layers.answer.provider = "local";
    p.layers.context.provider = "cloud";
    const rows = Object.fromEntries(whereEachStepRuns(p).map((row) => [row.id, row.where]));
    expect(rows).toEqual({ answer: "local", followup: "cloud", decide: "cloud", context: "cloud" });
    const only = whereEachStepRuns({ ...p, localOnly: true });
    // The decision step has no local model yet: local-only turns it off and chat uses the built-in parser.
    expect(only.filter((row) => row.id !== "decide").every((row) => row.where === "local")).toBe(true);
    expect(only.find((row) => row.id === "decide")?.where).toBe("off");
    expect(whereEachStepRuns({ ...p, decideEnabled: false }).find((row) => row.id === "decide")?.where).toBe("off");
  });

  it("describes the decision step honestly: no captured text, no fact values", () => {
    const decide = whereEachStepRuns(prefs()).find((row) => row.id === "decide");
    expect(decide).toMatchObject({ where: "cloud", title: "Reminders and memories" });
    expect(decide?.sends).toMatch(/never their values/);
    expect(decide?.sends).toMatch(/No captured pages/);
  });
});

describe("settings the engine needs", () => {
  it("maps the context step, falling back to the default local model", () => {
    const p = prefs({ contextEnabled: true, localEndpoint: " http://127.0.0.1:8080/v1 " });
    expect(engineSettingsFor(p)).toEqual({ local_only: false, context_enabled: true, context_provider: "local", context_cloud_model: "", context_local_model: "qwen-main", local_endpoint: "http://127.0.0.1:8080/v1" });
    p.layers.context = { provider: "cloud", cloudModel: " a/ctx ", localModel: "" };
    expect(engineSettingsFor(p)).toMatchObject({ context_provider: "cloud", context_cloud_model: "a/ctx" });
  });

  it("sends only what differs", () => {
    const desired = engineSettingsFor(prefs());
    const current = { ...desired, version: 1 } as unknown as ServiceSettings;
    expect(engineChanges(desired, current)).toEqual({});
    expect(engineChanges({ ...desired, local_only: true }, current)).toEqual({ local_only: true });
  });
});
