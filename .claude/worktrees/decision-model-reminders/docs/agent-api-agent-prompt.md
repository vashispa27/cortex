# Implement Cortex's local agent API

You are implementing a new backend feature in the Cortex repository. Build it; do not stop at an architecture proposal. First inspect applicable AGENTS.md instructions, the repository structure, and existing contracts. Preserve unrelated work. Keep the desktop UI, capture, retrieval, and existing answer flow unchanged.

## Purpose and scope

I am a backend engineer using Cortex to learn AI application and agent infrastructure engineering. I already have experience with RAG, answer evaluations, debugging LLM applications, local models, and preparing SFT data. This feature should teach LangChain, LangGraph, LangSmith, tool use, sandboxed execution, durable workflows, approvals, input revisions, observability, and agent evaluation.

Build a local, API-only service. I submit a conversation, a task, and optional supporting documents. An agent works in a sandbox, saves progress, asks questions or requests approval when necessary, accepts revisions, and resumes across process/container restarts. No frontend. Provide OpenAPI and a reproducible curl or Python walkthrough.

Use Python, FastAPI, Pydantic, LangChain, LangGraph, LangSmith, and uv. Put the service in services/agent-api unless repository conventions justify another location. Use PostgreSQL locally for application records, durable work dispatch, and the supported LangGraph Postgres checkpointer. Use a single database service and straightforward migrations. Pin compatible dependencies and commit the lockfile. Consult current official framework documentation; do not copy remembered, potentially outdated APIs.

## First vertical slice

Support this scenario, using synthetic fixtures for the demo:

"Here is my LinkedIn conversation with a recruiter. I promised to send my resume tomorrow. Research the company and role, tailor my supplied resume using only truthful experience, draft the accompanying message, and prepare a reminder. Ask me to review the plan and application materials."

Input includes the conversation, task, master resume text/document, optional job description or URL, timezone, and configurable execution limits. Ask for a missing essential input instead of guessing. Distinguish company facts supported by external sources from candidate facts supplied by the user. Do not fabricate qualifications, dates, employers, or numerical achievements.

Deliver a sourced company/role brief, tailored resume as a downloadable document, recruiter message draft, and a change summary tying resume changes to supplied experience. Start with Markdown resume output; add a PDF using a fixed renderer if feasible. Do not make sophisticated resume formatting a dependency of completing the runtime.

No real LinkedIn integration or automatic sending in this slice. The conversation is explicitly supplied through the API. Model/tool adapters must be reusable beyond this particular scenario, but avoid building a generic workflow DSL or plugin marketplace.

## Runtime and sandbox boundary

Run each task's graph worker in a task-scoped Docker container. The trusted local control plane owns API authentication, application records, durable work dispatch, approval records, scheduling, artifact indexing, and container lifecycle. Implement one local Docker backend with a small interface; do not build multiple sandbox providers.

The container runs the trusted Python graph application and registered tools. It gets only its task workspace and the minimal configuration/credentials it requires. Never mount the user's home, live Cortex archive, entire repository, or Docker socket into the task container. Use a non-root user, explicit CPU/memory/process/time limits, a read-only root filesystem where practical, and a bounded writable workspace. The host manager chooses the image, mounts, and limits; model input cannot choose arbitrary Docker arguments.

Do not expose arbitrary shell execution or execution of model-generated Python inside the credential-bearing graph worker in v1. Fixed document-rendering tools are sufficient to demonstrate real sandboxed execution. Document this boundary accurately: containerized task workers are not a hardened hostile-code execution service. Future generated-code execution needs a separate credential-free execution sandbox.

Keep task artifacts in persistent task-scoped storage so replacing a container does not lose them. Store checkpoints outside ephemeral containers. A worker exits after completing an execution segment, entering an interrupt/wait state, or reaching a terminal state. Approval waits must not hold an HTTP request, worker slot, or container alive indefinitely. On approval, dispatch a fresh segment using the same persistent graph thread.

Missing Docker must produce an actionable error; do not silently execute the task on the host. Document the local macOS/Docker Desktop setup and exactly where the trusted manager runs. Do not provision paid infrastructure.

## Agent workflow

Use an explicit LangGraph StateGraph with typed state and bounded model/tool loops. Suggested stages: understand inputs -> propose plan -> review/clarify -> research -> draft -> validate -> review/revise -> finalize or wait for a scheduled event.

The model should genuinely choose relevant research tools and adapt to results. Use deterministic application logic for authorization, budgets, action execution, concurrency, and terminal transitions. Keep one agent initially; no supervisor or multi-agent system is required.

Use LangChain's model interfaces, typed tools, and structured output capabilities. Include real configurable model and search adapters, plus deterministic fake adapters for tests. An unconfigured provider should give a clear configuration error; test/demo mode must be explicit and cannot masquerade as real research.

Initial tools: search the web; fetch bounded public page content; read supplied task documents; write/version artifacts; render a document; propose a scheduled reminder. The tools cannot read arbitrary host paths. Save source URLs, retrieval times, and enough cited evidence to inspect research claims. Search queries should exclude unnecessary personal information.

