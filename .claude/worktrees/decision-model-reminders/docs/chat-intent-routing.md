# Cortex chat intent routing

Ask Cortex (`components/AskChat.tsx`) and the notch chat (`Notch.tsx`) call `answerCortex` in `apps/desktop/src/lib/answer.ts`. Routing happens **before** activity retrieval, follow-up model rewrites or answer-provider credential checks. The existing Ask Cortex conversation and sample mode remain available. Workspace navigation is described in [Cortex workspace](workspace.md).

## Flow

```
message ──► routeIntent (regex, pure) ──► regex intent
   │
   ▼
decideWrite (decision-flow.ts) ── null ──► use the regex intent
   │ proposed Intent
   ▼
executeIntent ──► schedule / memory services (the same endpoints the UI and MCP use)
```

1. **Regex router** (`intent.ts`, `routeIntent`) always runs first. It is pure, offline and unchanged in behavior: it parses simple phrasings (“remind me tomorrow at 2pm to …”, “every weekday at 9am remind me to …”, “remember Rajesh’s phone number is 213132”) and decides activity versus general questions.
2. **Decision step** (`decide.ts`, `decision-flow.ts`) asks a cloud model for help only when the message might be a write the regex router could not finish. It is called **only if all of these hold**:
   - the **“Reminders and memories”** layer is on, runs in the cloud, and **local-only mode is off** (a local decision model is not wired up yet, so a local target means the regex router);
   - the message passes the **pre-gate** (`mayWrite`): it names a reminder or memory verb (remind, remember, don’t forget, save, note, schedule, cancel, pause, snooze, change, move, actually, …), a time or recurrence phrase (every, daily, monthly, tomorrow, “at 5”, “in 45 minutes”, a weekday or month name, “the 1st”), or is a bare possessive statement (“Rajesh’s phone is …”). The gate is broad on purpose: a false positive costs one cheap call, a false negative silently drops a request;
   - the **veto** (`isDiscussion`) does not fire. Quoted or code text, messages starting “if / suppose / how / why”, “would you store …”, hypotheticals, examples and reported speech (“she said remind me …”) can never write;
   - the regex router is not already confident (a complete `schedule_create` or `remember`, or a management command that names exactly one schedule, skips the model);
   - the provider is configured and the local engine can list schedules and facts. Any failure here is silent and uses the regex intent.
3. The model is offered **one tool, `decide`, forced with `tool_choice`** (Tauri command `decide_intent`). It returns a discriminated action: `create_reminder`, `create_task`, `update_schedule`, `pause_schedule`, `resume_schedule`, `cancel_schedule`, `snooze_schedule`, `list_schedules`, `remember_fact`, `update_fact`, `clarify`, `answer`. It gets no HTTP, shell or memory tool, and the shell rejects any reply that is not exactly one `decide` call with a JSON object.
4. **Code validates** the arguments (`resolveDecision`) and maps them to the existing `Intent` type, so the write path is the one code, not duplicated:
   - a one-off time in the past, an impossible date, a malformed or unsupported timing, an interval under 15 minutes, a window that crosses midnight, an empty message, or a schedule id that is not in the user's list becomes a **question** (`clarify`);
   - timezone abbreviations (IST, PST, EST, …) are mapped to IANA names **in code**; an unknown zone becomes a question;
   - **ambiguous hours are never guessed.** A bare hour 1–12 after “at”/“@” (or `h:mm`) with no am/pm and no morning/afternoon/evening/night/noon word (“at 5”) always asks “Is that time am or pm?”, even when the model resolved it to 17:00. The rule is checked against everything the user typed toward the request, so replying “5pm” completes it;
   - a fact value must appear in the user’s own text.
5. **Execute** (`executeIntent`):
   - Creating a reminder or task, or saving a **new** fact, runs immediately. The reply is a confirmation card (“Reminder saved: Call mom — every Sunday at 10:00 (Asia/Kolkata). Next: 2026-10-25 10:00.”) with an **Undo** button that cancels the schedule or deletes the fact.
   - **Cancel, a fact whose value would change, and a timing change on a recurring schedule** get a confirm card first (Confirm / Cancel buttons, or reply “yes” / “no”). Only the confirmed intent writes. Pause, resume, list and snooze run immediately.
   - `clarify` asks one question and stores the draft in `pendingIntent`. The next reply is sent to the model together with that draft (and the user text so far), so “10am” completes “remind me to call mom on Sunday at 10”. “never mind” drops it.
   - `answer` hands the message to the normal answer path.

## Fallback and local-only

The regex router is the fallback for every failure: the layer off, local-only mode, a local target, sample mode, no API key, the engine unreachable, a network error or HTTP error, **timeout (6 s by default, raced again in the page)**, the model replying with prose or another tool, invalid JSON, an unknown action, or output that fails validation in a way that is not a question. Nothing is written from output that did not validate. In local-only mode no request is made at all: tests assert the cloud provider is never invoked and that the schedule and fact lists are not even read for the decision.

## What is sent to the cloud

Only for a message that passes the gate: the message itself (as typed, because the value the user asked to save is in it), the last four chat turns (truncated to 300 characters), the current local time with offset, weekday and IANA timezone, the **titles, ids, timing and status** of the user’s schedules, and the **subject and attribute of saved facts, never their values**. The context is masked by the engine’s redaction (`/v1/assistant/redact`) before sending, and the call fails closed if redaction fails. No captured memory, snapshots or screen text is included. The layer’s row in Settings → AI model states this and lets the user turn the step off or pick its model; a local OpenAI-compatible endpoint is accepted by the command, but the page does not use one yet (out of scope for now).

