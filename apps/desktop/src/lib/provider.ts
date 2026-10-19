import { invoke } from "@tauri-apps/api/core";
import type { Preferences } from "./storage";

/** Which model a request goes to. `endpoint` is null for OpenRouter and the server's base URL for a local model. */
export type AiTarget = { model: string; endpoint: string | null; local: boolean };

export function aiTarget(preferences: Preferences, purpose: "main" | "fast" = "main"): AiTarget {
  if (preferences.aiProvider === "local") {
    return { model: preferences.localModel.trim(), endpoint: preferences.localEndpoint.trim() || null, local: true };
  }
  const fast = purpose === "fast" ? preferences.fastModel.trim() : "";
  return { model: fast || preferences.openrouterModel.trim(), endpoint: null, local: false };
}

/** Mirrors the shell's rule: a local model must be an http address on this Mac. */
export function validLocalEndpoint(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** Throws a message for the notch or chat when the chosen provider is not set up. */
export async function ensureReady(target: AiTarget): Promise<void> {
  if (target.local) {
    if (!validLocalEndpoint(target.endpoint ?? "")) throw new Error("Set the local model address in Settings → AI model.");
    if (!target.model) throw new Error("Set the local model name in Settings → AI model.");
    return;
  }
  if (!target.model) throw new Error("Add your OpenRouter model in Settings → AI model.");
  if (!await invoke<boolean>("openrouter_has_key")) throw new Error("Add your OpenRouter API key in Settings → AI model.");
}

export function testConnection(target: AiTarget): Promise<void> {
  return invoke("ai_test", { model: target.model, endpoint: target.endpoint });
}
