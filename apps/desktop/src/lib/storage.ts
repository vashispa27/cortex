export type CortexTrigger = "rightOption" | "leftOption" | "fn" | "rightShift" | "leftShift" | "rightControl" | "leftControl" | "rightCommand" | "leftCommand";

export type AiProvider = "openrouter" | "local";

/** The model-backed steps, each of which can run in the cloud or on this Mac on its own. */
export type LayerId = "answer" | "followup" | "context";
/** `default` follows the global provider. */
export type LayerProvider = "default" | "cloud" | "local";
export type LayerChoice = {
  provider: LayerProvider;
  /** OpenRouter model for this step; empty uses the default OpenRouter model. */
  cloudModel: string;
  /** Local-server model for this step; empty uses the default local model. */
  localModel: string;
};
export const LAYER_IDS: readonly LayerId[] = ["answer", "followup", "context"];
export const defaultLayers = (): Record<LayerId, LayerChoice> => ({
  answer: { provider: "default", cloudModel: "", localModel: "" },
  followup: { provider: "default", cloudModel: "", localModel: "" },
  // Context is generated for every new capture, so it starts on this Mac and off.
  context: { provider: "local", cloudModel: "", localModel: "" },
});

export type Preferences = {
  onboardingComplete: boolean;
  captureSetupComplete: boolean;
  sampleMode: boolean;
  reduceMotion: boolean;
  textScale: number;
  edge: "left" | "right";
  hoverOpen: boolean;
  hideDrop: boolean;
  fishByText: boolean;
  cortexHotkey: boolean;
  cortexTrigger: CortexTrigger;
  showOverFullScreen: boolean;
  /** Per-step provider and model; see `LayerId`. */
  layers: Record<LayerId, LayerChoice>;
  /** Nothing is sent to a cloud model, whatever the steps say. */
  localOnly: boolean;
  /** Contextual retrieval: a model adds a short context to each new capture before it is indexed. */
  contextEnabled: boolean;
  proactive: boolean;
  backgroundInference: boolean;
  mcpConsent: boolean;
  captureConsent: boolean;
  retentionDays: number;
  excludedApps: string;
  excludedDomains: string;
  identity: string;
  openrouterModel: string;
  /** Where model calls go: OpenRouter, or an OpenAI-compatible server on this Mac. */
  aiProvider: AiProvider;
  localEndpoint: string;
  localModel: string;
};

export const defaultPreferences: Preferences = {
  onboardingComplete: false,
  captureSetupComplete: false,
  sampleMode: false,
  reduceMotion: false,
  textScale: 100,
  edge: "right",
  hoverOpen: false,
  hideDrop: false,
  fishByText: true,
  cortexHotkey: true,
  cortexTrigger: "rightOption",
  showOverFullScreen: true,
  layers: defaultLayers(),
  localOnly: false,
  contextEnabled: false,
  proactive: false,
  backgroundInference: false,
  mcpConsent: false,
  captureConsent: false,
  retentionDays: 90,
  excludedApps: "",
  excludedDomains: "",
  identity: "",
  openrouterModel: "",
  aiProvider: "openrouter",
  localEndpoint: "http://127.0.0.1:8080/v1",
  localModel: "",
};

const key = "cortex.desktop.preferences.v1";

export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    const layers = defaultLayers();
    for (const id of LAYER_IDS) layers[id] = { ...layers[id], ...(saved.layers?.[id] ?? {}) };
    const current = Object.fromEntries(Object.entries(saved).filter(([key]) => key in defaultPreferences));
    return { ...defaultPreferences, ...current, layers };
  } catch {
    return { ...defaultPreferences, layers: defaultLayers() };
  }
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(key, JSON.stringify(preferences));
}
