# Agent prompt: decision model for reminders, recurring reminders and permanent memories

You are working in the Cortex repo (`/Users/abhinavvashisht/workspace/rewind`). The goal: the user can set one-off and recurring reminders and save permanent memories (facts) by typing naturally in the Cortex chat (main chat and notch), and harnesses (Claude Code, Codex) can do the same through MCP. Today the chat uses a brittle regex router. Replace it with a **decision model**: a cloud LLM call that classifies the message and extracts structured fields, validated by code before anything is written.

**Cortex task:** `cortex-reminders-memory-decision-model`. Before you start, read its resume pack, then claim it with your harness name and session ID. Save progress to it as you go. When you finish, save a concrete handoff (what changed, how it was verified, what is left) and release it.

Read these first: `docs/chat-intent-routing.md`, `docs/scheduled-tasks.md`, `docs/permanent-memory.md`.

## 0. Hard rules

* **Model:** use a cloud model through the existing OpenRouter plumbing for now. The default is the user's configured model (currently `anthropic/claude-haiku-5.5`). Keep the provider call behind the same `AiTarget` / `aiTarget()` abstraction (`apps/desktop/src/lib/provider.ts`), so a local OpenAI-compatible model can be swapped in later with no code change.
* **Writes go through code, not the model.** The model only proposes an action as structured JSON. Rust and TS validation parse it into the existing typed structs (`deny_unknown_fields`) and call the existing `/v1/schedules/*` and fact endpoints. The model never gets a raw HTTP or shell tool.
* **What is sent to the cloud:** only the user's message, the last few chat turns, the current local time, weekday and IANA timezone, and the titles, IDs, timing and status of the user's existing schedules (needed for update, pause and cancel). Facts may be sent as subject and attribute only, never their values, unless they are needed to resolve "update my X". **No captured memory, snapshots or screen text.** Apply the same redaction used for cloud answers.
* **Local-only mode:** when `localOnly` is set, or the decision layer is off, do not call the cloud. Fall back to the current regex router (`apps/desktop/src/lib/intent.ts`), unchanged.
* **Failure:** if the call fails, times out (default 6s) or returns invalid JSON, fall back to the regex router. Never write anything from an output that did not validate.
* **Do not disturb existing work.** The working tree has a lot of uncommitted and untracked work on `main`, including `intent.ts`, `schedules.rs`, `schedule_runtime.rs`, `facts.rs`, the MCP `schedules.ts`, `ScheduledTasksPage` and `MemoriesPage`. Do not revert, reformat or delete any of it. Work in a git worktree on a new branch. Do not push.
* **Real data:** never read or write `~/Library/Application Support/Cortex/local-memory/` or the user's real `workspace.sqlite3`. Tests use temp directories.
* Existing tests must keep passing: `cargo test` for `memory`, `cortex` and `daemon`, the desktop `vitest` suite and the `crates/mcp` tests.

## 1. How it works today (verified 2026-10-25)

* **Reminders are schedules** with `action = reminder`, stored in Rust SQLite (`schedules` and `schedule_runs` tables).
  * Types: `crates/memory/src/schedules.rs:14-72`.
    * `Timing` = `Once{local_at}` | `Daily{time, weekdays}` | `AfterWake{time, window_end, weekdays}`.
    * `Action` = `Reminder{message}` | `Task{prompt, requires_live_sources}`.
  * TS mirror: `apps/desktop/src/lib/schedules.ts`.
  * Fired by `crates/memory/src/schedule_runtime.rs` (scans every 5s, notifies via `osascript` or `notify-send`).
  * Chat, the UI and MCP all POST to `/v1/schedules/{op}`. Routes: `crates/cortex/src/desktop.rs:548-555` and `crates/daemon/src/main.rs`. Allowlist: `apps/desktop/src-tauri/src/lib.rs:861`.
* **MCP schedule tools:** `crates/mcp/src/schedules.ts` provides create, list, get, update, pause, resume and cancel `_schedule`, plus `get_schedule_history`. Timing is structured through a zod schema. Harness models do their own parsing, so this path already works. It only needs the new recurrence types (section 4).
* **Facts:** `crates/memory/src/facts.rs`.
  * Each fact is `subject + attribute + value`, keyed on canonical subject and attribute.
  * `remember_fact` with a different value for an existing key is a conflict. Use `update_fact` with the current revision instead.
  * MCP tools: `remember_fact`, `recall_facts`, `update_fact`, `delete_fact` in `crates/mcp/src/workspace.ts`.
  * Desktop service: `apps/desktop/src/lib/memories.ts`.
  * A separate legacy store (`remember` / `search_permanent_memory`, kind `memory`) overlaps with facts. Leave it alone (section 6).
