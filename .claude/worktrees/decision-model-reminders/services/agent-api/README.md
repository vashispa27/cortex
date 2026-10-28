# Cortex local agent API

This is a local agent service with HTTP and terminal clients, durable workflows, and human review. It does not read the Cortex archive, mount a home directory, send LinkedIn messages, or expose a browser UI.

## Interactive terminal client

With Colima (or Docker Desktop) and the local Postgres service already running:

```sh
cd /Users/abhinavvashisht/workspace/rewind/services/agent-api
export OPENROUTER_API_KEY='your-key'
export OPENROUTER_MODEL='provider/model-id'
uv run cortex-agent
```

Type a prompt at `You ›`. The agent can ask questions, propose a plan, choose public research tools,
and prepare a Markdown result. At a review, enter `y` to approve, `n` to reject, or type feedback to
request a revision. The current task version and interaction IDs are handled by the client. A rejection
ends that task; feedback routes back to the model. This command uses the new `workflow=agent`; older
API clients keep the existing recruiter workflow by default. The existing Rust `cortex` command is unchanged.

Greetings can receive direct replies. Substantive answers generated without tools go to final review;
tool execution requires an approved plan. A premature tool request is converted into a plan proposal.

The CLI starts a local FastAPI manager on port 8791, inherits your exported model credentials, and builds
the worker image automatically if its source changed. Graph execution still happens in task containers
and uses Postgres checkpoints. It needs a model with **tool/function calling** support. Every model call
uses OpenRouter's OpenAI-compatible endpoint at `https://openrouter.ai/api/v1`, through LangChain.
Keys are worker configuration, never task inputs or conversation history. Closing the CLI stops its
own manager; task inputs, checkpoints, artifacts, questions, and approvals stay in Postgres.

Examples:

```sh
uv run cortex-agent "Explain PostgreSQL indexes with a concrete example"
uv run cortex-agent --file ./resume.md "Read my supplied resume and suggest improvements"
uv run cortex-agent --resume TASK_ID
# Explicit fixtures, without model credentials or live research:
uv run cortex-agent --demo
# Attach to a separately configured API (that API must already have the model credentials):
uv run cortex-agent --api-url http://127.0.0.1:8790
```

Inside the client:

| Command | Effect |
| --- | --- |
| `/attach PATH` | Attach a bounded UTF-8 text document to the next task |
| `/paste` | Enter a multiline prompt; finish with a line containing only `.` |
| `/tasks`, `/resume ID` | Find and reconnect to a persisted task |
| `/watch`, `/status` | Watch progress or inspect current state |
| `/artifacts`, `/download ID` | List outputs or save one under `agent-downloads/<task-id>/` |
| `/cancel`, `/retry` | Cancel the current task or explicitly retry a failure |
| `/detach` at a review | Leave the review pending and return to the prompt |
| `/quit` | Exit the terminal session |

Ctrl+C while watching detaches without approving or cancelling. Each new prompt creates a new task;
feedback entered at a review revises the current task. There is no implicit approval or auto-accept.

For web search, optionally export `CORTEX_AGENT_TAVILY_API_KEY`. Without it, the live CLI explicitly
disables search; it can still fetch a supplied public URL or read supplied text. It never substitutes fake
search results for real work. The general graph stores tool history and concise working notes between
steps, counts model/tool calls across review pauses, and ties final review to the result hash. It supports
text tasks and the listed tools; arbitrary shell/Python execution and chart/PDF generation are not exposed.

New CLI tasks start with 16 model calls; use `--max-model-calls 24` to choose an initial budget (1–40).
The model sees remaining calls and is instructed to synthesize with two calls left. If it reaches its
limit, the graph pauses for permission to add up to eight calls, capped at 40 total. No additional model
call occurs before approval. Rejecting the extension saves a `research-progress.md` artifact and marks
the outcome incomplete. Existing tasks retain their original initial budget; `/retry` of an older
budget failure now reaches this persisted extension review rather than repeating the same failure.

Without Postgres running, first run `docker compose up -d --wait postgres`. Use `--port` if 8791 is occupied.
Startup/build diagnostics are in `.data/cli-manager.log`. Live OpenRouter calls incur your provider's usage.

## What runs where

```text
curl / Python client
        │ local bearer token
        ▼
FastAPI control plane (trusted host process)
  ├─ PostgreSQL: tasks, immutable input revisions, event log, leases, approvals,
  │             artifacts metadata, schedules, and LangGraph checkpoints
  ├─ database dispatcher: claims durable segments and timer events
  └─ Docker manager: starts one bounded worker per segment
             │ only task workspace + narrow configuration
             ▼
Docker worker (non-root, read-only root filesystem)
  └─ LangGraph + registered tools → persisted artifacts and checkpoint
```

The control plane is the authority for status transitions, approvals, artifacts, timers, and container arguments. A worker is not allowed arbitrary shell/Python execution. It can use only registered, typed capabilities; the fixed Markdown artifact writer is the v1 execution example.

The worker is isolated for accidental-containment and least-access purposes, not a hardened hostile-code sandbox. It requires outbound networking for configured search. DNS rebinding and every redirect target are checked by the public-page fetch wrapper, but Docker's default bridge network is not a complete egress policy. Never treat this as safe for model-generated executable code; that needs a separate credential-free code sandbox.

## Quick start

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), Docker Desktop running on macOS, and Docker Compose.

