import { describe, expect, it } from "vitest";
import { engineChanges, engineSettingsFor, LAYERS } from "./layers";
import { defaultLayers, defaultPreferences, type Preferences } from "./storage";
import type { ServiceSettings } from "./api";

const prefs = (changes: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, layers: defaultLayers(), openrouterModel: "a/main", localModel: "qwen-main", ...changes });

describe("steps", () => {
  it("describes the decision step honestly: no captured text, no fact values", () => {
    const decide = LAYERS.find((layer) => layer.id === "decide");
    expect(decide?.title).toBe("Reminders and memories");
    expect(decide?.sends).toMatch(/never their values/);
    expect(decide?.sends).toMatch(/No captured pages/);
  });
});

describe("settings the engine needs", () => {
  it("maps the context step, falling back to the default local model", () => {
    const p = prefs({ contextEnabled: true, localEndpoint: " http://127.0.0.1:8080/v1 " });
    expect(engineSettingsFor(p)).toEqual({ local_only: false, context_enabled: true, context_provider: "local", context_cloud_model: "", context_local_model: "qwen-main", local_endpoint: "http://127.0.0.1:8080/v1" });
    // A saved cloud choice from before is ignored: contextual indexing always runs on this Mac.
    p.layers.context = { provider: "cloud", cloudModel: " a/ctx ", localModel: "" };
    expect(engineSettingsFor(p)).toMatchObject({ context_provider: "local", context_local_model: "qwen-main" });
  });

  it("sends only what differs", () => {
    const desired = engineSettingsFor(prefs());
    const current = { ...desired, version: 1 } as unknown as ServiceSettings;
    expect(engineChanges(desired, current)).toEqual({});
    expect(engineChanges({ ...desired, local_only: true }, current)).toEqual({ local_only: true });
  });
});
