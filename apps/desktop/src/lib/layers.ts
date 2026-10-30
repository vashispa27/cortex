import type { LayerId, Preferences } from "./storage";
import type { ServiceSettings } from "./api";

export type LayerInfo = { id: LayerId; title: string; sends: string };

/** What each model-backed step is and, when it runs in the cloud, exactly what it sends. */
export const LAYERS: readonly LayerInfo[] = [
  { id: "answer", title: "Answers", sends: "Your question, the recent chat, and excerpts from the best-matching captured pages (sensitive values masked), plus any extra searches the model makes." },
  { id: "followup", title: "Follow-up questions", sends: "Your latest question and the last exchange, to turn “what about him?” into a full search question. No captured text." },
  { id: "decide", title: "Reminders and memories", sends: "Only when a message looks like it sets a reminder or saves a fact: that message, the last few chat turns (sensitive values masked), the current time and timezone, and the titles, times and status of your reminders plus the subject and attribute of saved facts (never their values). No captured pages or screen text." },
  { id: "context", title: "Contextual indexing", sends: "Every newly captured page and its chunks, once, when they are saved. This is the most text any step sends. It also slows capture." },
];

/** The engine runs contextual indexing itself, so it needs this slice of the settings. */
export function engineSettingsFor(preferences: Preferences): Pick<ServiceSettings, "local_only" | "context_enabled" | "context_provider" | "context_cloud_model" | "context_local_model" | "local_endpoint"> {
  const context = preferences.layers.context;
  return {
    local_only: preferences.localOnly,
    context_enabled: preferences.contextEnabled,
    // Contextual indexing always runs on this Mac.
    context_provider: "local",
    context_cloud_model: context.cloudModel.trim(),
    // Every step below answers uses the one local model.
    context_local_model: preferences.localModel.trim(),
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

