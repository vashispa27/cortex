import { layerIsLocal } from "./provider";
import type { LayerId, Preferences } from "./storage";
import type { ServiceSettings } from "./api";

export type LayerInfo = { id: LayerId; title: string; sends: string };

/** What each model-backed step is and, when it runs in the cloud, exactly what it sends. */
export const LAYERS: readonly LayerInfo[] = [
  { id: "answer", title: "Answers", sends: "Your question, the recent chat, and excerpts from the best-matching captured pages (sensitive values masked), plus any extra searches the model makes." },
  { id: "followup", title: "Follow-up questions", sends: "Your latest question and the last exchange, to turn “what about him?” into a full search question. No captured text." },
  { id: "context", title: "Contextual indexing", sends: "Every newly captured page and its chunks, once, when they are saved. This is the most text any step sends. It also slows capture." },
];

export type Where = { id: LayerId; title: string; where: "cloud" | "local" | "off"; model: string; sends: string };

/** Where each step runs right now, for the "what leaves this Mac" summary. */
export function whereEachStepRuns(preferences: Preferences, contextOn = preferences.contextEnabled): Where[] {
  return LAYERS.map((info) => {
    const local = layerIsLocal(preferences, info.id);
    const choice = preferences.layers[info.id];
    const model = local ? choice.localModel.trim() || preferences.localModel.trim() : choice.cloudModel.trim() || preferences.openrouterModel.trim();
    const off = info.id === "context" && !contextOn;
    return { id: info.id, title: info.title, where: off ? "off" : local ? "local" : "cloud", model, sends: info.sends };
  });
}

/** The engine runs contextual indexing itself, so it needs this slice of the settings. */
export function engineSettingsFor(preferences: Preferences): Pick<ServiceSettings, "local_only" | "context_enabled" | "context_provider" | "context_cloud_model" | "context_local_model" | "local_endpoint"> {
  const context = preferences.layers.context;
  const choice = context.provider === "default" ? preferences.aiProvider : context.provider;
  return {
    local_only: preferences.localOnly,
    context_enabled: preferences.contextEnabled,
    context_provider: choice === "local" ? "local" : "cloud",
    context_cloud_model: context.cloudModel.trim(),
    // The local server is usually running one model, so a step with none of its own uses the default local model.
    context_local_model: context.localModel.trim() || preferences.localModel.trim(),
    local_endpoint: preferences.localEndpoint.trim(),
  };
}

/** The fields of `desired` that differ from what the engine already has. */
export function engineChanges(desired: ReturnType<typeof engineSettingsFor>, current: ServiceSettings): Partial<typeof desired> {
  const changes: Partial<typeof desired> = {};
  for (const key of Object.keys(desired) as (keyof typeof desired)[]) {
    if (desired[key] !== current[key]) (changes as Record<string, unknown>)[key] = desired[key];
  }
  return changes;
}

