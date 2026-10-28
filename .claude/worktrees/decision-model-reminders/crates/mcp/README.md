# Cortex MCP bridge

Shared local tasks, handoffs, JSONL conversation history, permanent memories, and captured-memory search for your AI harnesses. See [setup and workflow](../../docs/shared-workspace.md) for client configuration, harness instructions, API contracts and limits.

The bridge prefers the desktop engine's private `<state>/local-memory/capture.sock`, validates its ownership/permissions, and marks requests as MCP. Without a desktop socket it uses the older loopback daemon's `daemon.port` and `daemon.token`. Both engines enforce `mcp_enabled`. Tokens never appear in config or command-line arguments. Captured text and imported transcripts are untrusted evidence.

```sh
cd crates/mcp
npm ci
npm run build
npm test
```

`CORTEX_STATE_DIR` can override the per-user state directory for development. The default is `~/Library/Application Support/Cortex` on macOS, `%LOCALAPPDATA%\Cortex` on Windows, and `$XDG_STATE_HOME/cortex` or `~/.local/state/cortex` on other systems. `CORTEX_STATE_DIR` remains a compatibility fallback for earlier development builds.

Enable **Settings → Connected AI apps → Allow Cortex MCP access** in the rebuilt desktop app, then register `node /absolute/path/to/crates/mcp/dist/index.js` as a stdio MCP server in each harness. This grants task/memory writes and captured-memory reads. Building does not modify harness configurations.

The desktop app also ships a standalone bridge that works without the checkout or node_modules. Open Connected AI apps to install it into private app storage and copy the generated Claude JSON, Codex TOML, or OpenCode JSON configuration. Node 20+ remains required. The same screen offers workflow instructions and a local readiness check.

Tools: `create_task`, `list_tasks`, `get_task_resume_pack`, `claim_task` (also heartbeat), `update_task`, `release_task`, `get_task_events`, `append_task_transcript`, `import_task_transcript`, `get_task_transcript`, `remember`, `search_permanent_memory`, `forget_memory`, plus the existing capture-query tools. The legacy `get_working_memory`, `get_chronicle`, and `get_time_report` endpoints depend on the backend; the desktop semantic engine currently exposes search/snapshots/recent activity. The bridge reports an error if the engine is offline or access disabled.

No background transcript scanning, automatic harness launch, cross-device sync, or guaranteed automatic tool use is provided. Follow the harness instructions in the workflow guide for automatic task lifecycle calls where supported by your harness.

For strict JSON MCP client configurations, `node dist/register.js --enable /absolute/path/to/config.json` merges a single `cortex` entry. Run it only after reviewing the retrieval scope and enabling MCP access in the app. `--disable` removes only an unchanged entry installed by this tool. A 0600 backup and receipt are stored in the state directory. Commented/JSONC configs require manual setup so comments cannot be silently discarded. Client discovery and app-driven registration are future integration work; do not use this CLI as a substitute for user consent.

## Scheduled tasks and reminders

The same bridge exposes `create_schedule`, `list_schedules`, `get_schedule`, `update_schedule`, `pause_schedule`, `resume_schedule`, `cancel_schedule`, `snooze_schedule` and `get_schedule_history`. These use the shared workspace database and require structured timing plus an explicit IANA timezone. There is no natural-language tool: your model resolves “every Sunday at 10” into one of these timings, and the tool descriptions carry one example each.

| Timing | Example |
|---|---|
| `once` | `{"type":"once","local_at":"2026-10-26T14:00"}` |
| `daily` (also weekly) | `{"type":"daily","time":"10:00","weekdays":[7]}` is every Sunday; omit `weekdays` for every day |
| `monthly` | `{"type":"monthly","day":1,"time":"09:00"}`; `day: -1` is the last day, and a day a short month lacks (31 in February) clamps to that month's last day |
| `interval` | `{"type":"interval","every_minutes":120,"start_local":"2026-10-26T09:00","window_start":"09:00","window_end":"21:00","weekdays":[1,2,3,4,5]}`; minimum 15 minutes, window cannot cross midnight, set `start_local` to the first fire time |
| `after_wake` | `{"type":"after_wake","time":"06:00","window_end":"12:00"}` |

`create_schedule`, `update_schedule`, `pause`, `resume`, `cancel` and `snooze` return the stored schedule with its new `revision`, `next_due_ms` and `next_due_local` (`YYYY-MM-DDTHH:MM` in the schedule's timezone), so confirm the time back to the user from that rather than from your own arithmetic. `snooze_schedule` takes `{schedule_id, expected_revision, minutes: 1..1440}`. `remember_fact` and `update_fact` return the fact with its `revision`; changing the value of an existing fact needs `update_fact` with the current revision, and you should tell the user the old value is being replaced. The running Cortex engine executes schedules independently of the MCP connection. See [the scheduling API and runtime guide](../../docs/scheduled-tasks.md) for arguments, recurrence/DST/recovery semantics, desktop integration, notification permissions and live-answer provider configuration.
