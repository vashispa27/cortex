import type { ChatAction, PendingIntent } from "./intent";
import type { MemoryHit } from "./api";

export type Page = "today" | "timeline" | "ask" | "memories" | "scheduled" | "agents" | "jobs" | "settings";

export type SettingsPage =
  | "account"
  | "ai"
  | "capture"
  | "notch"
  | "shortcuts"
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
  /** A clarification may resume only this explicitly requested schedule. */
  pendingIntent?: PendingIntent;
  /** Buttons under this message (Undo, Confirm, Cancel); removed once one has been used. */
  actions?: ChatAction[];
  /** The long-running agent this message started; the chat shows its live state. */
  agentJobId?: string;
  /** A visible note about the excerpt, for example that it was cut. */
  note?: string;
};
