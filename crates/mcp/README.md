# Rewind MCP bridge

This read-only stdio bridge uses the [Model Context Protocol TypeScript server SDK](https://github.com/modelcontextprotocol/typescript-sdk). It reads the local daemon's `daemon.port` and `daemon.token` files at launch time, connects only to `127.0.0.1`, and never puts the token in client configuration or command-line arguments. The daemon must enforce its separate `mcp_enabled` setting. Captured pages are untrusted, partial evidence.

```sh
cd crates/mcp
npm ci
npm run build
npm test
```

`REWIND_STATE_DIR` can override the per-user state directory for development. The default is `~/Library/Application Support/Rewind` on macOS, `%LOCALAPPDATA%\Rewind` on Windows, and `$XDG_STATE_HOME/rewind` or `~/.local/state/rewind` on other systems. `REWIND_STATE_DIR` remains a compatibility fallback for earlier development builds.

The bridge currently offers `search_memory`, `get_snapshots`, `get_recent_activity`, `get_working_memory`, `get_chronicle` (day level), and `get_time_report` (app grouping). It reports an error if the daemon is offline or MCP access is disabled. It does not write memory or change settings.

For strict JSON MCP client configurations, `node dist/register.js --enable /absolute/path/to/config.json` merges a single `rewind` entry. Run it only after reviewing the retrieval scope and enabling MCP access in the app. `--disable` removes only an unchanged entry installed by this tool. A 0600 backup and receipt are stored in the state directory. Commented/JSONC configs require manual setup so comments cannot be silently discarded. Client discovery and app-driven registration are future integration work; do not use this CLI as a substitute for user consent.
