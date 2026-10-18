import { invoke, isTauri } from "@tauri-apps/api/core";

export type NotchMode = "collapsed" | "compose" | "thinking" | "answer" | "history";

export type MainPage = "today" | "timeline" | "ask" | "memory" | "settings";

const activeSessionKey = "open-memory.rewind.active-session.v1";

export async function setNotchMode(mode: NotchMode, focus = true, reduceMotion = false): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("notch_set_mode", { mode, focus, reduceMotion });
  } catch {
    // The notch window is optional; the rest of the workspace still works.
  }
}

export async function setNotchVisible(visible: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("notch_set_visible", { visible });
  } catch {
    // Hiding the drop is a shell preference and should never block another action.
  }
}

export async function openMain(page: MainPage): Promise<void> {
  if (!isTauri()) {
    window.open(`/?page=${page}`, "_blank", "noopener");
    return;
  }
  try {
    await invoke("open_main", { page });
  } catch {
    // Ignore: the dashboard may be unavailable while the app is shutting down.
  }
}

export async function configureRewindTrigger(trigger: string, enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("set_rewind_trigger", { trigger, enabled });
  } catch {
    // The trigger is optional; the mouse controls still work.
  }
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("quit_rewind");
  } catch {
    // Ignore shutdown errors.
  }
}

export async function restorePreviousApp(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("restore_previous_app");
  } catch {
    // Restoring the previous app is best effort.
  }
}

export async function previewNotch(mode: NotchMode): Promise<void> {
  if (!isTauri()) {
    const url = `/index.html?window=notch&preview=1&mode=${mode}`;
    const preview = window.open(url, "open-memory-notch-preview", "popup,width=700,height=520");
    if (preview && preview.location.href !== new URL(url, window.location.href).href) {
      try { preview.location.href = url; } catch { /* Cross-window navigation can be blocked. */ }
    }
    preview?.focus();
    return;
  }
  try {
    await invoke("notch_preview", { mode });
  } catch {
    // No-op when the notch window is not available.
  }
}

export function writeActiveSession(id: string): void {
  try {
    localStorage.setItem(activeSessionKey, id);
  } catch {
    // A full storage quota should not stop the window from opening.
  }
}

export function takeActiveSession(): string | null {
  try {
    const id = localStorage.getItem(activeSessionKey);
    if (id) localStorage.removeItem(activeSessionKey);
    return id;
  } catch {
    return null;
  }
}
