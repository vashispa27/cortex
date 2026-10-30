import { describe, expect, it } from "vitest";
import { aiTarget, layerIsLocal, validLocalEndpoint } from "./provider";
import { defaultLayers, defaultPreferences } from "./storage";

const prefs = (changes: Partial<typeof defaultPreferences> = {}) => ({ ...defaultPreferences, layers: defaultLayers(), openrouterModel: "a/main", localModel: "qwen-main", ...changes });

describe("ai provider", () => {
  it("follows the global provider and its default model when a step has no choice of its own", () => {
    expect(aiTarget(prefs())).toEqual({ model: "a/main", endpoint: null, local: false });
    expect(aiTarget(prefs({ aiProvider: "local" }), "followup")).toEqual({ model: "qwen-main", endpoint: "http://127.0.0.1:8080/v1", local: true });
  });

  it("lets answers use the cloud, but keeps every step below them on this Mac", () => {
    const p = prefs();
    p.layers.answer = { provider: "cloud", cloudModel: "a/big", localModel: "qwen-big" };
    p.layers.followup = { provider: "cloud", cloudModel: "a/fast", localModel: "qwen-small" };
    p.layers.context = { provider: "default", cloudModel: "", localModel: "" };
    expect(aiTarget(p, "answer")).toEqual({ model: "a/big", endpoint: null, local: false });
    // Steps below answers share the one local model; a model saved for the step earlier is ignored.
    expect(aiTarget(p, "followup")).toEqual({ model: "qwen-main", endpoint: "http://127.0.0.1:8080/v1", local: true });
    expect(aiTarget(p, "context")).toEqual({ model: "qwen-main", endpoint: "http://127.0.0.1:8080/v1", local: true });
  });

  it("sends the routing adapter with routing and follow-up rewrites only", () => {
    const p = { ...prefs(), routingAdapter: " /adapters/routing " };
    expect(aiTarget(p, "decide")).toMatchObject({ local: true, adapter: "/adapters/routing" });
    expect(aiTarget(p, "followup")).toMatchObject({ local: true, adapter: "/adapters/routing" });
    expect(aiTarget(p, "context")).not.toHaveProperty("adapter");
    expect(aiTarget({ ...p, layers: { ...p.layers, answer: { provider: "local", cloudModel: "", localModel: "" } } }, "answer")).not.toHaveProperty("adapter");
    expect(aiTarget({ ...p, routingAdapter: "" }, "decide")).not.toHaveProperty("adapter");
  });

  it("falls back to the default local model when the step names none", () => {
    const p = prefs();
    p.layers.followup = { provider: "local", cloudModel: "a/x", localModel: "" };
    expect(aiTarget(p, "followup").model).toBe("qwen-main");
  });

  it("local only forces every step onto the local server, whatever it chose", () => {
    const p = prefs({ localOnly: true, aiProvider: "openrouter" });
    p.layers.answer = { provider: "cloud", cloudModel: "a/big", localModel: "" };
    for (const layer of ["answer", "followup", "context"] as const) {
      expect(layerIsLocal(p, layer)).toBe(true);
      expect(aiTarget(p, layer).local).toBe(true);
      expect(aiTarget(p, layer).endpoint).toBe("http://127.0.0.1:8080/v1");
    }
    expect(aiTarget(p, "answer").model).toBe("qwen-main");
  });

  it("accepts only http addresses on this Mac", () => {
    expect(validLocalEndpoint("http://127.0.0.1:8080/v1")).toBe(true);
    expect(validLocalEndpoint("http://localhost:11434/v1")).toBe(true);
    expect(validLocalEndpoint("https://openrouter.ai/api/v1")).toBe(false);
    expect(validLocalEndpoint("http://192.168.1.5:8080/v1")).toBe(false);
    expect(validLocalEndpoint("http://localhost.evil.com/v1")).toBe(false);
    expect(validLocalEndpoint("nonsense")).toBe(false);
  });
});
