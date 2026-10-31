> **Superseded.** Browser jobs now run Browser Use over a plain CDP relay in the extension; see
> `docs/browser-tab-setup.md`. This note describes the earlier typed-action design.

# Typed shared-tab browser actions

```text
agent-api Docker worker: LangGraph + registered browse_tab tool + existing model provider
        │ typed JSON actions, per-segment bearer capability; no CDP/script/selector/coordinates
        ▼
trusted host agent-api manager: tab claiming, job scope, action journal, approval/grant authority
        │ WebSocket: loopback peer + the extension's fixed origin
        ▼
Cortex MV3 extension: resolves snapshot refs, checks live elements, fixed isolated-world scripts
        │ chrome.debugger, attached when a job starts, released when it ends
        ▼
the Chrome tab the user was on, with existing login state and Chrome's debugger banner
```

Browser Use is absent from this mode's dependencies and execution path. The first attempt remains
under `services/agent-api/spikes/browser-tab`, including its original architecture note. Its old
CDP integration case no longer matches the evolved extension; its README says so explicitly.

## Authority and boundary

The relay lives in the existing agent-api manager because that process already owns task status,
input revisions, approvals and Docker configuration. Keeping it here gives one authority for browser
capabilities and review grants; Tauri remains a narrow HTTP proxy for status.
Workers receive only a browser endpoint and segment token as configuration. They do not receive
arbitrary CDP, the Docker socket, repository, archive or host home. Loopback networking
is a new opening from Docker to this authenticated manager; it is not a hostile-code sandbox.

The manager binds on loopback and accepts the extension socket only from a loopback peer with the
Cortex extension's origin, whose ID the manifest key fixes. Browsers never let a web page send a
`chrome-extension://` origin. There is no pairing token: a local process that could forge the origin
could equally read any token file the user owns. The extension reports the active tab; nothing is
attached until a job starts and claims that tab. Worker tokens are random, held as hashes,
bound to one task, worker lease, input revision and sharing generation, and checked on every request.
A recorded approval of that input revision's plan is required even for snapshots. Paused/ended/expired
jobs fail authentication immediately; the monitor and worker release also remove their tokens.

Only one active job can own a physical tab. The binding includes Chrome tab ID and a session-storage
browser-instance nonce, preventing a later browser instance's reused tab ID from satisfying an old job.
Resuming re-claims the job's original tab; switching to another tab never changes a running job's
target. The manager releases the tab once no unfinished job uses it.

Colima was tested with `host.docker.internal` reaching a host listener bound only to `127.0.0.1`.
Docker Desktop was not available for verification. `demo/browser_reachability.py` is the reproducible
runtime probe. No wildcard listener or broad host forwarding was added. Custom ports use
`CORTEX_BROWSER_WORKER_URL`; the extension and desktop API URL must match that manager port.

## Protocol and extension enforcement

`browser_protocol.json` in the Python package is the canonical JSON Schema. The unpacked extension
gets a byte-identical packaged copy through `demo/sync_browser_protocol.py`; a test checks equality.
Both ends reject unknown action names and properties. The only operations are snapshot, click,
type, select, set_checked, scroll, bounded wait, navigate and back. There is no executable payload.

The extension retains references to actual DOM nodes in a dedicated isolated execution world.
Snapshot IDs bind document identity, URL, DOM revision, exact element/form fingerprints, and full native field values;
returned previews are bounded. Replacing, disabling, hiding or moving a node, editing values, or
changing the URL invalidates its snapshot. Native form values are hashed in full, including beyond
preview truncation. Sensitive values are never read: snapshots use placeholders and trusted-input
revision tracking. Because a full private-value hash would contradict that rule, final clicks on
pages containing sensitive controls are manual in this version.

Snapshots combine fixed DOM inspection with accessibility name confirmation. Raw accessibility data
never leaves the extension, and AX retrieval is skipped on private/manual-handover pages to avoid
reading sensitive AX values. Visible text excludes hidden content, scripts and form-value text; private
pages omit the excerpt entirely. Every snapshot explicitly marks its content untrusted.

