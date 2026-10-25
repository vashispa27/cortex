# Cortex scheduled tasks and reminders

Schedules use the existing private **workspace.sqlite3** alongside tasks and permanent memories. Desktop socket requests, daemon HTTP requests and MCP all use `cortex-memory::workspace::WorkspaceStore`; there is no browser database or MCP scheduler. Existing workspace databases migrate automatically with additive `CREATE TABLE IF NOT EXISTS` statements. Schedule and run history survives capture/eval resets. Back up the workspace database with SQLite backup tooling (or stop the engine before copying its database and WAL).

## Runtime and delivery

The desktop engine and HTTP daemon each start the same scheduler, which checks wall time every five seconds on a background thread, independently of capture, indexing, webview mounting or MCP connection. Multiple engines sharing one state directory atomically reserve occurrences with SQLite `BEGIN IMMEDIATE` and `UNIQUE(schedule_id,due_ms)`.

Keep the engine running. Cortex does not install a launch agent, start a stopped computer, prevent sleep, or wake hardware at a due time. Sleep/restart recovery happens when the engine can run again. macOS desktop additionally forwards `NSWorkspaceDidWakeNotification` and session activation to the engine. Startup and a gap over 60 seconds between scheduler checks count as activity, including when running the daemon without the desktop shell. A long process suspension can therefore count as activity; this is not physical lid telemetry. Short sleeps need the native desktop event for immediate activity detection.

Native delivery submits a macOS notification with `/usr/bin/osascript`, or a Linux notification using `notify-send` and a working graphical session. Allow notifications for the OS script host and disable Focus if banners are desired. No Accessibility permission is required for reminders. Other platforms report delivery unavailable. `delivery_status=submitted` confirms OS command success, **not** visible display, reading, or permission approval. The notification contains a preview (450 characters); the complete result, cited source links and any error remain in run history. Notification clicks do not navigate to a run. Background execution does not depend on the page being open.

Reminders deliver their stored `message` without any model or network. Tasks generate an answer; they do not run shell commands, manipulate files, send email, or execute MCP tool calls. The task provider currently uses the OpenAI Responses API. Set these in the **engine process environment**, then restart Cortex:

```sh
export CORTEX_SCHEDULE_OPENAI_API_KEY='<your API key>'
export CORTEX_SCHEDULE_MODEL='<Responses model supporting web_search>'
```

Do not put keys in MCP tool arguments or schedule records. The desktop app inherits the environment when launched from that terminal; opening it from the Dock may not inherit terminal variables. Existing chat-provider credentials/settings are not automatically used. Task prompts and the schedule timezone go to the provider; captured memory and transcripts do not. A desktop `local_only=true` setting blocks this cloud provider. The daemon has no separate local-only setting: configuring these dedicated environment variables explicitly enables its task provider. Reminder-only operation needs neither variable.

For live tasks, requests use `tools: [{type: "web_search", external_web_access: true}]` and `tool_choice: "required"`. A run succeeds only with a completed provider response, a completed web search and cited HTTP(S) sources. `requires_live_sources=true` explicitly requests this; stock/market/briefing/news/current/today/latest/price/weather prompts also force it. Use the flag for other freshness-sensitive prompts; the keyword check is a guard, not natural-language intent routing. Provider/network errors, missing configuration, uncited results and incomplete output produce a **failed** run and a notification explaining the unavailable dependency. No stored-memory or model-only market briefing is substituted. Search results can contain delayed quotes; the provider is instructed to state observation and market-session dates. Live search is not a licensed real-time exchange feed.

The provider requires an API account with access to the selected model and hosted search, internet access to `https://api.openai.com/v1/responses`, and incurs that account's generation/search charges. Requests time out after 75 seconds, do not automatically retry and use `store:false`. Provider details: [official web search documentation](https://developers.openai.com/api/docs/guides/tools-web-search).

## Calendar semantics

All inputs are structured. Natural-language parsing and Cortex chat intent routing are deliberately outside this API.