Conversation text, documents, and retrieved pages are untrusted task data. They must not acquire system-message authority or change tool permissions. Validate tool arguments and artifact paths. The URL-fetch tool must reject non-public/local/private targets and validate redirects. Document any network isolation limitations.

Graph state should include input revision, objective, structured plan/progress, messages or bounded summaries, evidence references, artifact versions, pending interaction, execution budgets, and outcome. Preserve source records outside compressed model context. Separate checkpoint state from application records and artifact bytes; do not duplicate the entire archive into every model call.

## Persistence and execution semantics

Persist tasks, input versions, execution segments, pending interactions, responses, checkpoints, artifact manifests, scheduled events, and an append-only application event log.

Use a persistent LangGraph checkpointer and stable task-to-thread identity. Do not use in-memory checkpointing for the actual service. Use real interrupt/resume primitives. Verify replay semantics: code before an interrupt may run again, so keep observable side effects outside replay-sensitive approval nodes or make them idempotent.

Creation/resume requests enqueue durable work and return promptly. Do not rely on FastAPI BackgroundTasks or an in-memory queue for durability. A small database-backed dispatcher with leases, heartbeats, and recovery is sufficient. Enforce one active graph writer per task. Handle expired leases and fence stale workers so recovered execution cannot race an older worker. Define a consistent locking/transition policy for API edits, approvals, cancellation, and worker checkpoint writes.

Handle crashes between an API transaction and graph execution. Persist the response/command before dispatch; retries must reconcile with checkpoints and existing command/action records rather than blindly applying the same graph resume twice. Recover orphaned task containers and in-flight jobs after manager restart.

Use idempotency keys for task creation, interaction responses, and observable actions. Reject reuse of an idempotency key with a different payload. Do not claim universal exactly-once execution: use action records and idempotency/reconciliation where possible, and identify uncertain outcomes instead of blindly repeating an external action.

Set explicit limits on model/tool calls, retries, active runtime, fetched content, and artifact size. Use finite retries with backoff. Distinguish time spent actively executing from days spent waiting. Record token usage and estimated cost when available, with unknown values remaining unknown.

## Approvals, clarification, and edits

Distinguish clarification requests from approval requests. Both persist across full shutdown/restart. V1 requires plan approval and final-material approval; routine permitted research and draft creation should proceed without approval for every tool call.

A pending approval identifies the task/input revision, interaction ID, proposed operation, exact payload or artifact version/hash, and readable preview. Decisions include approve, reject, and request changes. A clarification response supplies typed missing information. A request for changes records feedback and routes back to the appropriate graph stage.

Approval grants permission only for that specific proposal. Changing an approved document, recipient, schedule, or operation requires a new approval. The model cannot approve its own request. Enforce approvals in application/tool execution code, not only prompts.

Require expected task version on state-changing requests. Handle duplicate and stale responses explicitly. A duplicate accepted response returns its existing result; a stale interaction/revision or conflicting decision returns a conflict and cannot execute an action.

Allow editing task instructions, supplied conversation, candidate facts, and supporting documents while paused or waiting. Record an immutable input version and invalidate affected approvals and drafts. Re-enter an explicit reconciliation/replanning stage through controlled graph input; never mutate a live graph concurrently. Reject edits while running with a clear conflict and instructions to pause first. Pausing is cooperative at safe boundaries and must account for an in-flight tool call; do not promise rollback.

Support cancellation and explicit retry of recoverable failures. Late events/approvals must not resurrect cancelled tasks. Retry must preserve completed durable work. Expose partial progress and artifacts on failure.

## Local API contract

Provide versioned endpoints, typed request/response schemas, consistent errors, task versions, and documented status transitions. Suggested contract:

- POST /v1/tasks: conversation, task, supporting inputs, timezone, limits; returns 202 with task_id, version, and URLs.
- GET /v1/tasks and GET /v1/tasks/{id}: list/detail with status, progress, current input revision, pending interaction, artifact references, and error/outcome.
- GET /v1/tasks/{id}/events: persisted ordered event stream, supporting SSE and reconnect from an event ID. Also allow bounded JSON history for scripts.
- GET /v1/tasks/{id}/interactions: pending and resolved clarification/approval requests with previews.
- POST /v1/tasks/{id}/interactions/{interaction_id}/responses: expected_version, idempotency key, typed decision/answer/feedback. Returns the persisted response and queued execution information.
- PATCH /v1/tasks/{id}/inputs: version-checked edits while paused/waiting; returns the new revision and invalidations.
- POST /v1/tasks/{id}/pause, /resume, /cancel, /retry: explicit control semantics; resume of a plain pause is distinct from answering an interrupt.
- GET /v1/tasks/{id}/artifacts and GET /v1/tasks/{id}/artifacts/{artifact_id}: immutable version metadata and safe downloads.
- GET /health and GET /ready: process and dependency readiness separately.

Adjust endpoint shapes if justified, but cover every capability. Artifacts must be addressed by IDs, not arbitrary filesystem paths. Supporting-document input may start with text/JSON and bounded uploads; do not accept arbitrary host file paths.

