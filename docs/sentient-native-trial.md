> Current behavior: Agent mode in the notch always starts native window/browser control.
> The separate window toggle and prompt-phrase routing have been removed. Normal
> chat remains normal chat; model routing and long-running Agent-mode selection are deferred.
> A captured origin is required; there is no fallback to LangGraph when it is missing.
> Earlier sections below record the trial's development history.

# Sentient native computer-use trial

The standalone local fork lives at
`/Users/abhinavvashisht/workspace/cortex-sentient-trial`, pinned to Sentient OS commit
`fe28c9c14ddb5b2e63902ca137594e9c4e6bfdac`. Its `CortexTrial/README.md` documents
source provenance, adaptations, dependencies, commands and results. The published fork is [vashispa27/cortex-sentient-trial](https://github.com/vashispa27/cortex-sentient-trial/tree/codex/cortex-native-trial),
pinned for this Cortex change to `d04b168f5fd07f83db0b3da7c481e826463308ca`.

It reuses Sentient's native broker/session, state validation, retry policy and
duplicate-action protection, with the existing Codex execution loop. The actual
computer-control engine is OpenAI's installed signed helper, a separate dependency.
The fork retains Sentient's AGPL-3.0 license. Cortex invokes the fork as a separate process. The notch now offers an explicit
"Use this window" option; ordinary Agent mode still defaults to the existing
LangGraph workflow.

## Install the companion fork

From the Cortex repository root, clone the companion into its expected sibling
location and build the native adapter:

```sh
git clone --branch codex/cortex-native-trial https://github.com/vashispa27/cortex-sentient-trial.git ../cortex-sentient-trial
git -C ../cortex-sentient-trial checkout d04b168f5fd07f83db0b3da7c481e826463308ca
../cortex-sentient-trial/CortexTrial/build.sh
```

`CORTEX_SENTIENT_TRIAL_DIR` configures the service's alternate `CortexTrial` folder;
`CORTEX_NATIVE_TRIAL_BINARY` configures the desktop's alternate capture executable.
No compiled OpenAI helper, credentials, screenshots or private run logs are included
in either Git repository. Install runtime dependencies and grant normal macOS
permissions separately as described in the fork.

## Run locally

```sh
cd /Users/abhinavvashisht/workspace/cortex-sentient-trial
./CortexTrial/build.sh
./CortexTrial/.build/sentient-native-trial --probe
python3 CortexTrial/run.py --fixture
```

The fixture opens a local synthetic form in Chrome. It verifies submitted values
independently of the model's success report. It uses the current Codex inference
authentication and makes model calls. Normal native macOS permissions are required;
the launcher does not change them or terminate a shared helper.

In Cortex, invoke the notch from the target app, enable Agent mode, select **Use
this window**, and send the task. Cortex captures metadata before compose takes
focus; submission never resolves the latest active window/tab. The native API
requires this descriptor and rejects a missing one. The Agents dashboard retains
its separately selected legacy Browser Use option.

An explicit real task can be passed using `--task '...' --timeout 300`. Include the
full application path, such as `/Applications/Google Chrome.app`, because Chrome's
alert process can share its localized display name. The CLI remains available for standalone tests. Cortex's native task adapter
uses the same launcher, forwards tool progress to the normal task UI, and supports
Stop and explicit Retry. Pause/resume and interactive question routing are not
available in this trial. Retry retains the original target; it does not rebind.

## Observed results, 2026-11-02

| Check | Result |
| --- | --- |
| Adapted Swift broker build | Passed |
| Real helper connection and catalog | All ten expected native tools available |
| Adapted upstream session-recovery suite | 1,047 real-process assertions passed |
| Live synthetic multi-stage form | Passed in 52.12 seconds, including startup |
| Tool calls | Five state reads, three set-value calls, five clicks |
| Independent server verification | Exactly one submission; all values correct |
| Clarification questions/manual intervention | None needed for the supplied fixture |

The successful run is `CortexTrial/.runs/20261102T040809Z`. An earlier trial using the
ambiguous app name was stopped after 60.98 seconds with zero submissions; the full
application path resolved that failure. These are separate attempts, not a claim
of uninterrupted success. Raw event logs may include native screenshots and remain
gitignored in the standalone fork.

The trial does not yet expose interactive question tools: a real human-only blocker
must be reported. It also does not reproduce Sentient's complete memory/context
system. No controlled Browser Use comparison or real third-party workflow has been
performed. A representative real-task evaluation should precede production adoption.

The trial used the existing Codex login and CLI-default model, rather than Cortex's
selected OpenRouter model. Reported usage was 299,863 input tokens (262,528 cached)
and 706 output tokens across the run. Model choice was not pinned; performance and
cost comparisons need a controlled follow-up, and these counters are not a price.

## Origin binding added after the initial trial

The descriptor records the app path, PID and launch timestamp, native window ID,
and selected accessibility tab identity. The broker retains the actual AX window
and tab references and checks them before and after each tool call. App restart,
window/tab change or loss of identity fails the task; it never selects a new target.
The returned native window title/PID must also match, with ambiguous same-title
windows refused. Page navigation may change the title/URL while retaining the tab.

The helper's public tool arguments still identify an app rather than an atomic
window/tab handle. These checks surround native dispatch; this is not a claim of
an atomic window-ID API. A change discovered after an action stops further actions.
Browser/app configurations that do not expose stable identity are refused.

Final verification:

- Full API → native process adapter → bound Chrome form: completed in 39.45 seconds,
  one independently verified submission with all values correct.
- Real Chrome tests reject another app, an identical-title/URL tab, another window,
  and a process-lifetime mismatch. A target-change block remains latched.
- 1,047 adapted native recovery assertions, 20 focused Python tests, seven focused
  desktop tests, the desktop production build and the Tauri route test passed.

Remaining trial limits: no interactive question tool, no durable native continuation
across service restart, no pause/resume, and no integration of Cortex memory into
the native loop. The CLI uses its existing login/default model; the OpenRouter
model selected in Cortex is not used for this trial. Progress and Stop are connected.
No controlled Browser Use performance comparison has been performed.

The local service was started against the existing persistent agent Postgres on
port 54329; the stale fixture database on 54331 was unavailable. The `.env` file was
not rewritten. The running service uses a process-local database override; future
service launches must select a valid database configuration.

## Recent-run routing repair

The reported email-search run entered LangGraph with `use_native_window=false`
and `use_browser_tab=false` despite a captured origin and an explicit "use this
window" command. Its clarification answer could not change the runner, and an
unavailable `browse_tab` choice raised a worker error. The saved request selected
`anthropic/claude-haiku-5.5`; service startup enables OpenRouter when Cortex has a
saved key, so reading bare shell defaults as "fake mode" was misleading.

Explicit commands beginning with "use this window/tab", "work in the current
window" and equivalent direct wording now select the native runner with the saved
origin. Missing origin fails instead of choosing another window. Unrelated prompts
still use LangGraph. The API returns its runner, so the chat shows the correct path.
Background model schemas exclude browser actions, and unavailable-browser decisions
become capability feedback rather than a worker crash. A clarification answer or
plan approval never silently expands a task's capabilities.

For an explicitly requested new tab, the native agent may open a background link
while retaining the original selected tab. It does not switch to those new tabs.
The native helper's AX element click path can ignore a middle/right mouse button;
the adapter now rejects that combination before dispatch and requires fresh
screenshot coordinates for non-left input.

The final isolated inbox replay passed in 36.07 seconds: the explicit-window task
was routed natively without a window flag, searched synthetic mail, opened exactly
one email page in a background tab, and retained the originating selected tab.
The first replay hit a tab-identity change; a later controlled replay exposed the
AX middle-click defect and correctly reported failure. Only the final replay
passed after non-left input was forced through the pixel path. No real Gmail task
was replayed. The isolated testing browser/profile was closed afterward.

Verification after this repair: 28 focused service tests, 1,050 native real-process
assertions, seven desktop tests and the desktop production build passed. Window
selection is consumed per job so later unrelated prompts do not inherit it.

## Gmail message-row repair

A real Gmail run reached the native agent and found the requested emails, but
Gmail's JavaScript message rows did not behave like ordinary middle-clickable
links. The agent correctly returned COULD_NOT. The earlier anchor-link fixture
did not represent that behavior.

The fork now exposes `duplicate_tab_in_background`: after the agent opens a
message normally in the originating tab, the primitive duplicates the current
address through native browser keys, verifies exactly one additional tab in the
same window, and restores the retained original AX tab. It refuses another
window, ambiguous new tabs, and duplicate attempts for the same URL in one run.
Only this controlled primitive may temporarily select its newly created tab;
ordinary model actions remain bound to the original tab. It does not select an
existing other tab.

The model-free `CortexTrial/test_duplicate_tab.py` passed against a real isolated
Chromium instance: one duplicate, original selection restored, repeat URL did not
create another tab. The 1,050 recovery/input assertions and desktop build passed.
Native requests from the desktop now allow 300 active seconds for multi-message
workflows.

A rerun of the saved Gmail request was attempted with its unchanged saved target
(4e79c448-8a53-423d-8e2f-00902d2ada46). It stopped at startup because that tab's AX
identity was no longer available in the originating window. No target was rebound.
The actual five-message Gmail flow remains unverified pending a fresh user
invocation from the intended tab; the saved rerun is not a successful acceptance
test and the user has not been told it is.