- `timezone`: explicit IANA timezone, e.g. `Asia/Kolkata`, `America/New_York`, `UTC`. The machine timezone is never inferred by the backend. The page initially selects the browser's IANA timezone and lets the user change it. A timezone edit replaces the schedule and recomputes its next occurrence.
- `once`: `local_at` is exactly `YYYY-MM-DDTHH:MM`, interpreted in the named timezone. Creation/edit requires a future minute. Impossible dates, DST gaps and ambiguous DST folds are rejected; choose an unambiguous minute.
- `daily`: `time` is exactly `HH:MM`. `weekdays` optionally selects ISO weekdays (Monday=1 through Sunday=7); omitted/empty means every day. Recurrence uses local calendar days, not 24-hour UTC intervals. DST gaps skip the day; folds use the earlier instant and fire only once.
- `after_wake`: the first activity event in the local-day window `[time,window_end)` fires one occurrence. `window_end` must be later than `time` on the same day. Optional weekdays behave as above. Example morning window: `06:00`–`12:00`. Activity before the window does not arm a future run; activity after the window does not catch up. A wake during the window can run immediately even when the schedule was created after that day's start. Startup during the window counts as activity. A normal timer tick never fires these schedules without an activity event. Repeated wake/session events, restarts and multiple runners deduplicate on that day's window-start instant. `next_due_ms` is a preview of the next window start, not a promise that activity will occur; the current window can still run on activity.
- Missed one-time reminders run once on recovery. Multiple missed daily occurrences coalesce into one catch-up run identified by the previously persisted due time, then advance to the next future local occurrence. The history `due_ms` shows that original time, `started_ms` the actual execution time (reservation time while still queued). There is no backlog replay for every missed day.
- Pause suppresses new claims. Resume skips paused daily occurrences and selects the next future recurrence; an elapsed paused one-time reminder catches up on resume. After-wake schedules wait for a new qualifying activity event, which may be in the current window; activity while paused is never replayed. Cancel is terminal and retains history; create a new ID to replace a cancelled schedule. Edit requires a complete replacement spec. Editing a completed schedule to a future occurrence reactivates it; editing a paused schedule keeps it paused.
- `revision` guards user mutations. Every claim increments it; fetch the latest record after conflicts. Scheduler-only preview maintenance can change `next_due_ms` without changing the user specification.

An occurrence is reserved and its schedule advanced in the **same transaction** before external execution. Generation/delivery happens outside that transaction, with up to eight workers per engine process. Queued runs survive restart and are atomically assigned to a worker; a slow provider does not block due-time or activity scans. Cancellation, pause and changed specifications are rechecked before generation and delivery; an external call already in progress cannot be recalled.

OS notifications and SQLite cannot commit atomically. Cortex uses **at-most-once notification attempts**, not exactly-once visible delivery. It persists `attempted` before invoking the OS. An assigned run left `running` for over two minutes is marked `interrupted` on the next scan; the error states that delivery may be uncertain. It is never silently replayed, including a crash after assignment and before delivery. Unassigned `queued` work is safe to recover and does execute after restart. To retry an interrupted/failed one-time occurrence, explicitly create a new ID or edit it to a future time. This trades automatic retry after crashes for duplicate prevention. A completed one-time schedule may have a failed run: `completed` means no future occurrence, not successful delivery.

## API contract

Every public operation is **POST `/v1/schedules/{operation}`**, over the existing private desktop Unix socket or authenticated daemon loopback HTTP API. The existing envelope remains `{data: ...}` (HTTP also has `request_id`); MCP text content contains that envelope. HTTP errors use the existing error envelope; desktop errors use the existing socket error reply. MCP `isError=true` reports failures. Existing Connected AI Apps consent and local authentication checks apply. MCP has no access to runner internals or native wake injection.

Specification:

