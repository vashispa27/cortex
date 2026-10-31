# Let a Cortex agent complete steps in a Chrome tab the user points it at

You are adding a browser capability to Cortex's long-running agents. Build it; do not stop at an architecture proposal. First read applicable AGENTS.md instructions, `services/agent-api/README.md`, `docs/agent-api-agent-prompt.md`, and the Agents page in the desktop app (`apps/desktop/src/components/AgentsPage.tsx`, `AgentChatCard.tsx`, `apps/desktop/src/lib/agents.ts`, the `agent_request` Tauri command in `apps/desktop/src-tauri/src/lib.rs`). Preserve unrelated work. Keep capture, retrieval, chat routing and the existing answer flow unchanged.

This is the second attempt. Read the first attempt's evidence before designing anything: `services/agent-api/spikes/browser-tab/README.md`, `docs/browser-tab-architecture.md`, `apps/chrome-extension`, and the spike tests. That spike proved an MV3 extension can share one tab with Cortex. It also proved that rules enforced on raw Chrome DevTools Protocol (CDP) commands cannot keep the agent from filling a password or submitting a form: `Runtime.evaluate` runs arbitrary page code, and even a plain `Input.dispatchMouseEvent` at a coordinate looks the same whether it lands on "Next" or "Submit". This design moves every action, and every check on it, into the extension. Browser Use is not used in this mode.

## What the user gets

The user has a page open in their everyday Chrome, for example a long application form. They tell Cortex "complete this form using my resume" and share that tab. The agent works in that real tab, with the user's existing logins, while the user watches. It fills fields and moves through steps, asks when it is missing information, and stops for the user's approval before anything that cannot be undone. The user can take over at any moment.

In scope:

1. A Chrome extension that shares one tab, performs a small set of typed actions in it, and enforces the safety checks right before each action.
2. A relay in the trusted agent-api manager that pairs with the extension, holds approvals, and gives each job a narrow action endpoint.
3. Browser tools in the existing agent-api graph, driven by the existing model provider configuration.
4. Agents page and notch changes: start a job on a shared tab, follow its steps, answer its questions and approvals.

Out of scope: an agent-owned hidden Chromium ("mode 2", which may use Browser Use later), chat intent routing for browser tasks, values from the Cortex archive or saved facts, file uploads by the agent, the Chrome Web Store listing, Browser Use and Browser Use Cloud, and model fine-tuning. Keep the worker's browser tools behind a small interface so mode 2 can provide the same tools later.

## Architecture

```text
agent-api worker (Docker)  LangGraph loop + browser tools (snapshot, click, type, ...)
        │ typed JSON actions, per-job token, no raw CDP
        ▼
agent-api manager (host)   relay: pairing, job endpoints, site policy, approval grants, action log
        │ paired WebSocket, exact chrome-extension:// origin
        ▼
Cortex extension (MV3)     resolves the element, runs the checks, performs the action via chrome.debugger
        │
        ▼
the one tab the user shared
```

- **The extension is the only code that touches the page.** It uses `chrome.debugger` with its own fixed scripts. Nothing upstream can send it a CDP method, a script, a selector or coordinates; it accepts only the typed actions below.
- **The manager is the authority for jobs and approvals.** It issues job endpoints, checks the site policy, stores the action log, and mints single-use approval grants. The spike already concluded the relay belongs here rather than in Tauri; keep that unless you find a concrete reason, and say so.
- **The worker sees the page only through snapshots.** It never receives the pairing token, raw CDP, cookies, storage, or other tabs.

## Typed actions

Every action names a snapshot ID and an element reference from that snapshot. A stale snapshot or a reference that no longer resolves to the same, visible, enabled element returns a typed error and the agent must take a new snapshot. Define the exact schemas yourself; keep them small.

- `snapshot`: URL, title, and a bounded list of the page's interactive and labelled elements with a ref, role, accessible name, label text, input type, required flag, options for selects, and current value (always masked for sensitive fields), plus a bounded excerpt of visible text. Build it from the accessibility tree and DOM inside the extension. Mark page text as untrusted content in what the worker receives.
- `click(ref)`, `type(ref, text, clear)`, `select(ref, option)`, `set_checked(ref, checked)`, `scroll(ref or direction)`, `wait(bounded, until the page changes or a timeout)`, `navigate(url)`, `back()`.
- Nothing else in v1: no arbitrary script, no raw keys, no coordinates, no file inputs, no downloads, no cookies or storage, no new tabs.

