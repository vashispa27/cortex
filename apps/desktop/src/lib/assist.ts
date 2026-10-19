import { invoke } from "@tauri-apps/api/core";
import { localRequest } from "./api";
import { aiTarget, ensureReady } from "./provider";
import { loadPreferences } from "./storage";

/** What the focus reader saw at the moment of a double-tap. Everything here came from the screen. */
export type FocusContext = {
  status: "ok" | "skipped";
  reason?: string | null;
  app_id: string;
  app_name: string;
  window_title: string;
  url?: string | null;
  source_type: "app" | "browser" | "browser_private";
  role: string;
  editable: boolean;
  multiline: boolean;
  text_before_caret: string;
  text_after_caret: string;
  selected_text: string;
  conversation_tail: string;
  recipient_hint?: string | null;
  /** Opaque revision of the field, handed back to the engine to guard a write. */
  target?: Record<string, unknown> | null;
};

export type IntentKind = "compose" | "autocomplete" | "summarize" | "rewrite";
export type IntentPayload = { intent: IntentKind; hint: string | null; context: FocusContext | null };
export type UndoToken = Record<string, unknown>;
export type ApplyResult =
  | { outcome: "applied"; undo: UndoToken | null }
  | { outcome: "panel"; code: string; reason: string }
  | { outcome: "recovery"; reason: string };
export type RewriteTone = "shorter" | "friendlier" | "formal" | "grammar";

export const TONES: { id: RewriteTone; label: string }[] = [
  { id: "shorter", label: "Shorter" },
  { id: "friendlier", label: "Friendlier" },
  { id: "formal", label: "More formal" },
  { id: "grammar", label: "Fix grammar only" },
];

type Prepared = { messages: { role: "system" | "user"; content: string }[]; max_tokens: number; temperature: number; truncated: boolean };

const COMPOSE_HINTS: Record<string, string> = {
  secure_field: "Can't read this field — rewind a thought instead",
  sensitive_app: "Rewind doesn't read this app — rewind a thought instead",
  excluded_app: "This app is excluded — rewind a thought instead",
  accessibility_not_granted: "Allow Accessibility to read fields — rewind a thought instead",
  private_window: "Off in private windows — rewind a thought instead",
};

/** Short text for the compose box when a double-tap could not read the field. */
export function composeHint(reason: string | null | undefined): string | null {
  return reason ? COMPOSE_HINTS[reason] ?? null : null;
}

/** "Replying to Priya" when the recipient is known, otherwise a plain label. */
export function assistChip(context: FocusContext, kind: "autocomplete" | "rewrite"): string {
  const recipient = context.recipient_hint?.trim();
  if (kind === "rewrite") return recipient ? `Rewriting for ${recipient}` : "Rewriting…";
  return recipient ? `Completing for ${recipient}…` : "Completing…";
}

/** "Safari · nytimes.com" for the quote above a summary. */
export function originLabel(context: FocusContext): string {
  let host = "";
  try { host = context.url ? new URL(context.url).hostname.replace(/^www\./, "") : ""; } catch { /* not a URL */ }
  return [context.app_name || context.app_id, host].filter(Boolean).join(" · ");
}

export function appInitial(context: FocusContext): string {
  return (context.app_name || context.app_id || "?").trim().charAt(0).toUpperCase();
}

/** Why a write did not land, in words for the notch. */
export function applyFailureMessage(result: ApplyResult, kind: "autocomplete" | "rewrite"): string {
  if (result.outcome === "applied") return "";
  if (result.outcome === "recovery") return "Rewind could not confirm the change. Check the field, or copy the text.";
  if (result.code === "TARGET_STALE") return kind === "rewrite" ? "Your selection changed. Copy the rewrite instead." : "The field changed, so Rewind did not insert.";
  return kind === "rewrite" ? "Couldn't replace here. Copy the rewrite instead." : "Couldn't insert here. Copy the text instead.";
}

/** Builds the redacted request in the local engine, runs the model once, and returns the reply. */
async function ask(kind: "autocomplete" | "rewrite" | "summarize", context: FocusContext, tone?: RewriteTone): Promise<{ raw: string; truncated: boolean }> {
  const preferences = loadPreferences();
  const target = aiTarget(preferences, kind === "autocomplete" ? "fast" : "main");
  await ensureReady(target);
  const prepared = await localRequest<Prepared>("POST", "/v1/assist/prepare", {
    kind, context, tone: tone ?? "", length: preferences.autocompleteLength, me: preferences.identity, private_windows: preferences.assistInPrivateWindows,
  });
  const raw = await invoke<string>("openrouter_complete", { model: target.model, messages: prepared.messages, maxTokens: prepared.max_tokens, temperature: prepared.temperature, endpoint: target.endpoint });
  return { raw, truncated: prepared.truncated };
}

/** The text to insert at the caret, or an empty string when there is no sensible continuation. */
export async function generateCompletion(context: FocusContext): Promise<string> {
  const { raw } = await ask("autocomplete", context);
  const finished = await localRequest<{ text: string }>("POST", "/v1/assist/finish", {
    kind: "autocomplete", raw, app_id: context.app_id, multiline: context.multiline, text_before_caret: context.text_before_caret,
  });
  return finished.text;
}

export async function generateRewrite(context: FocusContext, tone?: RewriteTone): Promise<string> {
  const { raw } = await ask("rewrite", context, tone);
  const finished = await localRequest<{ text: string }>("POST", "/v1/assist/finish", { kind: "rewrite", raw, original: context.selected_text });
  return finished.text;
}

export async function generateSummary(context: FocusContext): Promise<{ text: string; truncated: boolean }> {
  const { raw, truncated } = await ask("summarize", context);
  const finished = await localRequest<{ text: string }>("POST", "/v1/assist/finish", { kind: "summarize", raw, original: "" });
  return { text: finished.text, truncated };
}

export function applyText(context: FocusContext, text: string): Promise<ApplyResult> {
  return localRequest<ApplyResult>("POST", "/v1/assist/apply", {
    target: context.target, text, allow_paste: loadPreferences().allowPasteInsert, request_id: `assist-${Date.now()}`,
  });
}

export function undoInsertion(token: UndoToken): Promise<ApplyResult> {
  return localRequest<ApplyResult>("POST", "/v1/assist/undo", { token });
}

/** Whether the field and selection are still the ones read at the double-tap. */
export async function targetStillCurrent(context: FocusContext): Promise<boolean> {
  const result = await localRequest<{ current: boolean }>("POST", "/v1/assist/check", { target: context.target });
  return result.current;
}

/** The excerpt note shown with a summary when the selection was cut. */
export const TRUNCATED_NOTE = "Summarized the first ~24k characters";