* **Chat entry:** `answerCortex` (`apps/desktop/src/lib/answer.ts:136`), called from `AskChat.tsx` and `Notch.tsx`, runs `routeIntent`, then `executeIntent` (`intent.ts:67,206`).
  * `routeIntent` is pure regex.
  * `executeIntent` already knows how to create, update, pause, resume or cancel schedules, save or update facts, ask a clarification (`pendingIntent` on the assistant message), or hand off to `answerFromMemory`.
* **Answer tool loop:** `apps/desktop/src-tauri/src/tools.rs` has read-only tools and `MAX_ROUNDS = 3`. Its system prompt says it has no write tools (`crates/cortex/src/answer_pipeline.rs:10`). **Keep it read-only.** The decision model is a separate step that runs before it.

## 2. Design: the decision step

Add a new layer `decide` (title "Reminders and memories") to `LayerId`, `apps/desktop/src/lib/layers.ts` and the preferences. Its `sends` text should honestly describe the data in rule 0. The default is cloud, using the answer model. It shows in Settings like the other layers.

New flow in `answerCortex`:

1. **Cheap pre-gate, no model.** If `intent.ts` already returns a confident `schedule_create`, `remember` or management intent, or the message obviously is not a write, skip the model.
   * A write must name a reminder or memory verb, or a time or recurrence phrase. Examples: remind, remember, don't forget, save, note, schedule, every, daily, weekly, monthly, cancel, pause, snooze, change, move, "at 5", tomorrow, weekday names.
   * Keep this gate broad. A false positive only costs one cheap call. A false negative silently drops the user's request.
2. **Decision call.** New Tauri command `decide_intent`, next to `openrouter_chat` in `src-tauri/src/lib.rs`. It reuses the same HTTP client, key handling, redaction and endpoint validation.
   * Send exactly one tool, `decide`, and force it with `tool_choice`.
   * Its arguments are a discriminated union:
     * `create_reminder`: message, timing, timezone, optional title.
     * `create_task`: same fields as `create_reminder`, but with a prompt instead of a message.
     * `update_schedule`: id and the changed fields.
     * `pause_schedule`, `resume_schedule`, `cancel_schedule`: id.
     * `list_schedules`.
     * `remember_fact`: subject, attribute, value.
     * `update_fact`: subject, attribute, new value.
     * `clarify`: question, plus a partial draft.
     * `answer`: not a write; pass through to the normal answer path.
   * The timing union is the one from section 4.
   * The model receives `now` (local ISO with offset), weekday, timezone and the schedule list. It resolves relative phrases itself ("Friday", "next week", "in 2 hours", "end of month") into concrete `local_at` values or a recurrence.
3. **Validate in code**, in both TS and Rust. Reject and turn into `clarify` when:
   * a one-off time is in the past;
   * the timezone is not a valid IANA name (map common abbreviations like IST, PST and EST in code, not in the model);
   * the hour is ambiguous (`5` with no am/pm and no clear context);
   * the message is empty;
   * an id is not in the schedule list.
4. **Execute** via the existing `executeIntent` branches. Map the decision output into the existing `Intent` type. Do not duplicate the write code.
   * **Create reminder, create task, remember a new fact:** execute right away. Reply with a short confirmation card ("Reminder set: Call mom, every Sunday 10:00 IST. Next: Oct 26") with **Undo**, which cancels the schedule or deletes the fact.
   * **Cancel, a fact overwrite (value changes), or an update that changes the timing of a recurring schedule:** reply with a confirm card first. Execute only on confirm. Reuse the `pendingIntent` mechanism.
   * **Clarify:** ask one question. Store the draft in `pendingIntent` so the next user reply completes it. The decision model gets the pending draft in its input on the next turn.
5. **Discussion guard.** The system prompt must say these mean `answer`, not a write: quoted text, code, hypotheticals, examples, reported speech ("she told me to remind her…") and questions about reminders ("how do reminders work?", "what reminders do I have?" means `list_schedules`). Keep the regex discussion guard as a code-side veto too.

