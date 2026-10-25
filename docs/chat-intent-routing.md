# Cortex chat intent routing

Ask Cortex (`components/AskChat.tsx`) and the notch chat (`Notch.tsx`) now call `answerCortex` in `apps/desktop/src/lib/answer.ts`. Routing happens **before** activity retrieval, follow-up model rewrites or provider credential checks. The existing Ask Cortex conversation and sample mode remain available. Workspace navigation is described in [Cortex workspace](workspace.md).

## Shared boundary

`apps/desktop/src/lib/intent.ts` exports the pure `routeIntent(input, {now, timezone, pending?})`, typed `Intent`, and `executeIntent(intent, history, services)`. Other natural-language hosts can reuse these without importing a React component. `IntentServices` injects `MemoryService`, `ScheduleService`, the existing activity/general answer callback, and a request ID generator. External hosts supply their own authenticated transports using `createMemoryService` / `createScheduleService`; no new MCP tool or server is required. Structured MCP tools continue to call the backend directly, bypassing classification.

The contracts used are documented in [permanent-memory.md](permanent-memory.md) and [scheduled-tasks.md](scheduled-tasks.md). Both implementations were present and inspected; neither is stubbed. Backend errors propagate to the existing chat error display, with no success response or activity-search fallback. A provider/API key is not required to persist a fact or reminder.

## Behavior

- `Remind me to send my resume tomorrow at 2pm` creates a one-time reminder using the device's IANA timezone. `today`, `tonight`, ISO dates, `every day`/`daily`, and relative minutes/hours are supported. Recurring commands can lead with `every morning/night/evening/day/weekday at <time>`, follow the reminder content, or use `remind me every morning at <time> to …`. Weekdays select Monday–Friday. `Every morning at 08:00 give me a stock market briefing` creates an answer-generating task. Exact times are required; no default morning hour is guessed. `Schedule a task to summarize the news every day at 08:00` creates a scheduled task.
- `List my reminders`, `Pause reminder <exact title or ID>`, `Resume reminder …`, `Cancel reminder …`, and `Reschedule reminder <title or ID> to tomorrow at 3pm` use schedule APIs. Reads fetch the current revision before mutations. Ambiguous targets require an exact title/ID; the router never chooses one arbitrarily or performs bulk cancellation. Rescheduling preserves the action.
- Missing dates, missing/ambiguous times (`at 2`), unsupported calendar expressions, and timezone abbreviations require clarification. Known message/date/time/timezone fields remain in the draft: `remind me to eat dinner at 11pm` followed by `today` retains 23:00 and “eat dinner”. Timing-only requests ask for reminder content instead of saving the timing text as a title. Contradictions such as `every morning at 11pm` ask for AM versus PM and retain the recurring action; a reply like `11am` or `11pm` resolves them. Short temporal replies (including an explicit IANA timezone) can complete the immediately preceding schedule draft, including across the notch/dashboard session handoff. A new topic abandons that pending context. Backend date, future-time and DST validation remains authoritative.
- `Remember Rajesh’s phone number is 213132` saves `{subject: "Rajesh", attribute: "phone", value: "213132", channel: "chat"}` with the explicit request as provenance. `my` maps to `self`; phone/email attribute aliases are normalized. Known fields also accept shorthand without “is”, such as `remember my email user@example.com` and `remember my phone number 123`. The field spellings `emial` and `e-mail` normalize to `email` for saving, correction and recall; the supplied address/value is preserved exactly, including an unusual domain such as `.coim`. Missing values still require clarification, and shorthand parsing is limited to known field names. An exact existing subject/attribute can be corrected with its current revision. Identical saves use the backend's idempotent remember operation. Unsupported fact syntax asks for the subject, attribute and value.
- `What is Rajesh’s phone number?` reads permanent facts directly, keeping them distinct from captured activity. Explicit subject/attribute constraints filter lexical overlaps. Competing matches are displayed with their subjects/attributes rather than silently picking a person. `Show my saved facts` lists permanent facts.
- `What did I read yesterday?` and ordinary searches use the unchanged semantic activity pipeline and its read-only tool loop. General questions keep the existing general-answer path. Uncertain personal queries search both domains.
- Mixed queries recall permanent facts before preparing activity evidence. Complete fact records (bounded to 24,000 characters, with an omission count) are passed as `permanent_facts` to `/v1/assistant/prepare`, redacted by the engine and marked as untrusted data. Saved facts use `[fact:ID]` references; numeric snapshot IDs remain exclusive to activity. Answer prompt version is `answer-v8`.

Classification is conservative and local; it does not ask a model to authorize writes. Anchored commands distinguish direct instructions from quotes, code blocks, examples, hypotheticals, reported speech and discussions. Instructions embedded in retrieved facts, captured pages or history cannot trigger mutations. The existing answer path explicitly tells the model it has no write tools and must not claim to have persisted anything.

The natural-language grammar covers the forms above; it is not a general calendar parser. Unsupported schedule instructions are clarified rather than guessed. Direct structured APIs retain their full capabilities, including after-wake schedules, weekday restrictions and full-spec edits. Schedule management refuses incomplete paginated matches rather than treating one page as exhaustive; larger collections can be managed through the existing schedule page or structured tools. There is no automatic retry of failed writes.

## Validation

```sh
npm test --prefix apps/desktop
npm run build --prefix apps/desktop
cargo test -p cortex answer_pipeline
cargo check -p cortex
npm test --prefix crates/mcp
```

Tests exercise direct commands, ordinary searches, mixed evidence, permanent corrections, lexical overlap, temporal clarification/resumption, timezone date boundaries, quoted/hypothetical commands, schedule revisions/rescheduling, and backend failures. A deferred persistence test verifies that no confirmation resolves before the create API succeeds. Mixed-answer tests verify separate fact context, engine redaction, evidence separation and updated prompt hashes. These checks use fake transports; they do not create real user reminders or assert visible OS notification delivery.

## Recurring-request regression coverage

The schedule router, rather than the read-only answer model, owns scheduling. Prefix recurring requests previously fell through to the general-answer path, which correctly has no write tools but then incorrectly described the whole app as unable to schedule. Recognized recurring commands and their clarification replies now call `ScheduleService.create` on the same backend exposed by MCP. Structured external MCP clients continue to use `create_schedule`; they do not depend on this chat grammar.

Regression tests cover the dinner date-only follow-up, missing reminder content, leading/suffix/reordered recurrence, weekday selection, morning/PM conflicts resolved in either direction, task prompts, timezone follow-ups, quoted/hypothetical commands, unsupported recurrence clarification, and persistence through the real chat entry point without a model/retrieval call. Host-provided clock/timezone context is merged with the last assistant’s pending draft so host context does not erase a clarification.
