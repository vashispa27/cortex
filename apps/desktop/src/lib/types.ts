import type { MemoryHit } from "./api";

export type Page = "today" | "timeline" | "ask" | "memory" | "wiki" | "write" | "reminders" | "settings";

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

export type ChatMessage = { role: "user" | "assistant"; body: string; hits?: MemoryHit[] };