```ts
type ScheduleSpec = {
  title: string; // 1..300 bytes on backend
  timezone: string; // explicit IANA name
  timing:
    | { type: 'once'; local_at: string }
    | { type: 'daily'; time: string; weekdays?: number[] }
    | { type: 'after_wake'; time: string; window_end: string; weekdays?: number[] };
  action:
    | { type: 'reminder'; message: string }
    | { type: 'task'; prompt: string; requires_live_sources?: boolean };
}; // Action text: 1..12000 bytes; request: <=20000 serialized bytes.
```

| Operation | MCP tool | Arguments | Result in `data` |
|---|---|---|---|
| `create` | `create_schedule` | `{id, schedule: ScheduleSpec}` | Schedule |
| `get` | `get_schedule` | `{schedule_id}` | Schedule |
| `list` | `list_schedules` | `{status?, offset?, limit?}` | Page of schedules |
| `update` | `update_schedule` | `{schedule_id, expected_revision, schedule: ScheduleSpec}` | Schedule |
| `pause` | `pause_schedule` | `{schedule_id, expected_revision}` | Schedule |
| `resume` | `resume_schedule` | `{schedule_id, expected_revision}` | Schedule |
| `cancel` | `cancel_schedule` | `{schedule_id, expected_revision}` | Schedule |
| `history` | `get_schedule_history` | `{schedule_id?, offset?, limit?}` | Page of runs |

IDs are 1..100 bytes. Caller-supplied stable IDs make creation retry-safe: the same ID and current specification return the existing schedule, while a differing specification conflicts. Mutations require the current positive integer revision. MCP uses strict Zod objects, enum discriminants, bounds and timezone validation; backend validation is authoritative, including date/DST rules. Pages return `{items, total, next_offset}`; limits default to 50 and max at 100. Pages are also bounded to approximately 180KB to stay within the existing bridge limits; a page may contain fewer than `limit` items. Continue while `next_offset !== null`.

A Schedule includes its specification plus `id`, `revision`, `status` (`active | paused | completed | cancelled`), `next_due_ms: number | null`, `created_ms`, `updated_ms`. Timestamps are UTC epoch milliseconds. Paused schedules retain their last due preview; cancelled/completed schedules have no future due time.

A Run includes `id`, `schedule_id`, `due_ms`, `started_ms`, `finished_ms: number | null`, `status` (`queued | running | succeeded | failed | interrupted | cancelled`), `output`, `error: string | null`, `delivery_status` (`pending | attempted | submitted | failed`), and `schedule` (immutable specification/metadata snapshot at claim time). Output includes clickable Markdown source URLs for live answers. History sorts newest first. Records are retained until the workspace database is removed; no automatic retention pruning is currently provided.

`POST /v1/schedules/wake` with `{}` is reserved for the native desktop activity source. The shell's page route allow-list does not expose it, and requests marked as MCP are denied. Same-user code with direct private socket/token access is already a trusted local client under the existing service model.

One-time reminder example (resolve “tomorrow” before calling):

```json
{"id":"resume-2026-10-26","schedule":{"title":"Send resume","timezone":"Asia/Kolkata","timing":{"type":"once","local_at":"2026-10-26T14:00"},"action":{"type":"reminder","message":"Send my resume"}}}
```

Daily answer:

```json
{"id":"market-morning","schedule":{"title":"Stock market briefing","timezone":"Asia/Kolkata","timing":{"type":"daily","time":"08:00"},"action":{"type":"task","prompt":"Give me a current stock market briefing with source timestamps and links.","requires_live_sources":true}}}
```

Activity-triggered answer: use the same specification with `"timing":{"type":"after_wake","time":"06:00","window_end":"12:00"}` and a distinct ID.

## MCP setup

Use the existing bridge; there is no second MCP server to install:

```sh
cd crates/mcp
npm ci
npm run build
npm run bundle
```

Point the harness at an absolute path to `crates/mcp/dist/index.js` with Node 20+, or use the existing bundled bridge/desktop MCP registration flow. Example harness configuration:

