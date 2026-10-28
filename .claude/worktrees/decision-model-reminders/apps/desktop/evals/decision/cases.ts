// Labeled phrasings for the decision model. Fixed clock: Sunday 2026-10-25 12:30 in Asia/Kolkata.
import type { Schedule } from "../../src/lib/schedules";

export const NOW = new Date("2026-10-25T07:00:00Z");
export const TIMEZONE = "Asia/Kolkata";

const base = { revision: 2, status: "active" as const, timezone: TIMEZONE, next_due_ms: 1, next_due_local: null, created_ms: 1, updated_ms: 1 };
export const SCHEDULES: Schedule[] = [
  { ...base, id: "s-rent", title: "Pay rent", timing: { type: "monthly", day: 1, time: "09:00" }, action: { type: "reminder", message: "Pay rent" } },
  { ...base, id: "s-water", title: "Drink water", timing: { type: "interval", every_minutes: 120, start_local: "2026-10-25T09:00", window_start: "09:00", window_end: "21:00" }, action: { type: "reminder", message: "Drink water" } },
  { ...base, id: "s-standup", title: "Check standup notes", timing: { type: "daily", time: "09:00", weekdays: [1, 2, 3, 4, 5] }, action: { type: "reminder", message: "Check standup notes" } },
];
export const FACTS = [{ subject: "Rajesh", attribute: "phone" }, { subject: "self", attribute: "email" }];

export type Label =
  | "schedule_create" | "schedule_update" | "schedule_snooze" | "clarify" | "answer" | "remember"
  | "list" | "pause" | "resume" | "cancel";
export type Case = {
  message: string;
  expect: Label;
  /** Subset the proposed timing must match (create / update). `local_at` may drift by `toleranceMinutes`. */
  timing?: Record<string, unknown>;
  toleranceMinutes?: number;
  /** For manage, snooze and update: the schedule id the model must pick. */
  scheduleId?: string;
  minutes?: number;
  /** For remember: subject, attribute (normalized) and value. */
  fact?: { subject: string; attribute: string; value: string };
  /** For create: "task" when Cortex should generate an answer rather than notify. */
  action?: "reminder" | "task";
};

export const CASES: Case[] = [
  // One-off reminders
  { message: "remind me to call mom on Sunday at 10am", expect: "schedule_create", timing: { type: "once", local_at: "2026-11-01T10:00" } },
  { message: "remind me tomorrow at 9am to submit the report", expect: "schedule_create", timing: { type: "once", local_at: "2026-10-26T09:00" } },
  { message: "remind me in 45 minutes to take the laundry out", expect: "schedule_create", timing: { type: "once", local_at: "2026-10-25T13:15" }, toleranceMinutes: 2 },
  { message: "remind me in 2 hours to check the oven", expect: "schedule_create", timing: { type: "once", local_at: "2026-10-25T14:30" }, toleranceMinutes: 2 },
  { message: "Friday 3pm: dentist", expect: "schedule_create", timing: { type: "once", local_at: "2026-10-30T15:00" } },
  { message: "remind me at 5:30pm today to leave for the airport", expect: "schedule_create", timing: { type: "once", local_at: "2026-10-25T17:30" } },
  { message: "remind me on March 3rd at 8am about the passport renewal", expect: "schedule_create", timing: { type: "once", local_at: "2027-03-03T08:00" } },
  { message: "tonight at 9 remind me to call dad", expect: "schedule_create", timing: { type: "once", local_at: "2026-10-25T21:00" } },
  { message: "remind me on 2026-11-02 at 7am to renew insurance, timezone IST", expect: "schedule_create", timing: { type: "once", local_at: "2026-11-02T07:00" } },
  // Recurring
  { message: "every weekday at 9am remind me to check standup notes", expect: "schedule_create", timing: { type: "daily", time: "09:00", weekdays: [1, 2, 3, 4, 5] } },
  { message: "remind me every Sunday at 10am to call mom", expect: "schedule_create", timing: { type: "daily", time: "10:00", weekdays: [7] } },
  { message: "remind me every day at 8pm to take vitamins", expect: "schedule_create", timing: { type: "daily", time: "20:00" } },
  { message: "remind me on the 1st of every month at 9am to pay rent", expect: "schedule_create", timing: { type: "monthly", day: 1, time: "09:00" } },
  { message: "remind me on the last day of every month at 6pm to submit my timesheet", expect: "schedule_create", timing: { type: "monthly", day: -1, time: "18:00" } },
  { message: "every 2 hours remind me to drink water between 9am and 9pm", expect: "schedule_create", timing: { type: "interval", every_minutes: 120, window_start: "09:00", window_end: "21:00" } },
  { message: "every morning at 8am give me a stock market briefing", expect: "schedule_create", timing: { type: "daily", time: "08:00" }, action: "task" },
  // Must ask
  { message: "don't forget, I have a call with Roop tomorrow at 5", expect: "clarify" },
  { message: "remind me to call mom on Sunday at 10", expect: "clarify" },
  { message: "remind me to call Priya", expect: "clarify" },
  { message: "every morning remind me to stretch", expect: "clarify" },
  { message: "pause the gym reminder", expect: "clarify" },
  // Managing existing schedules
  { message: "move my rent reminder to the 5th", expect: "schedule_update", scheduleId: "s-rent", timing: { type: "monthly", day: 5 } },
  { message: "change the standup reminder to 9:30am", expect: "schedule_update", scheduleId: "s-standup", timing: { type: "daily", time: "09:30" } },
  { message: "pause the water reminder", expect: "pause", scheduleId: "s-water" },
  { message: "resume the water reminder", expect: "resume", scheduleId: "s-water" },
  { message: "cancel the standup reminder", expect: "cancel", scheduleId: "s-standup" },
  { message: "snooze the water reminder for 20 minutes", expect: "schedule_snooze", scheduleId: "s-water", minutes: 20 },
  { message: "what reminders do I have?", expect: "list" },
  { message: "show my reminders", expect: "list" },
  // Facts
  { message: "remember that my passport number is X1234567", expect: "remember", fact: { subject: "self", attribute: "passport number", value: "X1234567" } },
  { message: "Rajesh's phone is 213132", expect: "remember", fact: { subject: "Rajesh", attribute: "phone", value: "213132" } },
  { message: "my wife's birthday is 14 March", expect: "remember", fact: { subject: "wife", attribute: "birthday", value: "14 March" } },
  { message: "actually Rajesh's phone is 99999", expect: "remember", fact: { subject: "Rajesh", attribute: "phone", value: "99999" } },
  { message: "save this: my wifi password is hunter2", expect: "remember", fact: { subject: "self", attribute: "wifi password", value: "hunter2" } },
  { message: "my email is abhi@example.com", expect: "remember", fact: { subject: "self", attribute: "email", value: "abhi@example.com" } },
  // Must not write
  { message: "how do I set a reminder?", expect: "answer" },
  { message: "she said 'remind me tomorrow'", expect: "answer" },
  { message: "if I said remember my PIN is 1234, would you store it?", expect: "answer" },
  { message: "what does a monthly reminder do on the 31st?", expect: "answer" },
  { message: "my phone is dead again", expect: "answer" },
  { message: "I forgot to remind Sam about the invoice yesterday", expect: "answer" },
  { message: "remember when we went to Goa last year?", expect: "answer" },
  { message: "what's Rajesh's phone number?", expect: "answer" },
  { message: "what did I read yesterday?", expect: "answer" },
];
