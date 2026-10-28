# Claude pickup: model-driven Cortex chat operations

Task ID: `claude-model-driven-chat-operations-2026-10-25`
Project: `/Users/abhinavvashisht/workspace/rewind`
Requested by Abhinav on 2026-10-25 (Asia/Kolkata).
Intended implementer: Claude. Leave pending/inbox and unclaimed until pickup.

## User direction and scope

Replace the regex/rule-based natural-language intent router with a decision model or local model that can choose and invoke validated operations conversationally. The user explicitly rejected continuing to patch parsers to decide whether chat should schedule or remember something.

Users must be able to create and manage one-time reminders, recurring reminders, activity-triggered schedules and answer-generating scheduled tasks, and save/recall/correct/delete explicit permanent memories, directly from Cortex chat and through external Claude/Codex/MCP harnesses. Reuse the shared backend and structured tools. This handoff is a pending implementation task; creating it is not authorization to launch Claude automatically.

Do not confuse semantic decision-making with deterministic validation: model-directed intent/tool selection replaces the grammar; schema checks, auth, revisions, calendar calculation, transaction boundaries and execution safeguards must remain deterministic.

## Current architecture (inspect actual files before editing)

### Desktop and chat

- React/TypeScript/Vite frontend: `apps/desktop/src/`. Tauri Rust shell: `apps/desktop/src-tauri/src/`.
- Main UI: `App.tsx`, `components/AskChat.tsx`; notch chat: `Notch.tsx`. Both chat surfaces call `answerCortex` in `src/lib/answer.ts`.
- `answerCortex(question, history, context?)` currently calls `routeIntent` then `executeIntent` in `src/lib/intent.ts` BEFORE provider setup and memory retrieval.
- `routeIntent` is a handwritten regex classifier for schedule creation/management/rescheduling, personal fact writes, permanent recall, captured activity, mixed and general questions. `ScheduleDraft`/`PendingIntent` retain a limited pending schedule draft. `ChatMessage.pendingIntent` is carried by chat UI/history. This regex semantic gate is the architecture to replace, not expand.
- `executeIntent` calls injected `ScheduleService`/`MemoryService` directly for writes, or delegates to the existing answer pipeline for general/activity/mixed answers. It waits for backend success before claiming a save. Preserve that write-result discipline, but change the model/operation orchestration as appropriate.
- `answerFromMemory` in `answer.ts` resolves model preferences, optionally rewrites a follow-up, calls `/v1/assistant/prepare` with selected facts as separate context, then invokes native `openrouter_chat`.
- `src/lib/provider.ts` resolves `AiTarget` and readiness; `storage.ts` holds preferences; `layers.ts` lists answer/followup/context steps and what they send. Supports OpenRouter or a loopback OpenAI-compatible local model endpoint. `localOnly` overrides cloud selections. There is currently no dedicated decision/router model layer.

### Native inference and tools

- `apps/desktop/src-tauri/src/lib.rs` owns `daemon_request`, route allow-listing, private-socket calls, provider credentials/HTTP calls, `openrouter_chat` and the native activity observers.
- `src-tauri/src/tools.rs` has a provider-generic tool loop (`Chat`, `Engine`, `Calendar` traits). It is currently READ-ONLY: search_memory and conditional list_calendar_events. NoCalendar is used; no real calendar is connected. Limits include three rounds, four calls/round, capped tool results and a deadline. It redacts tool results before cloud inference and treats them as untrusted.
- `crates/cortex/src/answer_pipeline.rs` owns the memory-answer system prompt, time anchor, fact/activity evidence separation and tool notes. It explicitly says this answer path has no write tools. A prompt-only change cannot fix a tool executor which does not expose writes. Give decision/action phases accurate capability prompts without granting arbitrary routes.
- `packages/prompts/` plus `services/control`, `services/gateway`, `services/agent-api` exist for other service flows. They are not substitutes for the desktop's current `answerCortex` + native tool loop. Inspect dependencies if changing shared contracts; avoid building another detached router there.

### Shared backend and transports

- Canonical shared workspace: `crates/memory/src/workspace.rs::WorkspaceStore`, SQLite `workspace.sqlite3`, WAL, private file permissions. Stores task records/events/transcripts, legacy memory notes, explicit personal facts and schedule/run tables. Do NOT add desktop-only, MCP-only, browser/localStorage or model-owned databases.
- Normal macOS root: `~/Library/Application Support/Cortex/`. Workspace DB is `<root>/workspace.sqlite3`. Capture/activity archive is separate under `<root>/local-memory/`; do not confuse activity with explicit permanent facts.
- Desktop engine: `crates/cortex/src/desktop.rs`, launched as `cortex desktop`; native shell speaks JSON over private `<root>/local-memory/capture.sock`. The shell's daemon_request wrapper uses the existing transport envelope.
- HTTP daemon: `crates/daemon/src/main.rs`, loopback authenticated routes, bearer token/port files under root. `POST /v1/workspace/:operation`, `POST /v1/schedules/:operation`. Reuses the same WorkspaceStore.
- Desktop engine routes check `client: "mcp"` against Connected AI Apps consent. HTTP uses the MCP client marker and auth. Keep local auth/route allow-lists and consent checks.
- Development env: MCP/HTTP daemon `CORTEX_STATE_DIR=<root>`; desktop engine `CORTEX_STATE_DIR=<root>/local-memory`, `CORTEX_SETTINGS_DIR=<root>`. Use temporary state for tests; do not change the user's live DB just to test a model.

