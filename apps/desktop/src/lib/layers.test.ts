import { describe, expect, it } from "vitest";
import { engineChanges, engineSettingsFor, whereEachStepRuns } from "./layers";
import { defaultLayers, defaultPreferences, type Preferences } from "./storage";
import type { ServiceSettings } from "./api";

const prefs = (changes: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, layers: defaultLayers(), openrouterModel: "a/main", localModel: "qwen-main", ...changes });

describe("where each step runs", () => {
  it("lists every step and marks contextual indexing off until it is enabled", () => {
    const rows = whereEachStepRuns(prefs());
    expect(rows.map((row) => row.id)).toEqual(["answer", "followup", "autocomplete", "writing", "context"]);
    expect(rows.find((row) => row.id === "answer")).toMatchObject({ where: "cloud", model: "a/main" });
    expect(rows.find((row) => row.id === "context")?.where).toBe("off");
  });

  it("shows a cloud step, a local step, and the local-only override", () => {
    const p = prefs({ contextEnabled: true });
    p.layers.answer.provider = "local";
    p.layers.context.provider = "cloud";
    const rows = Object.fromEntries(whereEachStepRuns(p).map((row) => [row.id, row.where]));
    expect(rows).toEqual({ answer: "local", followup: "cloud", autocomplete: "cloud", writing: "cloud", context: "cloud" });
    const only = whereEachStepRuns({ ...p, localOnly: true });
    expect(only.every((row) => row.where === "local")).toBe(true);
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
