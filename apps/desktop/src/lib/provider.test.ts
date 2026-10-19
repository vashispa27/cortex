import { describe, expect, it } from "vitest";
import { aiTarget, validLocalEndpoint } from "./provider";
import { defaultPreferences } from "./storage";

describe("ai provider", () => {
  it("uses OpenRouter and its optional fast model by default", () => {
    const prefs = { ...defaultPreferences, openrouterModel: "a/main", fastModel: "a/fast" };
    expect(aiTarget(prefs)).toEqual({ model: "a/main", endpoint: null, local: false });
    expect(aiTarget(prefs, "fast").model).toBe("a/fast");
  });

  it("sends everything to the local server when chosen, ignoring the OpenRouter models", () => {
    const prefs = { ...defaultPreferences, aiProvider: "local" as const, localModel: " mlx-community/Qwen3.5-2B-4bit ", fastModel: "a/fast", openrouterModel: "a/main" };
    expect(aiTarget(prefs, "fast")).toEqual({ model: "mlx-community/Qwen3.5-2B-4bit", endpoint: "http://127.0.0.1:8080/v1", local: true });
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
