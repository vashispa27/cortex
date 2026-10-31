# Browser tab relay: feasibility checkpoint

This records the experiment in `services/agent-api/spikes/browser-tab`, not a deployed capability.
The requested job and desktop integration remain pending the safety decision in that directory's
README.

```text
Browser Use BrowserSession (fixture test on host)
        │ job-scoped CDP WebSocket capability
        ▼
Fixture relay (aiohttp, ephemeral 127.0.0.1 port)
        │ paired WebSocket; exact chrome-extension:// origin
        ▼
Cortex MV3 extension (disposable Chromium profile)
        │ chrome.debugger, fixed shared tab ID
        ▼
Synthetic fixture page (ephemeral 127.0.0.1 port)
```

For production the relay should belong to the trusted agent-api manager process: that process
already owns job lifecycle, input revisions, approvals and worker configuration, so it can revoke
the browser endpoint when a segment pauses or ends without asking Tauri to become a second job
authority. The current spike uses an isolated aiohttp app on the test's loop; it does not start a
relay in the production manager. The extension connection and future worker-facing connection
need separate authentication. Pairing tokens must never enter task inputs or model context.

The MV3 extension requests only `debugger`, `tabs`, `tabGroups`, and `storage`. Debugger speaks
CDP to the explicitly shared tab; tabs provides its identity/title/URL and tab-close notification;
tabGroups provides the visible blue Cortex group. No host permissions or content scripts are
used. `storage` is reserved for production pairing but unused by this ephemeral test; it should
be removed if the eventual pairing design does not require it. Chrome's debugging banner is
left intact. The fixture probe accepts initial sharing only for HTTP pages on `127.0.0.1` and
has no supported standalone relay/server command.

Browser-level `Target` discovery/attachment is virtualized around one page and a flat session.
Browser Use never receives a list of other tabs. A foreign target/session is refused. Target
creation, closing targets, permissions, file input, download configuration, cookies and Storage
commands are refused. Refusals log method names only. Unsharing revokes the endpoint and closes
open worker connections. Tokens and metadata in this probe are memory-only, not durable jobs.

The key failure is semantic: forwarding generic Runtime permits arbitrary page-side effects.
The real fixture integration reproduces password filling, storage enumeration and form POST
without a raw CDP input or navigation call. Refusing Runtime stops ordinary Browser Use actor
operations too. The prototype is therefore kept out of Cortex's registered tools and desktop UI.
The report distinguishes this safety gap from transport compatibility, which was demonstrated.

## References examined

- [Chrome's default-profile debugging change](https://developer.chrome.com/blog/remote-debugging-port)
- [chrome.debugger, tab identities and child sessions](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Browser Use browser parameters](https://docs.browser-use.com/open-source/customize/browser/all-parameters)
- [Browser Use custom tools](https://docs.browser-use.com/open-source/customize/tools/add)
- [Browser Use source](https://github.com/browser-use/browser-use), pinned installed version 0.13.14:
  `browser/session.py`, `browser/session_manager.py`, `actor/page.py`, `actor/element.py`,
  and the default action/security/download watchdogs.
- [Playwright MCP browser connection documentation](https://playwright.dev/mcp/configuration/browser-extension)
- [OpenClaw extension relay design](https://github.com/openclaw/openclaw/pull/100619)
- [Panerelay Browser Use extension discussion](https://github.com/browser-use/browser-harness/discussions/575)

No reference implementation code was copied. These sources establish transport patterns; none is
being treated as proof that Cortex's approval and sensitive-field requirements are satisfied.