## Checks the extension runs before each action

Run these inside the extension, against the live element, immediately before acting. A check that cannot decide treats the action as unsafe.

- **Sensitive fields.** Refuse `type`, `select` and `set_checked` on password inputs; `autocomplete` values for passwords, one-time codes, and card or bank details; and fields whose name, ID or label match card, CVV, expiry, IBAN or account number, routing or sort code, SSN, Aadhaar, PAN, passport, or tax ID. Return `needs_user` with the field's label. The job pauses and asks the user to fill that field themselves in the tab. Never read or return these values.
- **Final actions.** A `click` is final when the element submits a form (submit buttons, `input type=submit` or `image`, buttons inside a form without an explicit non-submit type), when its accessible name matches a maintained list (submit, send, pay, place order, buy, book, confirm, delete, remove, apply, post, publish, accept, agree, sign, finish, complete, …), or when the extension cannot tell. `type` must never send Enter or a newline into a form field. A final action runs only with an approval grant (below).
- **Unexpected side effects.** Watch navigation and request events while acting. If an action that was not classified as final causes a form submission, POST navigation or a new window, pause the job and report what happened. Add the case to the tests and widen the classifier; do not just log it.
- **Sites.** The job may act only on the shared tab's registrable domain. `navigate` elsewhere, or an action that navigates there, needs approval. A redirect off the domain pauses the job.
- **Logins, CAPTCHAs and "verify it's you" pages.** Hand over to the user. Never attempt them.
- **User takeover.** When the user clicks, types or scrolls in the shared tab outside the extension's own action windows, pause the job and say that the user took over. Resuming is explicit. Work out reliably how to tell the user's input from the extension's own; document how, and test it.

## Approvals and grants