Suggested statuses: queued, running, paused, waiting_input, waiting_approval, waiting_event, completed, failed, cancelled. Define which are terminal and which transitions require version checks. Bind locally by default and require a local bearer token; do not expose a public unauthenticated service. Avoid wildcard CORS.

## Minimal scheduled events

Implement durable wake_at events so the resume example can wait until tomorrow. Resolve relative times to an explicit date/time and IANA timezone and include the resolved value in the approval preview. Ask for a time if ambiguous. Use an injectable clock in tests.

If the task includes a reminder, it can finalize approved materials, enter waiting_event, and emit a persisted reminder_due event at the due time before completing. Deliver the reminder via the API/event log only. Do not imply it was sent as email or a desktop notification, or that the user sent their resume. Reminders include references to the approved artifact versions. Cancellation/editing must invalidate obsolete scheduled events. Overdue events should be caught up after restart without duplicate delivery.

This is event plumbing for the local API, not an instruction to create an automation in Codex. Defer Gmail/LinkedIn webhooks, external messaging, recurring schedules, and frontend notifications.

## Observability

Integrate LangSmith traces for graph segments, model calls, registered tools, validation, retries, and errors. Correlate segments with stable task/thread IDs, execution segment IDs, input revisions, and interaction IDs. Expose trace references in task/event responses when available. Capture structured operational events locally regardless of whether LangSmith is configured or reachable.

Support trace-off and metadata-only/redacted operation; use synthetic data in the demonstration. Never log credentials. Do not upload a user's entire conversation or resume automatically just because tracing is enabled. Make content export configuration explicit and test it. Record tool inputs/outputs only within the chosen privacy mode. Operational explanations should describe actions and evidence, without requiring hidden chain-of-thought.

## Tests and evaluation

Use pytest and deterministic model/search fixtures for the core suite. Include integration tests using real local Postgres and real Docker task containers. Do not count an in-process mock as proof of sandboxing or restart recovery.

Acceptance scenarios:

1. Submit a synthetic recruiter conversation and master resume; inspect progress and plan approval through the API.
2. Approve; run research and drafting in the task container; obtain sourced brief, revised resume, message draft, and final review request.
3. Request changes, edit an input, and show new artifact versions plus invalidation of the old approval.
4. Restart API, manager, and task worker at different points; retain inputs, progress, pending interactions, and artifacts, and resume correctly.
5. Send duplicate/conflicting approvals; exactly one effective transition occurs, and stale decisions cannot authorize modified material.
6. Kill a worker around artifact/action persistence; recover with no duplicate registered artifacts or reminder delivery.
7. Run two tasks concurrently; verify distinct workspaces and no simultaneous graph writers for either task.
8. Cancel during execution or while waiting; late events do not resume the task. Verify timeout/budget failures preserve inspectable partial results.
9. Advance a fake clock; fire a reminder with the approved document version. Restart before/after due time and test catch-up/deduplication.
10. Verify invalid paths/URLs are rejected, worker mounts/configuration match the declared boundary, and trace redaction excludes credentials and personal content.

Add a small offline agent evaluation suite covering missing inputs, unsupported resume claims, company-name ambiguity, conflicting job information, user revisions, source support, and completion. Separate deterministic lifecycle tests from probabilistic output-quality evaluation. Use assertion-based checks where possible; report the limitations of any LLM judge. Do not claim full factual/semantic validation from string checks alone.

Provide an opt-in real-provider smoke test and real adapter configuration. If credentials or Docker are unavailable, finish the code and available checks, clearly report which live validations remain unrun, and never label fixtures as a live success. Avoid spending significant API budget or using real personal data during verification.

## Deliverables and working method

Implement in vertical slices: API/storage -> sandboxed graph segment -> persisted interaction/resume -> edits/recovery -> artifacts/timer -> tracing/evals. Get one end-to-end flow running early. Explain consequential choices briefly; make routine choices autonomously.

Deliver source, migrations, dependency lockfile, task-worker Dockerfile, local database setup, .env.example with placeholders, deterministic fixtures, automated tests, and a synthetic end-to-end script. Include setup/run commands, API examples, state/approval diagrams, failure/recovery semantics, trace configuration, and a concise architecture note explaining control plane versus sandbox responsibilities.

Include a learning-oriented explanation of what LangChain, LangGraph, LangSmith, the database dispatcher, and Docker each provide, and which correctness responsibilities remain ours. Keep the implementation small enough to understand. No UI, multi-agent orchestration, cloud deployment, new RAG engine, automatic applications, or unrelated refactors.

Finish by reporting what works, exactly what was tested, known limitations, and the command sequence I can run locally to reproduce the entire approval/edit/restart/reminder flow.

## Official starting references

- LangChain tools: https://docs.langchain.com/oss/python/langchain/tools
- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph interrupts and replay considerations: https://docs.langchain.com/oss/python/langgraph/interrupts
- LangSmith observability: https://docs.langchain.com/langsmith/observability
- Docker isolation and daemon boundary: https://docs.docker.com/engine/security/