The system prompt is one constant (`DECIDE_SYSTEM_PROMPT`, version `decide-v1`) with the rules, the schema and six examples. The answer tool loop (`tools.rs`) stays read-only and still tells the model it has no write tools.

## Shared boundary

`intent.ts` exports the pure `routeIntent(input, {now, timezone, pending?})`, typed `Intent`, `executeIntent(intent, history, services)` and `runChatAction` (the buttons). `IntentServices` injects `MemoryService`, `ScheduleService`, the existing activity/general answer callback, and a request ID generator. Other natural-language hosts can reuse these without importing a React component. Structured MCP tools call the backend directly, bypassing classification; there is deliberately no natural-language MCP tool because the harness model is the decision model there.

The contracts used are documented in [permanent-memory.md](permanent-memory.md) and [scheduled-tasks.md](scheduled-tasks.md). Backend errors propagate to the existing chat error display, with no success response or activity-search fallback.

## Regex router behavior

- `Remind me to send my resume tomorrow at 2pm` creates a one-time reminder using the device’s IANA timezone. `today`, `tonight`, ISO dates, `every day`/`daily`, and relative minutes/hours are supported. Recurring commands can lead with `every morning/night/evening/day/weekday at <time>`, follow the reminder content, or use `remind me every morning at <time> to …`. Weekdays select Monday–Friday. `Every morning at 08:00 give me a stock market briefing` creates an answer-generating task. Exact times are required; no default morning hour is guessed.
- `List my reminders`, `Pause reminder <exact title or ID>`, `Resume reminder …`, `Cancel reminder …`, and `Reschedule reminder <title or ID> to tomorrow at 3pm` use schedule APIs. Reads fetch the current revision before mutations. Ambiguous targets require an exact title/ID (the decision model resolves fuzzy names such as “the water reminder” to an id). Cancel and rescheduling a recurring schedule ask for confirmation.
- Missing dates, missing/ambiguous times (`at 2`), unsupported calendar expressions, and timezone abbreviations require clarification. Known fields stay in the draft across turns (`remind me to eat dinner at 11pm` then `today`). Contradictions such as `every morning at 11pm` ask for AM versus PM. Backend date, future-time and DST validation remains authoritative.
- `Remember Rajesh’s phone number is 213132` saves `{subject: "Rajesh", attribute: "phone", value: "213132", channel: "chat"}` with the explicit request as provenance. `my` maps to `self`; phone/email attribute aliases are normalized (`emial`, `e-mail` → `email`). A different value for an existing subject/attribute is confirmed before it replaces the old one. Identical saves use the backend’s idempotent remember operation.
- `What is Rajesh’s phone number?` reads permanent facts directly, keeping them distinct from captured activity. Competing matches are displayed with their subjects/attributes rather than silently picking a person. `Show my saved facts` lists permanent facts.
- `What did I read yesterday?` and ordinary searches use the unchanged semantic activity pipeline and its read-only tool loop. General questions keep the existing general-answer path. Uncertain personal queries search both domains. Mixed queries pass recalled facts as `permanent_facts` (bounded to 24,000 characters) to `/v1/assistant/prepare`, redacted and marked untrusted. Answer prompt version is `answer-v8`.

Anchored commands distinguish direct instructions from quotes, code blocks, examples, hypotheticals, reported speech and discussions. Instructions embedded in retrieved facts, captured pages or history cannot trigger mutations. The natural-language grammar is not a general calendar parser; schedule management refuses incomplete paginated matches rather than treating one page as exhaustive. There is no automatic retry of failed writes.

## Phrasings covered

Tests (`decide.test.ts`) run each of these through the real gate, veto, validation and executor with a fake provider that returns canned `decide` calls: “remind me to call mom on Sunday at 10” (asks am/pm, then “10am” completes it), “every weekday at 9am remind me to check standup notes” (regex, no model), “remind me in 45 minutes to take the laundry out”, “remind me on the 1st of every month to pay rent” (asks the time), “every 2 hours remind me to drink water” (window 9–21), “next Friday 3pm: dentist”, “don’t forget, I have a call with Roop tomorrow at 5” (asks am/pm), “move my rent reminder to the 5th” (confirm), “pause the water reminder”, “cancel standup reminder” (confirm), “what reminders do I have?”, “remember that my passport number is X”, “Rajesh’s phone is 213132”, “my wife’s birthday is 14 March”, “actually Rajesh’s phone is 99999” (confirm), and the negatives “how do I set a reminder?”, “she said ‘remind me tomorrow’”, “if I said remember my PIN is 1234, would you store it?”, none of which reach the model or write.

`evals/decision/` (opt-in, `npm run eval:decision`, see `apps/desktop/evals/README.md`) scores the real model on about 45 labeled phrasings, including timing correctness and a hard zero on false writes.

## Validation

```sh
npm test --prefix apps/desktop
npm run build --prefix apps/desktop
cargo test -p cortex-memory -p cortex-daemon -p cortex
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
npm test --prefix crates/mcp
```

Tests exercise direct commands, ordinary searches, mixed evidence, permanent corrections with confirmation, lexical overlap, temporal clarification/resumption, timezone date boundaries, quoted/hypothetical commands, schedule revisions/rescheduling, backend failures, the decision flow (gate, veto, validation, mapping, confirm and Undo flows, fallback on error, prose, bad JSON and timeout, and no cloud call in local-only mode), and the shell’s requirement that a decision reply be exactly one `decide` call. These checks use fake transports; they do not create real user reminders. A live-model run is the opt-in eval above.