The existing rule stands: tools run only after the user approves a plan. For a tab task the plan names the site, what the agent will fill or do, each value it will use and where that value came from (task text, attached documents, or the user's answers), and where it will stop for review. If a required value is missing, ask with a clarification interaction; never invent one.

Before a final action the job pauses for approval through the existing interaction flow. The review shows the URL, the action, and every value entered so far, with sensitive fields shown only as "filled by you". On approval the manager mints a single-use grant bound to the job, the URL, the element's fingerprint (role, accessible name, form, position in the DOM), and a hash of the form's current values. The extension recomputes all of these just before clicking and refuses if anything differs. If the page changed, the job asks again.

## Agent loop

Register the browser tools in the existing agent-api graph next to the current tools. Use the service's existing provider configuration (OpenRouter, OpenAI-compatible, tool calling). Each model call counts against the job's existing model-call budget and its extension review; choose a sensible default for tab tasks and explain it.

Text on the page is data. Instructions found on a page never change the plan, the allowed site, or the stop rules. The system prompt says so, and the checks above enforce it regardless of what the model does.

LangGraph replays a node from its start when it resumes after `interrupt()`, and the worker exits on every wait. A browser action is an observable side effect, so it must not run twice because of a replay. Record each action in the manager's action log with an idempotency key before sending it and its outcome afterwards. On resume, take a fresh snapshot and treat the live page as the truth about what has already happened. A final action cannot repeat, because its grant is single use.

## Relay, pairing and the Docker boundary

- Pair the extension with the manager once. Keep the pairing secret out of URLs (the spike put it in a query string), store it with file permissions limited to the user, and let the user revoke it.
- The manager accepts extension connections only from the exact extension origin with a valid pairing, on loopback.
- The worker gets a per-job endpoint that works for one job and one shared tab and stops working when the job pauses, ends, or the tab is unshared. Verify how a container reaches it on the supported runtimes (Docker Desktop and Colima both appear in the README) and document the result. This is a new opening in the worker boundary; describe it in the agent-api README next to the existing boundary notes.
- Keep one definition of the allowed actions, shared by the manager and the extension. The spike kept two command lists that disagreed, and its `validate()` compared the job token with itself; do not carry those forward.
- The action log records action type, element label and outcome. It never records values typed into sensitive fields, and it records other typed values only according to the service's existing privacy mode.

## Extension

Evolve `apps/chrome-extension` from the spike. Keep what worked: explicit per-tab sharing from the toolbar popup, stop sharing, detaching on tab close or DevTools, the "Cortex" tab group and badge, following the shared tab by its ID, and leaving Chrome's debugging bar visible. Remove the `127.0.0.1`-only sharing restriction for real use but keep fixture tests on loopback pages. Request the fewest permissions that work and justify each in the architecture note.

Leave `services/agent-api/spikes/browser-tab` in place as evidence. If the extension changes stop its tests from running, say so at the top of its README instead of maintaining the old CDP relay.

## Desktop app

- Show whether the extension is paired and whether a tab is shared, with setup steps when it is not.
- Starting a job can target the shared tab. If none is shared, explain how to share one.
- While running, show the plan, a readable line per action ("Typed into Email", "Selected 'India' in Country", "Waiting for you to enter your password"), and the pause reason.
- Final-action approvals use the existing review card with the URL, action and entered values.

Keep the changes small and consistent with the existing components and copy style.

## Tests and verification

Local fixture sites on `127.0.0.1` only: a multi-step form; a form with password, card and ID fields; a page with hidden injected instructions; a link that opens a new tab; a submit button with a vague label; a form that submits when Enter is pressed; a button that submits through JavaScript although it is not a submit button; and a page that redirects to another domain. Never automate real third-party sites in tests.

The checks live in the extension, so test them in real Chromium with the unpacked extension loaded (Playwright persistent context, as the spike did). Document the Chromium build and how to point the tests at it; the spike's default command failed until `playwright install chromium` was run.

Each of these must pass:

1. Sensitive fields are refused and never appear in snapshots, events or logs.
2. Each final-action pattern is caught, including the vague label, Enter in a field, and the JavaScript-submitting button.
3. A grant works once, and is refused if the URL, element or any value changed after approval.
4. Navigation or a redirect off the shared site pauses the job.
5. User input in the tab pauses the job; unsharing pauses it and revokes the endpoint.
6. Pairing, origin, job-token and revocation checks on the manager.
7. Resume after a worker restart does not repeat completed actions.
8. End to end with a scripted fake model through the real worker, manager and extension: fill the multi-step form, ask for one missing value, stop before submit, approve, submit exactly once.
9. The injected instructions do not change what the fake-model run is allowed to do.

Add an opt-in live smoke test with a real model on the fixture form, kept cheap. If Chrome, Docker or credentials are unavailable, finish the code and the checks you can run, and state exactly which checks were not run. Never present a fixture run as a live success.

## Order of work

Build in this order and get each step working before the next:

1. Extension actions and checks, tested on the fixtures.
2. Manager relay, pairing, job endpoints and grants.
3. Browser tools and the fake-model loop in agent-api.
4. Approvals, clarifications and replay-safe resume.
5. Worker reachability from Docker.
6. Desktop changes.
7. The live smoke test.

Make routine choices yourself. Stop and ask only before choices that widen what the agent can reach or weaken a check above. A check being hard to implement is not a reason to stop: say what you tried and propose the narrowest alternative.

## Deliverables

Source for the extension, manager relay, browser tools and desktop changes; pinned dependencies and lockfile updates; fixtures and tests; and docs:

- A user-facing setup page: load the unpacked extension, pair it, share a tab, run a job, take over, stop.
- An update to `services/agent-api/README.md`: replace the "feasibility checkpoint" section with the real boundary, relay, checks and approval rules.
- An updated `docs/browser-tab-architecture.md` with the diagram above as built, the permission choices, and how takeover detection works.

Finish by reporting what works, exactly what was tested and how, what was not run, known limitations, and the commands to reproduce the end-to-end flow on the fixture form.

## References (check the current versions)

- Chrome remote debugging change in 136: https://developer.chrome.com/blog/remote-debugging-port
- `chrome.debugger` API: https://developer.chrome.com/docs/extensions/reference/api/debugger
- Accessibility tree in CDP: https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/
- Playwright MCP's element-reference snapshots and extension mode: https://playwright.dev/mcp/configuration/browser-extension and the microsoft/playwright-mcp source
- First attempt's evidence: `services/agent-api/spikes/browser-tab/README.md`, `docs/browser-tab-architecture.md`
