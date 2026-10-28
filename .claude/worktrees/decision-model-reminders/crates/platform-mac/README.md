# macOS Accessibility reader

`native/Capture.swift` is a read-only, one-shot helper. Build it with:

```sh
swiftc crates/platform-mac/native/Capture.swift -o /tmp/cortex-capture-helper
```

`--permission` reports whether Accessibility permission is already granted. It does not open a permission prompt. `--request-permission` is the only mode that asks macOS to show the Accessibility permission prompt. `--read-frontmost` emits one JSON line: `{"status":"ok","window":...}` with the `RawWindow` shape from `crates/capture`, or `{"status":"skipped","reason":"..."}`. The `ok` envelope may include `idle_ms`. Repeated `--exclude-app=<bundle-id>` flags reject matching foreground apps before AX access.

The daemon checks user consent and pause state, then passes effective app exclusions into the helper before it reads AX. It rechecks settings after the read. Helper stdout contains raw accessibility text and goes directly to the in-memory sanitizer; do not log or persist the raw JSON. The helper avoids browser windows when it cannot prove the URL and private-window state, known credential managers, protected controls, inactive sessions, background apps, and its own process. It never reads screenshots, clipboard content, or keystrokes. Reads are best-effort within 150 ms; provider calls can individually take up to 50 ms. Capture can be partial when the budget or platform visibility metadata limits extraction.