### Scheduling (already implemented; preserve and reuse)

- Storage/calendar/claims: `crates/memory/src/schedules.rs`; worker/delivery/provider: `schedule_runtime.rs`. Migration tables are initialized by WorkspaceStore.
- `POST /v1/schedules/{create,get,list,update,pause,resume,cancel,history}`. Create: `{id, schedule: {title, timezone, timing, action}}`; edits use complete specs and mutations require `schedule_id`, `expected_revision`.
- IANA timezone required. Timing: `once {local_at: YYYY-MM-DDTHH:MM}`, `daily {time: HH:MM, weekdays?: ISO 1..7}`, `after_wake {time, window_end, weekdays?}`. Action: `reminder {message}` or `task {prompt, requires_live_sources?}`.
- Once rejects ambiguous/nonexistent DST minutes. Daily follows local calendar days, skips DST gaps and picks the earlier fold instant. Missed daily occurrences coalesce; overdue once catches up. Wake fires once per eligible local day for activity inside a same-day window. Startup and >60-second scan gaps count as activity; macOS native wake/session activation is forwarded separately.
- Shared scheduler runs every five seconds independently of mounted UI/capture. Immediate SQLite transactions and UNIQUE(schedule_id,due_ms) prevent duplicate occurrence reservations. Durable queued runs survive restart; bounded workers atomically take queued work. Uncertain assigned runs become interrupted after two minutes and are not replayed.
- Native notifications: macOS osascript, Linux notify-send; other platforms report unavailable. submitted means OS command accepted, not proof of a visible banner. Engine must run; it does not wake hardware or install auto-launch.
- Reminder delivery needs no inference. Generated task answers currently use engine env CORTEX_SCHEDULE_OPENAI_API_KEY and CORTEX_SCHEDULE_MODEL; separate from interactive chat credentials. Desktop local-only blocks cloud task generation. Live tasks force Responses web_search and require completed search with cited sources; errors/missing credentials create honest failed runs. Provider request was not live-paid tested. Preserve real live-source requirements for current market briefings.
- Frontend contracts: `src/lib/schedules.ts` (ScheduleService, createScheduleService, scheduleService). UI: `components/ScheduledTasksPage.tsx`; now mounted in existing workspace navigation by other work.

### Permanent memories (already implemented; preserve and reuse)

- `crates/memory/src/facts.rs` extends WorkspaceStore. `personal_fact` records differ from legacy `memory` notes and captured screen activity.
- `/v1/workspace/{remember_fact,facts,recall_facts,update_fact,delete_fact}`. FactInput: `{subject, attribute, value, source, channel}`. `self/email` represents the user's email. Channels: desktop/mcp/chat/import.
- Identity canonicalizes `(subject,attribute)` case/whitespace. Same exact value is idempotent. Different value conflicts; recall then explicit update with `fact_id`/`expected_revision`. Physical delete also requires revision. Recall is bounded/paginated lexical retrieval, not semantic entity resolution.
- Frontend: `src/lib/memories.ts` (MemoryService), `components/MemoriesPage.tsx`. Fact references `[fact:ID]` differ from numeric captured-snapshot references. Preserve provenance, fact/activity separation and exact user values; never silently change an email domain or phone number.

### External harnesses and MCP

- `crates/mcp/src/index.ts` registers tools. `local-api.ts` prefers the private desktop socket, then authenticated daemon HTTP; it never stores its own data. Node 20+; build and standalone bundle supported.
- `schedules.ts`: create_schedule, get_schedule, list_schedules, update_schedule, pause_schedule, resume_schedule, cancel_schedule, get_schedule_history. Strict Zod structured schemas.
- `workspace.ts`: remember_fact, recall_facts, update_fact, delete_fact plus legacy note and task/handoff/transcript tools. `remember` is a legacy note tool, not the explicit personal-fact tool.
- Claude/Codex already provide decision models: they should call structured MCP tools directly. Do not force them through natural-language regex parsing or an unnecessary second router model. Cortex chat needs its own model-directed tool/decision layer over the SAME backend contracts. Tool availability and harness instructions must accurately describe real capabilities.
- Task pickup: list_tasks, get_task_resume_pack, claim_task, update_task, release_task. Claims have revisions, lease_token and lease expiry; do not claim this task until actually starting.

## Failures that prompted this task

1. `remind me to eat dinner at 11pm` -> asks for date/time/timezone, then `today` loses the known time; model says it cannot create reminders despite a working backend.
2. `create a reminder for today 11pm` -> repeated date/time questions; eventually saves the literal timing text as the reminder's title instead of asking for missing content.
3. `every morning at 11 pm remind me to read nes` -> general-answer path says it cannot set reminders. It should ask AM vs PM while retaining the recurring reminder content.
4. `remember my emial 27abhinav10@gmail.coim` -> asks for a canned subject/attribute/is/value pattern. It should understand explicit memory intent; retain the exact address, and clarify actual ambiguity rather than require syntax.