Before acting, fixed scripts check the current snapshot, exact reference identity, visible/enabled state,
sensitive metadata and requested operation. Newlines/Enter, file controls and private inputs are refused.
All clicks with uncertain effects require review; this deliberately includes all current click targets,
so vague submit labels and JavaScript handlers cannot evade the classifier. Consent checkboxes are
manual. Newly opened windows, unexpected form submissions, mutating requests and off-site navigation
produce a pause. Fetch interception blocks unapproved mutating/document requests and attachment/PDF
responses. An unexpected-effect pause retains its network block until a trusted user takes over.
Approved final requests get a short 1.5-second action window; delayed asynchronous submissions may
require manual completion. Navigation approvals explicitly bind their destination/site; redirects onto
another unapproved site are blocked.

Site calculation uses tldextract's bundled PSL with private suffixes and network fetching disabled.
The extension enforces the manager-issued site again, including scheme and credential checks. Login,
CAPTCHA, visible embedded frames, shadow controls and oversized forms return a manual handover.
The extension does not claim to automate custom browser controls or sandbox the site's own scripts.

## User takeover

The extension's own typing uses native DOM setters plus untrusted input/change events. Its own clicks
use `HTMLElement.click()`, whose click event is untrusted. Human pointer, keyboard, wheel and input
signals are trusted and pause the job. Programmatic scrolling alone gets a 300-ms scroll window;
trusted wheel, pointer and keyboard signals still take over during it. No raw CDP Input events are
synthesized, avoiding the ambiguity between human and agent-generated trusted input. Pages that
require those events hand over to the user. Pausing does not imply rollback of an accepted action.

## Durable reviews and replay

The graph has one model loop using the existing provider and model-call budget. Browser defaults are
24 model calls, 40 tool calls and 300 active seconds; extension reviews keep the existing eight-call
increments and 40-call ceiling. A browser operation is a registered tool, not a second model loop.
The model is instructed to name every planned value/source and ask for missing values. The manager
also refuses literal typed values absent from task text, supplied documents or resolved answers; this
is a provenance containment check, not semantic proof that a value suits a particular field.

The manager reserves an `action_records` key before dispatch and records the outcome afterwards.
Keys derive from task revision and graph turn, so replay returns recorded work. A started/uncertain
record is never resent automatically. Full snapshots and typed arguments are not stored in action
records. Operational events contain action, label and outcome only, across all trace modes; privacy
modes do not opt in to recording typed browser values. Required approval proposals and ordinary values from earlier steps live in separate browser review
state tables, not action-record payloads. They are user-visible review records with masked field summaries. The latter survive navigation between form steps; private values never enter them. Model/graph history still contains bounded, masked page
observations, and ordinary service trace opt-in rules continue to apply.

Final-action review is its own replay-safe interrupt node. An approved response is validated against
the manager's recorded original proposal and input revision. A grant is consumed durably before
dispatch and is unique per interaction. The manager takes a fresh snapshot and re-finds the exact
approved fingerprint. The extension checks job, URL, fingerprint, form-value hash, expiry and prior
consumption immediately before clicking. Changed state requires a new review. Reject and request
changes cannot mint a grant. Crashes with unknown external outcomes pause instead of retrying.

## Verification and limits

See `docs/browser-tab-setup.md` for commands and the test coverage. Tests include a real Chromium
extension, deterministic manager/graph checks, real Postgres journals, and a full fake-model Docker
worker path with plan review, missing-value clarification, two click reviews, duplicate approval
responses, exactly one POST and final result review. The hidden page instruction cannot add an action
or value to the capability surface. No real third-party site was automated. A separate live-provider
smoke exists but was not run because credentials were absent. Docker Desktop and interactive native
Tauri UI behavior remain unverified; TypeScript/build, UI component tests and Tauri route checks cover
the available desktop validation.
