# Workspace integration verification — 25 October 2026

The integration mounts the completed pages and their real local-service interfaces; it does not replace them with mocks. See [workspace behavior and compatibility](workspace.md).

## Automated checks

| Check | Result |
|---|---|
| Desktop TypeScript / Vite production build | Passed |
| Native desktop `tauri build --debug --no-bundle` | Passed; final artifact uses the normal repository configuration |
| Frontend Vitest | 119 tests passed across 16 files |
| Rust workspace `cargo test --workspace` | 164 tests passed |
| Desktop shell `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | 23 tests passed |
| MCP build, standalone bundle and tests | 15 passed, zero skipped; daemon and desktop-engine integration suites enabled |
| Optional control / gateway / prompt / website checks | 2 / 9 / 5 / 3 passed |
| `git diff --check` | Passed |

MCP integrations used `CORTEX_DAEMON_BIN`, `CORTEX_DESKTOP_BIN` and an existing pinned model cache through `CORTEX_MODEL_DIR`. They exercised real isolated services, cross-client ownership and revisions, persisted schedules and live consent enforcement. No paid inference was required.

## Native visual and interaction checks

Inspected all four workspace destinations and both memory tabs at the normal desktop size and at 800 × 600. A temporary Tauri config supplied the compact size; it did not alter the checked-in desktop config. Checked accessible labels, loading and unavailable-service messages, empty states, wrapped filters, scrollable page content and memory-tab keyboard navigation. Fixed the scheduler's scroll container, the Agent Space page's competing scroll regions, and lazy-loaded stylesheet precedence. Saved navigation restored valid destinations after restart; legacy and unknown route aliases also have regression tests.

Using an isolated archive at `/tmp/cortex-workspace-visual.jIHeph`:

- Created **Integration reminder** in the scheduler UI; the actual service persisted its recurring schedule and next due time, and it remained after restart.
- Saved **Integration Tester / favorite color / cobalt blue** in Permanent memory. Ask Cortex recalled it through the intent router.
- Asked chat to remember a synthetic favorite drink, **jasmine tea**, then recalled it in the same conversation. The fact also appeared in Memories with chat provenance.
- Created a clearly synthetic handoff fixture through the real workspace API: Codex identity claimed it, saved a transcript and handoff, released it, and a Claude identity claimed it. Inspected the persisted origin, current owner, next action, blockers, artifact, both source sessions, original transcript and history in Agent Space. These were fixture identities; no real agent was launched or messaged.
- Kept capture and MCP consent disabled in the isolated workspace. Stopped the verification app afterward so its test scheduler would not continue running.

Local visual evidence is available in `/tmp/cortex-workspace-verification/` (`ask-cortex.png`, `agent-space.png`, `compact-schedules.png`, `compact-memories.png`). The fixtures use the real backend, with synthetic content.

## Remaining runtime requirements

Generated scheduled answers require `CORTEX_SCHEDULE_OPENAI_API_KEY` and `CORTEX_SCHEDULE_MODEL` in the engine environment. Interactive chat's model/key settings do not configure that provider. Current briefings additionally require hosted search access. The UI and scheduler documentation explain this separation; dependency failures remain visible in run history. Reminders require no model.

Paid live scheduled generation, visible macOS notification banners and hardware sleep/wake delivery were not manually verified in this integration pass. Scheduler unit/integration checks cover dependency failures, restart catch-up, recurrence, duplicate suppression and delivery result persistence. In-app run history is authoritative; notification submission is not proof of a displayed banner.
