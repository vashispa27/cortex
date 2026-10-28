import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { defaultLayers, loadPreferences } from "./storage";

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

  it("discards obsolete feature preferences", () => {
    stored({ fastModel: " a/fast ", microphoneConsent: true, autocompleteOnTap: true, rewriteOnTap: true, openrouterModel: "a/main", excludedApps: "com.example.private" });
    const prefs = loadPreferences();
    for (const key of ["fastModel", "microphoneConsent", "autocompleteOnTap", "rewriteOnTap"]) expect(prefs).not.toHaveProperty(key);
    expect(prefs.excludedApps).toBe("com.example.private");
    expect(prefs.layers).not.toHaveProperty("autocomplete");
    expect(prefs.layers.answer.cloudModel).toBe("");
    expect(prefs.openrouterModel).toBe("a/main");
  });

  it("keeps saved steps and fills in any the saved settings predate", () => {
    stored({ layers: { answer: { provider: "local", localModel: "q" } } });
    const prefs = loadPreferences();
    expect(prefs.layers.answer).toEqual({ provider: "local", cloudModel: "", localModel: "q" });
    expect(prefs.layers.context).toEqual(defaultLayers().context);
  });
});
