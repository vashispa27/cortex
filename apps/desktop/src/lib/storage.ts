export type Preferences = {
  onboardingComplete: boolean;
  sampleMode: boolean;
  reduceMotion: boolean;
  textScale: number;
  edge: "left" | "right";
  hoverOpen: boolean;
  proactive: boolean;
  backgroundInference: boolean;
  mcpConsent: boolean;
  microphoneConsent: boolean;
  captureConsent: boolean;
  retentionDays: number;
  excludedApps: string;
  excludedDomains: string;
  identity: string;
};

export const defaultPreferences: Preferences = {
  onboardingComplete: false,
  sampleMode: false,
  reduceMotion: false,
  textScale: 100,
  edge: "right",
  hoverOpen: false,
  proactive: false,
  backgroundInference: false,
  mcpConsent: false,
  microphoneConsent: false,
  captureConsent: false,
  retentionDays: 90,
  excludedApps: "",
  excludedDomains: "",
  identity: "",
};

const key = "open-memory.desktop.preferences.v1";

export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return { ...defaultPreferences, ...saved };
  } catch {
    return { ...defaultPreferences };
  }
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(key, JSON.stringify(preferences));
}

export type Reminder = {
  id: string;
  text: string;
  at: string;
  repeat: "none" | "daily";
  delivered: string[];
};

const reminderKey = "open-memory.desktop.reminders.v1";

export function loadReminders(): Reminder[] {
  try {
    const value = JSON.parse(localStorage.getItem(reminderKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveReminders(reminders: Reminder[]): void {
  localStorage.setItem(reminderKey, JSON.stringify(reminders));
}

export function dueOccurrence(reminder: Reminder, now: Date): string | null {
  const scheduled = new Date(reminder.at);
  if (Number.isNaN(scheduled.getTime())) return null;
  if (reminder.repeat === "none") {
    const key = scheduled.toISOString();
    return scheduled <= now && !reminder.delivered.includes(key) ? key : null;
  }
  const occurrence = new Date(now);
  occurrence.setHours(scheduled.getHours(), scheduled.getMinutes(), 0, 0);
  if (occurrence < scheduled || occurrence > now) return null;
  const key = occurrence.toISOString();
  return reminder.delivered.includes(key) ? null : key;
}
