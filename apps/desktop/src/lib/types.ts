import type { MemoryHit } from "./api";

export type Page = "today" | "timeline" | "ask" | "memory" | "wiki" | "write" | "reminders" | "settings" | "tasks";

export type SettingsPage =
  | "account"
  | "ai"
  | "capture"
  | "notch"
  | "shortcuts"
  | "voice"
  | "appearance"
  | "memory"
  | "identity"
  | "notifications"
  | "connected"
  | "diagnostics"
  | "updates";

export type AnswerSource = "memory" | "general" | "mixed" | "none" | "selection";
export type ChatMessage = {
  role: "user" | "assistant";
  body: string;
  hits?: MemoryHit[];
  source?: AnswerSource;
  /** A selection the user asked Cortex to summarize. `body` holds the text the model saw. */
  kind?: "summarize";
  /** Where the selection came from, for example "Safari · nytimes.com". */
  origin?: string;
  /** A visible note about the excerpt, for example that it was cut. */
  note?: string;
};
