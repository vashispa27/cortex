import type { MemoryHit } from "./api";
import type { RewindTrigger } from "./storage";
import type { ChatMessage } from "./types";

export type RewindSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const storageKey = "open-memory.rewind.sessions.v1";
const maxSessions = 30;

export function sessionTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled rewind";
  return normalized.length > 54 ? `${normalized.slice(0, 53)}…` : normalized;
}

export function loadSessions(): RewindSession[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((session): session is RewindSession => Boolean(session) && typeof session.id === "string" && typeof session.title === "string" && Array.isArray(session.messages))
      .map((session) => ({
        ...session,
        createdAt: Number(session.createdAt) || Date.now(),
        updatedAt: Number(session.updatedAt) || Date.now(),
        messages: session.messages.filter((message): message is ChatMessage => Boolean(message) && (message.role === "user" || message.role === "assistant") && typeof message.body === "string"),
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, maxSessions);
  } catch {
    return [];
  }
}

export function saveSessions(sessions: RewindSession[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sessions.slice(0, maxSessions)));
  } catch {
    // Session persistence is best effort; the active chat still works in memory.
  }
}

export function newSession(question: string, now = Date.now()): RewindSession {
  const message: ChatMessage = { role: "user", body: question };
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rewind-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: sessionTitle(question),
    createdAt: now,
    updatedAt: now,
    messages: [message],
  };
}

export function appendMessage(session: RewindSession, message: ChatMessage, now = Date.now()): RewindSession {
  return { ...session, updatedAt: now, messages: [...session.messages, message] };
}

export function upsertSession(sessions: RewindSession[], session: RewindSession): RewindSession[] {
  return [session, ...sessions.filter((item) => item.id !== session.id)]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, maxSessions);
}

/** Merge into the stored list, not a stale in-memory copy: the notch and the
 * dashboard are separate windows that both write sessions. */
export function commitSession(session: RewindSession): RewindSession[] {
  const next = upsertSession(loadSessions(), session);
  saveSessions(next);
  return next;
}

export const sessionsStorageKey = storageKey;

export function sessionTime(value: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - value) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1d" : `${days}d`;
}

export function triggerSymbol(trigger: RewindTrigger): string {
  switch (trigger) {
    case "fn": return "fn";
    case "leftShift":
    case "rightShift": return "⇧";
    case "leftControl":
    case "rightControl": return "⌃";
    default: return "⌥";
  }
}

export function triggerName(trigger: RewindTrigger): string {
  switch (trigger) {
    case "leftOption": return "Left Option";
    case "rightOption": return "Right Option";
    case "fn": return "Globe / Fn";
    case "leftShift": return "Left Shift";
    case "rightShift": return "Right Shift";
    case "leftControl": return "Left Control";
    case "rightControl": return "Right Control";
    default: return "Right Option";
  }
}

export function composeAnswer(question: string, hits: MemoryHit[], sample: boolean): string {
  if (!hits.length) {
    return "I couldn't find a match in memory yet. Capture may have been off, paused, or this may not have been on screen.";
  }
  const top = hits[0];
  const excerpt = top.excerpt.replace(/\s+/g, " ").trim();
  const short = excerpt.length > 420 ? `${excerpt.slice(0, 419)}…` : excerpt;
  const sourceWord = hits.length === 1 ? "source" : "sources";
  const prefix = sample ? "From the sample workspace" : "From your local memory";
  return `${short || `The closest match is ${top.title || "an untitled window"}.`}\n\n${prefix}, I found ${hits.length} related ${sourceWord} for “${question.trim()}”.`;
}
