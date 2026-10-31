> Historical spike. The extension in `apps/chrome-extension` now implements the second-attempt
> typed-action protocol. The old opt-in CDP/Browser Use extension integration test below no longer
> runs against that extension. Its evidence and standalone policy tests remain here unchanged.
> Current tests and setup are documented in `docs/browser-tab-setup.md` at the repository root.

# Browser tab feasibility checkpoint

**Status: transport demonstrated; production capability blocked at the safety spike.**
This is an isolated experiment, not a supported Cortex feature. It is not registered in
`registered_tools`, the task schema, the dispatcher, or either desktop agent entry point.
Do not use it on personal accounts or install the extension in an everyday Chrome profile.

The supplied implementation prompt explicitly says to stop and report a specific failure after
the short Browser Use spike, before switching approaches. This directory preserves that evidence.
No fallback has been implemented and no existing capture, retrieval, routing or answer code changed.

## What was observed

With `browser-use==0.13.14`, Playwright `1.64.1`, and a disposable Chromium persistent profile,
the test loads the real MV3 extension, explicitly shares a local fixture by tab ID, and connects
Browser Use's `BrowserSession` to the relay WebSocket. It reads the fixture title, sees exactly one
page, resolves the Email field, and fills it with Browser Use's standard `Element.fill()` method.

The test then deliberately exercises Browser Use's generic Runtime interface in **unsafe fixture
mode**, on synthetic data only:

1. Read local storage through `Runtime.evaluate`, despite refusing `Storage.*` and cookie methods.
2. Set the password input and call `form.requestSubmit()` through `Runtime.evaluate`.
3. Verify the fixture HTTP server received exactly one POST, including the synthetic password.
4. Verify the relay forwarded neither `Input.*` nor `Page.navigate` during the bypass operations
   (the earlier ordinary `fill()` uses input commands).
5. Switch back to the default policy, which refuses both Runtime evaluation methods, and verify
   that even `page.evaluate('() => document.title')` is refused.
6. Stop sharing through the extension; verify the tab detaches and its old CDP capability is revoked.

This establishes that a method allowlist on a generic CDP relay is insufficient to implement the
requested deterministic final-action and sensitive-field guards. It does **not** establish that
Browser Use cannot connect to an extension relay, nor that a custom, carefully audited Browser Use
integration is impossible. The title/field transport succeeds. The blocker is enforcing the specified
safety contract while forwarding generic Runtime, not a missing browser or model credential.

Browser Use uses Runtime itself for DOM lookups and normal interaction helpers. Its page/element
`evaluate` APIs allow arbitrary script. A regex over JavaScript, a model instruction, or checking
only `Page.navigate` and `Input.*` would leave bypasses. `allowed_domains` is likewise not a
relay-level permission boundary for arbitrary JavaScript. The experiment intentionally does not
claim otherwise.

## Reproduce

From the repository root (Python 3.12 and uv required):

```sh
cd services/agent-api/spikes/browser-tab
uv sync --locked --python 3.12
uv run --locked pytest -q
uv run --locked playwright install chromium
CORTEX_BROWSER_SPIKE=1 uv run --locked pytest -q -s
```

The last command launches a **visible, disposable** Chromium with the unpacked extension, runs
only pages on `127.0.0.1`, and closes it afterwards. It makes no model calls. Extension share/stop
messages are invoked from its own popup page, with the fixture's exact tab ID. This exercises the
same extension message handler as the popup, rather than automating Chrome toolbar UI. The test
uses ephemeral loopback ports and random pairing/job tokens; access logs are disabled.

To use an already installed Chromium for Testing, set `CORTEX_SPIKE_CHROMIUM` to its executable
path. The checked run used Chromium build 1228 from the local Playwright cache. The unpacked
extension is at `apps/chrome-extension` relative to the repository root. The test supplies pairing
and sharing; there is no persistent desktop setup flow yet.

## Test coverage and limits

The 20 passing cases comprise 18 in-process authentication/allowlist/target checks, one loopback
WebSocket authentication and revocation test, and one real Chromium/extension/Browser Use actor
integration test. Without the opt-in flag the Chromium case is skipped. Refusal events contain
method names only, without parameter or result values.

Covered: wrong pairing token, wrong extension origin, wrong job token, foreign target/session,
cookie/storage/download/permission/file/target mutation refusals, singleton target discovery,
closed/revoked endpoint, actual extension sharing/detach, real Browser Use transport, and the
Runtime bypass above. Browser Use also attempted `Browser.setDownloadBehavior` during startup
even with `accept_downloads=False`; the relay refused it and Browser Use logged a warning.

**Not implemented or tested:** an autonomous Agent loop with a fake or live model, model-call
budget accounting, durable job/replay semantics, plan and final-action approvals, takeover detection,
registrable-domain policy, production pairing persistence, manager lifecycle, Docker-to-host
connectivity, or desktop changes. The hidden injection text and new-tab link exist in the fixture;
there is no claim that a model obeyed the injection rule or that the full new-tab workflow passed.
This is not the requested full end-to-end job acceptance test or a real-provider smoke test.

## Next implementation decision

The smaller, typed-action fallback described in the prompt would move page reads, click, type,
select, and scroll into trusted extension/relay handlers, without exposing generic Runtime to the
worker. Each handler can check its target and current state before acting; final actions can use a
single-use approval hash. Browser Use could alternatively be retained behind an audited subset
of actions and fixed script templates, but that requires its own proof of the same boundary.
Do not enable the browser capability until the chosen path passes the full guard, replay, takeover,
and approval tests from the prompt.