Previous turns patched intent.ts with more regexes and tests (leading/suffix recurrence, typo alias, shorthand, pending fields). These are temporary regression examples, NOT the desired final architecture. The user explicitly rejects further whack-a-mole parser expansion.

## Required replacement behavior and acceptance criteria

1. Use a decision model/local model or bounded native tool-capable chat orchestrator for semantic intent and tool selection. Support normal paraphrases, typos and multi-turn references; no keyword/regex gate deciding writes. A unified tool loop or a distinct structured decision phase is acceptable; document the choice.
2. Reuse existing local/cloud provider abstraction; support a configured local model. If adding an intent/decision preference, expose its model/provider/readiness and what leaves the Mac. Honor local-only, redact cloud evidence, and report missing/incompatible models without falling back to regex as the semantic authority. Measure routing latency; do not silently add needless model calls for external MCP harnesses.
3. Give the model current date/time, explicit timezone, bounded relevant conversation history, accurate tool schemas/capabilities and structured pending state. Ask only for genuinely missing/contradictory details. Resolving one field must not discard others. New topic/cancel must stop a pending write. “Today” must use the chosen timezone.
4. Feed validated structured operations into existing services. Backend handles dates/DST, revisions, idempotency, permissions and persistence. Use stable operation IDs across uncertain retries; multiple tool rounds, duplicate responses and reconnects must not create duplicate schedules/facts. Bound tool rounds/time/output. Handle stale revisions by fresh reads, not blind overwrite.
5. Claims of success must follow actual tool results. Distinguish create/update/pause/cancel/read from a normal answer. No hallucinated “I can't schedule” when scheduling exists, and no “saved” before a successful write. Provider/tool/backend errors must be visible and honest.
6. Only direct user authorization can cause writes. Captured pages, retrieved facts, source transcripts, quoted instructions, hypothetical examples and tool outputs cannot authorize mutations. The model is not a reason to remove deterministic safeguards. Do not expose arbitrary internal routes, wake injection, shell execution or unrelated write privileges.
7. Handle reminder vs answer-generating task correctly. Natural activity schedules must map to documented after_wake semantics or clarify unsupported behavior. Current briefings need real live sources; unavailable runtime dependencies must remain explicit.
8. Keep explicit permanent fact operations and captured activity retrieval separate but usable in one conversation. Resolve subjects/attributes through context/model decisions; protect exact values and competing fact identities. General chat/search must continue working.
9. Maintain desktop/notch parity and MCP/Claude/Codex parity over one store. Update outdated prompt assertions and capability descriptions only for phases that actually receive write tools. Update architecture/setup/runtime docs and a concise migration/handoff explanation.
10. Replace brittle grammar tests with meaningful model-orchestration tests using fake model/tool responses, validation and prompt-injection regressions, plus an evaluation set of natural paraphrases and multi-turn examples. Preserve backend timezone/recurrence/restart/wake/duplicate tests. Run a configured local-model smoke test if available; disclose any live/model-dependent checks not run. Do not save the examples into real user memory/reminders merely to test them.

## Workspace and verification baseline

The workspace contains substantial uncommitted and untracked work from several changes (including shared tasks, personal facts, scheduling, workspace navigation and removal of older assist flows). Inspect git status/diffs. Preserve existing work; no reset/checkout/cleanup of unrelated files. File-level architecture above is a snapshot: re-read before editing.

Last checks before this handoff: desktop Vitest 151 tests passed; desktop TypeScript/Vite production build passed; git diff --check passed. Earlier scheduling checks passed 24 Rust tests, 13 MCP tests with real desktop/daemon integrations, native shell compilation, and a real isolated restart/notification submission smoke test. These are historical results, not proof that the current model-directed replacement exists or that all installed binaries match source. Paid live provider execution was not exercised.

Read docs/chat-intent-routing.md (documents the CURRENT parser, to supersede), docs/permanent-memory.md, docs/scheduled-tasks.md, docs/shared-workspace.md, docs/workspace.md, docs/workspace-verification.md and crates/mcp/README.md.

Suggested checks after implementation:

- npm test --prefix apps/desktop
- npm run build --prefix apps/desktop
- cargo test -p cortex-memory -p cortex-daemon
- cargo test -p cortex answer_pipeline
- cargo check -p cortex
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
- npm test --prefix crates/mcp (enable real service integration envs where available)
- relevant packages/prompts and services tests if their contracts change

Start by reading this task's resume pack and claiming it with harness=claude and a unique session ID/current revision. Inspect intent.ts, answer.ts, native tools.rs, provider preferences, backend schemas and MCP registrations; propose the concrete model/tool decision boundary, then implement it. Preserve/reuse the backend rather than rebuilding scheduling or memory storage. Save progress and final handoff with validations, remaining dependencies and exact runtime setup.