```json
{"mcpServers":{"cortex":{"command":"node","args":["/absolute/path/to/rewind/crates/mcp/dist/index.js"],"env":{"CORTEX_STATE_DIR":"/absolute/path/to/Cortex"}}}}
```

Use the **same root state directory as the desktop/daemon**; the bridge looks for `local-memory/capture.sock` first, then the daemon port/token files. Do not point MCP at `local-memory` itself. Enable Connected AI Apps in Cortex. Task-provider variables belong to the engine environment, not merely the MCP child process. Rebuild the desktop engine and bundled bridge when distributing these tools.

## Desktop integration

`apps/desktop/src/components/ScheduledTasksPage.tsx` exports `ScheduledTasksPage`, its default export and `ScheduledTasksPageProps`. `App.tsx` mounts `<ScheduledTasksPage />` at **Scheduled tasks / Reminders**, the first workspace destination. See [workspace integration](workspace.md). The component supports creation, complete-spec edits, pause/resume/cancel, paginated schedules/history, periodic refresh, timezone display, status/error handling and full result details with source links.

`apps/desktop/src/lib/schedules.ts` exports `ScheduleService`, `ScheduleSpec`, `ScheduleTiming`, `ScheduleAction`, `Schedule`, `ScheduleRun`, `SchedulePage`, `ScheduleTransport`, `createScheduleService`, `scheduleService` and `formatScheduleTime`. Hosts/tests may inject a service using `<ScheduledTasksPage service={...} />`. The default transport uses existing `localRequest` and native route validation. It stores no schedules in browser storage.

## Validation

```sh
cargo test -p cortex-memory -p cortex-daemon
cargo check -p cortex
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
(cd apps/desktop && npm run build && npm test)
(cd crates/mcp && npm test)
```

Backend tests cover timezone conversion, DST gaps/folds, calendar recurrence, weekdays, restart catch-up, stale-run recovery, concurrent connections, wake windows and duplicates, pause/edit/cancel/revision conflicts, dependency failure reporting, and reminder delivery bypassing the model. MCP tests verify strict structured arguments and bridge routing. Desktop tests verify shared service contracts and explicit timezone rendering. Run the existing daemon/desktop integration suites with `CORTEX_DAEMON_BIN` / `CORTEX_DESKTOP_BIN` and `CORTEX_MODEL_DIR` as described in the MCP README.

A funded live provider call and visible OS notification require deployment credentials, account access, a graphical session and OS permissions; mocked provider/notification tests cannot establish those conditions.

## Implementation files

This change adds or edits the following files; unrelated pre-existing working-tree changes are preserved.

- Shared backend: `crates/memory/src/schedules.rs`, `crates/memory/src/schedule_runtime.rs`, `crates/memory/src/workspace.rs`, `crates/memory/src/lib.rs`, `crates/memory/Cargo.toml`, `Cargo.lock`.
- Service routes and lifecycle: `crates/daemon/src/main.rs`, `crates/cortex/src/desktop.rs`.
- Native route allow-list and activity observation: `apps/desktop/src-tauri/src/lib.rs` (small additions to the existing uncommitted shell work).
- Desktop exports and styling: `apps/desktop/src/lib/schedules.ts`, `apps/desktop/src/components/ScheduledTasksPage.tsx`, `apps/desktop/src/components/scheduled-tasks.css`.
- MCP tools and registration: `crates/mcp/src/schedules.ts`, `crates/mcp/src/index.ts`.
- Tests: scheduling unit tests inside the two new Rust modules; `apps/desktop/src/lib/schedules.test.ts`, `crates/mcp/src/schedules.test.ts`, `crates/mcp/src/schedules.integration.test.ts`, additions to `crates/mcp/src/desktop.test.ts`.
- Documentation: this guide and `crates/mcp/README.md`.

Delivery was also exercised against a real isolated daemon with overdue reminder/task fixtures: the reminder reached `succeeded/submitted`, the task without provider credentials reached `failed/submitted`, and a second restart kept exactly two runs. This confirms command submission and persistence, not visible OS banners. The live paid provider request was not exercised.
