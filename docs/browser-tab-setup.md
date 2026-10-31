# Use a Chrome tab with a Cortex agent

A Cortex agent can work in the Chrome tab you are looking at: search a site, fill forms and click
through steps. It is [Browser Use](https://github.com/browser-use/browser-use) driving your own tab
through the Cortex Chrome extension, with the OpenRouter key and model you set in Cortex's settings.

## One-time setup

1. Load the extension: open `chrome://extensions`, turn on **Developer mode**, choose
   **Load unpacked** and pick this repository's `apps/chrome-extension` folder. Its ID is fixed
   (`mcccdbhfgojadapkdepnnebfpngmaecl`) by the manifest key, so there is nothing to pair.
2. Start the agent service from `services/agent-api`:

```sh
uv sync --group dev
uv run python -m cortex_agent_api.migrate
uv run cortex-agent-api
```

The service reads the OpenRouter key Cortex saved (`~/Library/Application Support/Cortex/openrouter.key`).
Each job uses the answer model chosen in Cortex's settings (`OPENROUTER_API_KEY` and `OPENROUTER_MODEL`
override these). The database URL comes from `DATABASE_URL`.

The extension connects to the service on `127.0.0.1:8790` by itself and reconnects when the service
restarts. The Agents page shows **Chrome connected** once it has.

## Run a job

1. Open the page in Chrome.
2. Open Cortex and turn on Agent mode. The chip shows **Using Chrome: <page title>**; click it to
   run the agent without the tab.
3. Describe the task, for example "book the cheapest flight from Dehradun to Bombay on 21 November".
4. Cortex attaches to the tab (Chrome shows its "started debugging this browser" bar) and the agent
   works in it. If something is missing it asks once in the notch, which drops open by itself; it
   confirms once more before the step that books or pays. Type answers in the chat box.
5. **Stop** in the notch cancels the job. When a job ends, Cortex releases the tab.

## How it works

- `apps/chrome-extension/background.js` reports the active tab, attaches `chrome.debugger` to it when
  a job starts, and relays Chrome DevTools Protocol commands and events.
- `services/agent-api/src/cortex_agent_api/browser.py` exposes that tab as a one-page browser at
  `ws://127.0.0.1:8790/v1/browser/cdp` (it answers browser-level calls itself).
- `services/agent-api/src/cortex_agent_api/browser_agent.py` runs a Browser Use agent per job inside
  the service, with an `ask_user` action whose questions become the job's pending question. Claude
  models go through OpenRouter's Anthropic-compatible API (tool calls and prompt caching).

## Tests

```sh
RUN_BROWSER_E2E=1 RUN_AGENT_INTEGRATION=1 uv run pytest tests/browser/test_browser_use.py
```

This loads the unpacked extension in Chromium and drives a local form with a scripted model.
Add `CORTEX_BROWSER_LIVE=1` (with `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`) to use a real model.