```sh
cd /Users/abhinavvashisht/workspace/rewind/services/agent-api
cp .env.example .env
# Edit CORTEX_AGENT_API_TOKEN to a new long random value.
docker compose up -d postgres
uv sync --group dev
uv run cortex-agent-migrate
docker build -t cortex-agent-worker:local .
set -a; source .env; set +a
uv run cortex-agent-api
```

The trusted manager is the `uv run cortex-agent-api` process on the Mac. It binds to `127.0.0.1:8790`. The worker receives a bind-mounted directory only at `.data/tasks/<task-id>` as `/workspace`; it does **not** receive the repository, a home directory, Cortex's archive, or the Docker socket. Missing Docker produces a `docker_unavailable` task error—there is no host-execution fallback.

`GET /health` says whether the process is up. `GET /ready` additionally checks Postgres and Docker. The generated OpenAPI document is available at `/openapi.json` and interactive local docs at `/docs`.

## State and approval semantics

```text
queued → running → waiting_input ──────┐
             │                         │ typed response / new segment
             ├→ waiting_approval ──────┤
             ├→ waiting_event ─────────┤ due event / new segment
             └→ completed

running/waiting_* → paused → queued (plain resume)
any non-terminal state → cancelled
running → failed → queued (explicit retry)
```

`POST /v1/tasks` and interaction responses are committed before they are dispatched. Every state-changing call needs an expected task version and an idempotency key where it can have externally observable effect. Reusing an idempotency key with a different body is a conflict. An approval is tied to an immutable input revision and exact artifact hashes; changing inputs invalidates pending approvals and schedules.

LangGraph `interrupt()` checkpoints the graph by stable `thread_id`. Nodes replay from their start when an interrupt is resumed, so graph nodes do not perform observable writes. The worker persists sources, artifacts, interactions, and timers afterwards using idempotent unique keys. This is at-least-once execution with reconciliation, not a universal exactly-once claim. If a worker dies, expired segment leases are requeued on manager restart; late responses cannot revive a cancelled task.

## Demonstration

Run the synthetic, explicit-fake-provider walkthrough after starting the API:

```sh
CORTEX_AGENT_API_TOKEN='the-token-you-set' uv run python demo/e2e.py
```

It creates an invented recruiter conversation and resume, waits for plan approval, approves it, requests a final-material change, edits an input revision, approves the replacement material, and shows the scheduled reminder event. It does not contact a real company or use personal data.

To demonstrate restart/recovery manually, stop the API with `Ctrl-C` while a task is in `waiting_approval` or `waiting_event`, start it again with the same `.env` and Postgres volume, then retrieve the same task and interaction IDs. They remain available because neither state lives in the HTTP process. To exercise a worker crash, submit a task and use `docker kill <worker-container>` after its `worker_started` event; restart the manager after the lease expires (90 seconds by default). The persisted segment is reclaimed and resumes from the stable LangGraph thread/checkpoint. Inspect `GET /v1/tasks/<task-id>/events` to distinguish recovery from a second observable action. This is deliberately at-least-once/reconciled behavior, not a false exactly-once promise.

For a manual request:

```sh
curl -X POST http://127.0.0.1:8790/v1/tasks \
  -H "Authorization: Bearer $CORTEX_AGENT_API_TOKEN" \
  -H 'Idempotency-Key: recruiter-demo-001' -H 'Content-Type: application/json' \
  --data @fixtures/recruiter-task.json
```

Then inspect `GET /v1/tasks/<task-id>`, `GET /v1/tasks/<task-id>/interactions`, artifact URLs, and `GET /v1/tasks/<task-id>/events` (or use `Accept: text/event-stream` and `Last-Event-ID` for reconnectable SSE). All task APIs require the bearer token.

## Providers and tracing

`CORTEX_AGENT_MODEL_MODE=fake` and `CORTEX_AGENT_SEARCH_MODE=fake` are deterministic, visibly synthetic demo modes. They never masquerade as real research. Set model mode to `openai` with `CORTEX_AGENT_OPENAI_API_KEY` and a model name, and search mode to `tavily` with `CORTEX_AGENT_TAVILY_API_KEY`, for an opt-in real-provider smoke test. Search query construction deliberately excludes recruiter conversation and resume content.

LangChain supplies the model/tool interfaces and typed structured output. LangGraph supplies the state graph, checkpoints, and interrupts. LangSmith is optional tracing/evaluation infrastructure; `CORTEX_AGENT_TRACE_MODE=off` is the default. `metadata` records only operational metadata; `redacted` is reserved for an explicit future redaction policy. Credentials are never exported. The service always writes its own local operational event log; no trace is required to understand actions or source evidence.

## Tests

```sh
uv run pytest
uv run ruff check src tests
# After `docker compose up -d postgres` and `docker build -t cortex-agent-worker:local .`:
RUN_AGENT_INTEGRATION=1 uv run pytest -m integration
```

The deterministic suite has no Docker or provider dependency. Docker/Postgres integration checks are intentionally marked separately and run only when those services are available. A real provider smoke test is opt-in and should use synthetic fixtures; it is not part of the normal suite.

## Limits and current scope

The first vertical slice is deliberately conservative: Markdown artifacts, deterministic fake fixtures, one recruiter/resume workflow, and API-event reminder delivery. It does not yet render PDF, ingest arbitrary binary uploads, perform full HTML extraction in the graph, send notifications, or provide a hardened arbitrary-code sandbox. The supplied master resume remains authoritative—v1 adds a labelled alignment note instead of rewriting claims. These limitations are explicit rather than being hidden behind a generic “agent.”
