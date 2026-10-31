import { isTextDocument, type AgentDocument } from "./agents";

/** What was typed or attached in the notch but not sent yet; it survives the notch closing when you click away. */
export type NotchDraft = { input: string; historyInput: string; agent: boolean; files: AgentDocument[] };
const key = "cortex.notch.draft.v1";
const empty: NotchDraft = { input: "", historyInput: "", agent: false, files: [] };

export function loadNotchDraft(): NotchDraft {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      input: typeof raw.input === "string" ? raw.input : "",
      historyInput: typeof raw.historyInput === "string" ? raw.historyInput : "",
      agent: raw.agent === true,
      files: Array.isArray(raw.files) ? raw.files.filter((f: AgentDocument) => f && typeof f.name === "string" && typeof f.content === "string" && isTextDocument(f.name, f.content, f.media_type)).slice(0, 20) : [],
    };
  } catch { return empty; }
}

export function saveNotchDraft(draft: NotchDraft): void {
  try {
    if (!draft.input && !draft.historyInput && !draft.agent && !draft.files.length) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  } catch { /* Over quota: the draft still lives in memory while the notch is open. */ }
}