Put the system prompt in one constant with a version tag. Keep it short: rules plus the schema. Use no more than 6 few-shot examples.

## 3. Phrasings that must work (turn these into tests)

* "remind me to call mom on Sunday at 10"
* "every weekday at 9am remind me to check standup notes"
* "remind me in 45 minutes to take the laundry out"
* "remind me on the 1st of every month to pay rent"
* "every 2 hours remind me to drink water" (interval; between 9:00 and 21:00 if the user says so)
* "next Friday 3pm: dentist"
* "don't forget, I have a call with Roop tomorrow at 5" (5 is ambiguous here: clarify am/pm, or resolve to 17:00 only if the prompt rules justify it; pick one rule and test it)
* "move my rent reminder to the 5th"
* "pause the water reminder", "cancel standup reminder", "what reminders do I have?"
* "remember that my passport number is X", "Rajesh's phone is 213132", "my wife's birthday is 14 March"
* "actually Rajesh's phone is 99999" (update with confirmation)
* Negatives that must not write: "how do I set a reminder?", "she said 'remind me tomorrow'", "if I said remember my PIN is 1234, would you store it?"

**Unit tests** use a fake chat provider that returns canned `decide` outputs, so they cover validation, mapping, confirm and undo flows, and fallback on error or timeout.

**Model eval** (`evals/decision/`, opt-in): a script that runs the real model over about 40 labeled phrasings, including the list above, and reports accuracy per action type and timing correctness. Do not run it in CI.

## 4. Recurrence

Extend `Timing` in `crates/memory/src/schedules.rs`, the TS mirror and the MCP zod schema with:

* `Weekly{time, weekdays}`, or keep `Daily{weekdays}` as the weekly form and just document it. Pick one and make the UI and MCP consistent.
* `Monthly{day, time}`, where day is 1-31 or -1 for the last day. Clamp days that don't exist in short months to the month's last day.
* `Interval{every_minutes, start_local, window_start?, window_end?, weekdays?}`, with a minimum of 15 minutes.

Update `next_due_ms` computation and add tests for these cases:

* DST transitions;
* month ends;
* the day-31 clamp;
* interval windows that cross midnight (reject or define the behavior);
* catch-up after sleep (do not fire a backlog: deliver once and advance).

Add **snooze**: a `snooze_schedule(id, minutes)` endpoint and MCP tool, and a "Snooze 10m" option in the chat or Undo card if cheap. If it isn't, write it into the handoff as a follow-up.

Update `ScheduledTasksPage` so it can display and edit the new timings. Update the MCP tool descriptions with one example per timing type, so harness models pick the right one.

## 5. MCP and harnesses

* MCP keeps structured tools. Do not add a natural-language MCP tool; the harness model is the decision model there.
* Make sure `create_schedule`, `update_schedule`, `remember_fact` and `update_fact` return the normalized result (next due time in the user's timezone, fact revision), so the harness can confirm back to the user.
* Update `crates/mcp/README.md`, plus the tests in `crates/mcp/src/*.test.ts`.

## 6. Out of scope (note in handoff, do not do)

* Merging the legacy `remember` notes store into facts.
* Moving scheduled `task` actions off `CORTEX_SCHEDULE_OPENAI_API_KEY` onto the app provider.
* A local decision model (the layer abstraction must allow it, but do not wire up Ollama or MLX now).
* Windows notifications.

## 7. Done means

* Every phrasing in section 3 works in the main chat and in the notch, verified in the running app with `vitest` plus a manual run. Show a screenshot or transcript in the handoff.
* Local-only mode still uses the regex router with no network call. Verify by checking the network log or by a test that asserts the cloud provider is not called.
* New recurrence types fire correctly. Show the runtime tests, plus one real notification observed for a one-minute interval or near-term reminder.
* Docs are updated: `docs/chat-intent-routing.md` (new flow, layer, fallback), `docs/scheduled-tasks.md` (timings, snooze) and `docs/permanent-memory.md` (chat writes, confirm on overwrite).
* All test suites pass. Commits are on your branch with clear messages, not pushed. The Cortex task handoff lists the branch name, the test commands run and their results, and the open follow-ups.
