# Cortex workspace

The Workspace navigation is ordered as follows:

1. **Scheduled tasks / Reminders** — durable one-time, daily, selected-weekday and after-wake schedules. Create, edit, pause, resume or cancel a schedule and inspect its past runs, outputs and delivery failures. This page uses `scheduleService` and the engine's `/v1/schedules/*` API.
2. **Ask Cortex** — the existing chat and history, now calling `answerCortex`. Its intent router handles explicit requests to remember facts, recall facts and schedule work before the ordinary activity retrieval and model-answer pipeline. Ambiguous schedules ask for clarification. See [routing](chat-intent-routing.md).
3. **Memories** — keyboard-accessible tabs for **Permanent memory** (explicit personal facts with provenance and revisions) and **Recent activity memory** (captured activity search, timestamps and coverage). Facts use `/v1/workspace/{remember_fact,recall_facts,update_fact,delete_fact}`; activity uses the existing memory APIs. See [permanent memory](permanent-memory.md).
4. **Agent Space** — the real task workspace: ownership and leases, agent handoff notes, next actions, blockers, artifacts, transcript sessions and resume packs. Its page reuses `TasksPage` and `TaskDetail` with Agent Space enabled. Connected AI apps use the same authenticated workspace APIs. See [shared workspace](shared-workspace.md).

Home and Timeline remain under Overview. Capture/privacy settings, AI model configuration, the notch chat, and Connected AI apps / MCP setup remain available. The workspace uses the existing glass materials, blue focus indicators and responsive sidebar. Native service errors stay visible; the browser preview cannot perform native operations. Agent Space does not silently use a sample task.

## Navigation compatibility

Canonical page IDs are `scheduled`, `ask`, `memories`, and `agents`. Previous links and saved locations resolve safely: `reminders` → `scheduled`; `memory` and `wiki` → `memories`; `tasks` → `agents`; `write` → `ask`. Unknown locations open Home. The shell saves a canonical location, handles native navigation and browser history restoration, and provides a reload action if a workspace module fails to load. Dashboard search opens the recent activity tab with the search term.

## Removed surfaces

The old Write tutorial, writing/editing assistant, local shell reminder timer, audio scratchpad/dictation and autocomplete are retired. Their settings, model layers, native commands, field-reading/insertion helper modes, dedicated editor contracts, styles and unused code are removed. Existing unrelated preference values and AI model settings survive loading; obsolete preference keys are discarded. The optional cloud gateway retains answer, extraction and summary inference only. The website sample now illustrates a schedule instead of writing assistance.

The modifier shortcut opens a new Cortex chat. It no longer reads or replaces another app's focused field. The Accessibility helper remains responsible for bounded read-only foreground activity capture and its permission checks.

## Runtime dependencies and limits

The desktop service must be running. Capture remains opt-in. Agent access requires explicit MCP consent; imported transcript and handoff content remains untrusted evidence. Personal facts and task-derived permanent memories are separate storage concepts; the Memories page edits personal facts, while Agent Space retains task memory/provenance. Capture deletion does not erase either store or schedules.

Reminder messages do not require a model. Generated scheduled tasks use the implemented OpenAI Responses provider and require `CORTEX_SCHEDULE_OPENAI_API_KEY` and `CORTEX_SCHEDULE_MODEL` in the engine environment; interactive chat settings do not configure them. Live-source tasks also require hosted web-search access. Failures are persisted in run history. Notification delivery, sleep/wake behavior and catch-up guarantees are documented in [scheduled tasks](scheduled-tasks.md); persistent in-app history is the source of truth.

## Verification

Run `npm --prefix apps/desktop run build`, `npm --prefix apps/desktop test`, `cargo test --workspace`, and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`. Build the desktop with `npm --prefix apps/desktop run tauri -- build --debug --no-bundle`.

Build `cortex-daemon` and `cortex`, then run MCP tests with `CORTEX_DAEMON_BIN`, `CORTEX_DESKTOP_BIN` and `CORTEX_MODEL_DIR` pointing to the built binaries and an existing pinned model cache. The integration tests create isolated synthetic archives and verify real services, persistence, revision fences and consent. Do not enable personal capture or external client access for a smoke test.
