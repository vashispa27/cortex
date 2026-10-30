import { invoke } from "@tauri-apps/api/core";
import type { LayerId, Preferences } from "./storage";

/** The steps below answers. They always run on the local model, whatever the settings say. */
export const LOCAL_ONLY_LAYERS: readonly LayerId[] = ["followup", "decide", "context"];

/** Which model a request goes to. `endpoint` is null for OpenRouter and the server's base URL for a local
 * model. `adapter` is a LoRA folder the local server applies to this request only. */
export type AiTarget = { model: string; endpoint: string | null; local: boolean; adapter?: string };

/** Where one step runs: the steps below answers always run on this Mac; answers follow their own choice,
 * else the global provider; "local only" overrides everything. */
export function layerIsLocal(preferences: Preferences, layer: LayerId): boolean {
  if (preferences.localOnly || LOCAL_ONLY_LAYERS.includes(layer)) return true;
  const choice = preferences.layers[layer].provider;
  return (choice === "default" ? preferences.aiProvider : choice === "local" ? "local" : "openrouter") === "local";
}

/** The model a step uses: its own model for the provider it runs on, else that provider's default model. */
export function aiTarget(preferences: Preferences, layer: LayerId = "answer"): AiTarget {
  const choice = preferences.layers[layer];
  if (layerIsLocal(preferences, layer)) {
    // The routing adapter also rewrites follow-ups, so both run on one loaded model with no reload between them.
    const adapter = layer === "decide" || layer === "followup" ? preferences.routingAdapter.trim() : "";
    // The steps below answers share the one local model, so the server never has to load a second one.
    const model = LOCAL_ONLY_LAYERS.includes(layer) ? preferences.localModel.trim() : choice.localModel.trim() || preferences.localModel.trim();
    return { model, endpoint: preferences.localEndpoint.trim() || null, local: true, ...(adapter ? { adapter } : {}) };
  }
  return { model: choice.cloudModel.trim() || preferences.openrouterModel.trim(), endpoint: null, local: false };
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
