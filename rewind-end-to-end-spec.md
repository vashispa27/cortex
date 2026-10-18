# Rewind-style desktop memory assistant
## Reverse-engineered product specification and end-to-end implementation plan

**Research date:** 16 October 2026  
**Scope:** macOS and Windows desktop product, local memory engine, inline writing, voice, chat, MCP, cloud services, distribution, and public website.  
**Status:** engineering specification for an independently implemented equivalent; no claim to possess Rewind’s source code.

## 1. Executive assessment

Rewind combines a continuously maintained personal memory with an assistant that can write into the application the user is already using. Its useful unit of interaction is a focused text field plus surrounding work context. The public documentation identifies operating-system accessibility text as the capture source and local storage as the memory boundary. It does not describe screenshot recording as the underlying mechanism. [Product introduction](https://docs.rewind.sh/)

The implementation proposed here has five cooperating components:

1. A native platform adapter reads permitted foreground UI text and safely edits supported fields.
2. A local daemon stores sanitized observations, tracks activity, maintains derived memory, and serves retrieval.
3. A desktop shell provides the assistant panel, inline overlay, settings, onboarding, and optional animated pet.
4. A local MCP bridge lets approved AI clients retrieve memory.
5. A small cloud control plane authenticates accounts, enforces entitlements, routes selected inference requests, and distributes signed releases.

**Build priority:** prove capture and insertion reliability first; then memory quality; then proactive behavior and visual polish. A convincing web demo is much easier than dependable operation across real desktop applications.

### Evidence labels

- **OBSERVED:** inspected in the public website’s rendered UI or computed styles.
- **DOCUMENTED:** stated by Rewind’s public documentation or policy; not independently verified in the desktop binary.
- **LOCAL CONTRACT:** described by the installed Rewind integration guide; no private memory records were accessed.
- **PROPOSED:** an engineering decision for this implementation, not a claim about Rewind internals.
- **UNKNOWN:** not established by the available evidence.

All architecture, algorithms, thresholds, schemas, sample APIs, estimates, and acceptance targets below are **PROPOSED unless expressly labeled otherwise**. The distinction is important: a public feature description does not establish its private implementation.

## 2. Evidence ledger and product boundaries

| Area | Established behavior | Evidence |
|---|---|---|
| Capture | DOCUMENTED: reads foreground accessibility text on macOS and Windows; no screenshot or screen-recording pipeline | [Introduction](https://docs.rewind.sh/) |
| Inline writing | DOCUMENTED: a key can transform an instruction, rewrite a selection, infer a reply in an empty field, or answer a `/g` request | [Rewind key](https://docs.rewind.sh/guides/the-rewind-key/) |
| Editing | DOCUMENTED: hold or double-tap opens iterative editing with typed or spoken instructions | [Edit mode](https://docs.rewind.sh/guides/edit-mode/) |
| Speech | DOCUMENTED: hold-to-dictate, release to insert, and hands-free gestures | [Voice dictation](https://docs.rewind.sh/guides/voice-dictation/) |
| Chat | DOCUMENTED: movable edge panel, memory questions, reminders, briefs, nudges, and desktop pet | [Chat](https://docs.rewind.sh/guides/chat/) |
| Local memory | DOCUMENTED: local SQLite plus related files; selected context is sent for AI processing | [Privacy policy](https://rewind.sh/privacy) |
| Cloud route | DOCUMENTED: Cloudflare routes requests to a private Azure OpenAI deployment; the vendor states zero retention | [Privacy policy](https://rewind.sh/privacy) |
| Privacy controls | DOCUMENTED: pause, exclusion rules, secret masking, protected-field avoidance, local token protection, deletion | [Privacy guide](https://docs.rewind.sh/privacy/) |
| Personalization | DOCUMENTED: editable identity and browsable entity wiki | [Settings](https://docs.rewind.sh/reference/settings/) |
| External assistants | DOCUMENTED: local stdio MCP executable and supported-client registration | [MCP guide](https://docs.rewind.sh/guides/ai-clients/) |
| Packaging | DOCUMENTED: universal macOS app, Windows x64, separate helper, login startup, automatic updates | [Managed installations](https://docs.rewind.sh/get-started/managed-installations/) |
| Enterprise policy | DOCUMENTED: managed capture exclusions and auto-update policy on macOS | [MDM](https://docs.rewind.sh/get-started/configure-with-mdm/) |
| Website | OBSERVED: serif hero, orange emphasis, two download buttons, privacy popover, three demo tabs, testimonials, FAQ | [Homepage](https://rewind.sh/) |

### What is not established

Exact native languages, desktop framework, schema, chunking, embedding model, ranking formula, prompts, model versions, provider agreement details, measured latency, battery consumption, supported OS minimums, and app-by-app success rates remain unknown. Tauri, Rust, vector retrieval, and the database design in this spec are recommendations, not discoveries.

The FAQ remains Mac-centric while newer installation material covers Windows. The website advertises free beta access, while settings documentation describes Free, Pro, and Founding-member states. Make entitlement and pricing copy configuration-driven; do not invent current prices or limits. [FAQ](https://rewind.sh/faq), [Settings](https://docs.rewind.sh/reference/settings/)

The blog describes possible future anticipation and action-taking. Do not treat speculative calendar booking or autonomous outreach as verified shipped functionality. [Product-direction essay](https://rewind.sh/blog/the-prediction-machine)

### Explicit scope choices

The first release is a single-user, single-device application. Cross-device sync, whole-mailbox ingestion, browser-history imports, screenshots/OCR, meeting recording, autonomous message sending, and arbitrary computer control are outside this baseline. Later additions require separate data-flow and product specifications. Seen-on-screen messages are observations, not an authoritative email or calendar integration.

## 3. Product requirements and journeys

### 3.1 Onboarding

DOCUMENTED: sign-in supports Google or email/password; macOS needs Accessibility, and microphone access is relevant to dictation. The tutorial teaches a rewrite in a real input field. [Installation](https://docs.rewind.sh/get-started/installation/), [Tutorial](https://docs.rewind.sh/get-started/tutorial/)

Proposed sequence:

1. Open a signed installer; launch the application.
2. Explain foreground capture, local storage, and the separate cloud-inference boundary in plain language.
3. Sign in using the system browser and a validated callback.
4. Ask for capture consent, then guide the user through required OS permissions.
5. Show a live permission check and a harmless local sample demonstrating what can be read.
6. Offer pause and exclusion controls before capture begins.
7. Detect keyboard layout and let the user test their activation key in a sandboxed tutorial field.
8. Run a real draft generation; show cancellation and undo.
9. Offer microphone and MCP setup as separately explained capabilities.
10. Finish with capture status, memory age, and a first useful question.

Store onboarding progress per step. Restarting should resume rather than duplicate enrollment. A user who declines microphone access can still use text features. A user who revokes Accessibility sees a clear degraded state with no repeated permission spam.

### 3.2 Inline writing

DOCUMENTED: field contents determine the operation; selected text scopes the edit; an empty input triggers context-sensitive drafting; `/g` invokes a direct answer. The documented busy indicator is a fish near the caret, and cancellation is available before replacement. [Rewind key](https://docs.rewind.sh/guides/the-rewind-key/)

Proposed decision order:

| Condition at activation | Operation | Replacement scope |
|---|---|---|
| Valid nonempty selection | Rewrite selection using surrounding context | Selection only |
| No selection; input begins with `/g` | Answer direct request | Existing request text |
| No selection; nonempty input | Interpret as writing instruction or draft | Captured input range |
| No selection; empty input | Draft likely response | Empty insertion range |
| Read-only, secure, inaccessible, or unsupported input | Explain limitation and offer assistant panel | No insertion |

Preserve ambiguity: if the instruction cannot be safely resolved, return a draft or short clarification rather than inventing a commitment, price, date, or completed action. Generating text never submits a form or presses Send.

### 3.3 Edit mode

Keep the target application and field bound to the editing session. Each instruction uses the latest validated draft revision. Show the current operation, cancel, apply, and undo states. Keep edit history local with a short retention window. If the original field disappears, retain the generated draft in the panel and offer Copy.

A command bar can take focus while the target remains separately identified. Restoring focus is an explicit platform operation; it must not rely on the current active window happening to be correct.

### 3.4 Memory chat

Support these intent classes: recent activity, date-range reconstruction, factual recall, entity lookup, time spent, commitments, and product help. Answers should carry expandable evidence links with app, title, observed time, and the actual stored text excerpt. Product help retrieves a version-matched bundled manual and current settings, keeping that corpus distinct from personal memory.

If the archive has no evidence, say so. Missing capture, private browsing, or an excluded app must never be represented as proof that an event did not occur.

### 3.5 Voice

Implement push-to-talk and latched recording. A clear indicator shows when audio is being collected. Stop recording on cancellation, session lock, device loss, or the configured duration limit. Offer the recognized transcript for recovery when an editing action fails. Never silently restart the microphone after a crash.

DOCUMENTED gestures include double-tap or a left-Control combination for hands-free use. The docs’ wording about “sending” text does not establish whether this means submitting to the recognizer or sending a message in the destination app. For this implementation, finishing dictation inserts text only; external submission remains a separate user action. [Voice dictation](https://docs.rewind.sh/guides/voice-dictation/)

### 3.6 Settings and memory management

Use these product areas: Account; Capture and Privacy; Shortcuts; Voice; Appearance; Memory; Identity; Notifications; Connected AI Apps; Diagnostics; Updates. Show effective settings and their source when organization policy applies.

DOCUMENTED settings include text scaling, edge placement, hover opening, identity editing, entity-type filters, proactive-message control, and integration configuration. The source’s navigation terminology varies between separate shortcut pages and a consolidated page; choose one consistent information architecture. [Settings](https://docs.rewind.sh/reference/settings/)

Add implementation-specific controls for retention period, disk budget, background inference, evidence inspection, and export. These are proposed additions, not verified parity requirements.

## 4. Architecture and technology decisions

```text
                  USER DEVICE — private memory boundary
 ┌─────────────────────────────────────────────────────────────────────┐
 │ OS foreground window                                                │
 │       ↓                                                             │
 │ macOS AX adapter / Windows UI Automation adapter                     │
 │       ↓ excluded? secure? permitted?                                 │
 │ bounded text extraction → normalization → redaction → deduplication │
 │       ↓                                                             │
 │ LOCAL DAEMON                                                        │
 │  SQLite + FTS ← observations, activity segments, source links         │
 │       ↑          ↓                                                  │
 │  retrieval ← summaries, entities, identity, commitments              │
 │       ↑                                                             │
 │ desktop shell / inline editor / scheduler / local MCP bridge         │
 │       ↓                                     ↕                       │
 │ validated insertion                 approved external AI client     │
 └───────────────────────┬─────────────────────────────────────────────┘
                         │ selected task context, TLS
                  CLOUD INFERENCE BOUNDARY
                         ↓
             auth + quota + inference gateway
                         ↓
                  contracted AI provider
                         ↓
                result returned to device
```

The external MCP client is a separate trust boundary: once it retrieves memory, its own processing and retention rules apply. Local transport alone cannot make downstream AI processing local. [Rewind MCP privacy explanation](https://docs.rewind.sh/guides/ai-clients/)

### Recommended stack

| Layer | Choice | Rationale / qualification |
|---|---|---|
| Desktop UI | Tauri 2 + React + TypeScript | Shared settings/chat UI; native platform features remain custom |
| Local daemon | Rust, asynchronous runtime, explicit worker pools | Bounded concurrency and a portable local service |
| macOS adapter | Swift/Objective-C bridge to public Accessibility APIs and AppKit | Native accessibility objects, permission state, overlay behavior |
| Windows adapter | Rust Windows bindings or a small C++ COM adapter | UI Automation, native windows, event hooks |
| Local database | SQLite, FTS5, migrations; WAL with controlled checkpoints | One authoritative writer; concurrent readers |
| Semantic retrieval | Optional local embedding model plus a versioned local vector index | Add only after measured improvement over lexical retrieval |
| MCP bridge | Small signed executable using a maintained MCP SDK | Subprocess lifecycle and standard transport handling |
| Cloud gateway | TypeScript on Cloudflare Workers, or equivalent stateless service | Matches the documented routing topology without requiring identical internals |
| Cloud metadata | Managed PostgreSQL | Accounts, devices, subscriptions, usage ledgers; no personal archive |
| Website/docs | Static Astro site plus Markdown content | Small public surface, fast pages, simple deployment |
| Releases | Object storage/CDN plus signed manifest | Immutable artifacts and staged rollout |

Tauri supports a web frontend with native application functionality; it is a candidate implementation framework, not evidence of Rewind’s own framework. [Tauri documentation](https://v2.tauri.app/start/)

### Process and privilege separation

The daemon is the sole database writer. The shell sends typed commands and receives events through authenticated IPC. Native capture runs in a restartable worker so an unresponsive accessibility provider does not block chat or corrupt storage. The MCP bridge calls read-oriented daemon methods rather than opening the database directly.

The renderer never receives arbitrary filesystem, shell, or SQL access. It cannot choose arbitrary inference endpoints. Load bundled UI only, enforce a strict content security policy, and open external links in the system browser. Use a per-user background session process, not a privileged system service.

### Repository layout

```text
apps/desktop/          # React/Tauri shell and native overlays
apps/website/          # landing page, FAQ, blog, legal, download UI
apps/docs/             # implementation and user documentation
crates/daemon/         # service lifecycle, command handling
crates/capture/        # policy, normalization, redaction, ingest
crates/platform-mac/   # AX, key events, text insertion, overlays
crates/platform-win/   # UIA, key events, text insertion, overlays
crates/memory/         # schema, FTS, retrieval, derivation
crates/mcp/            # local bridge and tools
crates/contracts/      # versioned requests, errors, events
services/gateway/      # auth enforcement, inference routing
services/control/      # device/account/entitlement metadata
packages/prompts/      # versioned tasks and structured outputs
tests/fixtures/        # synthetic UI trees and memory histories
tests/compatibility/   # platform/app regression harness
infra/                 # deployments and release pipeline
```

## 5. Capture engine

### 5.1 Platform abstraction

Expose a narrow native interface:

```ts
interface PlatformAdapter {
  permissionState(): PermissionState;
  foreground(): WindowRef | null;
  subscribe(onEvent: (event: UIEvent) => void): Disposable;
  readWindow(ref: WindowRef, budget: ReadBudget): CaptureResult;
  focusedEditable(): FocusTarget | null;
  readTarget(target: FocusTarget): TargetRevision;
  applyEdit(target: FocusTarget, expected: TargetRevision, edit: TextEdit): ApplyResult;
  caretBounds(target: FocusTarget): Rect | null;
  idleMilliseconds(): number;
  sessionState(): "active" | "locked" | "asleep";
}
```

macOS: use `AXUIElement` for hierarchy, attributes, geometry, and supported actions, with observer notifications where available. Query attribute availability and writable status; never assume every application exposes the same tree. [Apple Accessibility API](https://developer.apple.com/documentation/applicationservices/axuielement)

Windows: use UI Automation focus events and supported control patterns. Use text patterns for extraction and selection, and supported value/edit mechanisms for insertion. TextPattern alone is not a general text-writing API. Handle process integrity boundaries without elevating the entire assistant. [Microsoft control patterns](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-controlpatternsoverview)

### 5.2 Capture scheduling and bounds

Initial tunables, subject to profiling:

| Parameter | Starting value |
|---|---:|
| Event debounce | 400 ms |
| Fallback poll while active | 3 seconds |
| Minimum meaningful dwell | 750 ms |
| Maximum nodes per traversal | 5,000 |
| Maximum traversal depth | 40 |
| Soft traversal time budget | 150 ms |
| Worker watchdog | 1 second |
| Maximum extracted text per snapshot | 128 KiB UTF-8 |
| Idle threshold for stopping accrual | 60 seconds |

Queue only the most recent pending request per window. A provider call may outlive a cooperative deadline; isolate it in a worker with bounded restart/backoff. Mark truncation and extraction gaps explicitly. Never repeatedly crash-loop a problematic application.

### 5.3 Pipeline ordering

1. Check session state, capture consent, pause state, and effective organization policy.
2. Resolve app identity and the smallest metadata needed to evaluate exclusions.
3. Reject excluded apps, domains, windows, and known private browsing contexts.
4. Read the permitted foreground window’s exposed text and focus breadcrumb.
5. Drop secure controls before reading their values; stop traversal into excluded subtrees.
6. Normalize line endings, duplicate accessibility nodes, and unstable UI decorations conservatively.
7. Redact secrets from text, title, URL, and any persisted metadata.
8. Compute hashes over sanitized data only.
9. Persist content and a separate observation/activity event transactionally.
10. Queue index updates and derived-memory work after commit.

Browser accessibility can expose off-screen or virtualized content. Record the extraction scope and provider limitations; do not label all exposed text as visually read by the user. Prefer visible/intersecting nodes where reliable, and identify incomplete coverage.

If a browser URL or private-window state cannot be established, apply a documented policy. The safer default is to skip ambiguous contexts whose exclusion status cannot be determined; do not interpret detection failure as permission.

### 5.4 Snapshot record

Retain: opaque ID; first observation; app ID; window session ID; sanitized title/URL; sanitized text; language; extraction quality; truncation flag; focus role/name/path; capture adapter version; redaction version; normalized content hash.

Do not store keystroke streams, password values, screenshots, entire clipboard histories, or hidden-window contents. A clipboard read required for a supported insertion fallback is a temporary operation, not permission to archive the clipboard.

### 5.5 Deduplication and time

Separate content from observations. Identical text can reappear after a long gap. Reusing a content record is fine; representing the interval between its first and last sighting as continuous work is not.

Use exact sanitized hashes first. Near-duplicate grouping may cluster similar versions for retrieval but must not erase changed amounts, recipients, decisions, or negations. Preserve original sanitized versions. Track foreground activity as non-overlapping segments independent of snapshot deduplication.

## 6. Privacy, deletion, and security requirements

DOCUMENTED baseline: Rewind describes local masking, excluded sensitive contexts, capture pause, and authenticated local connections. Its policy also states that some direct user submissions are sent as entered and that pattern masking is imperfect. [Privacy guide](https://docs.rewind.sh/privacy/)

This implementation should provide a stronger explicit contract:

- Mask before every persistence or background egress boundary, including derived output and diagnostics.
- Use structural protected-control flags first, format-aware patterns second, and entropy heuristics only with context to limit false positives.
- Detect API tokens, private keys, connection strings, credential-bearing URLs, payment identifiers, and known secret formats. Use checksums where applicable.
- Do not promise universal secret detection. Let users exclude whole apps and domains.
- Distinguish capture consent from background cloud inference and from MCP access. Each can be disabled independently.
- Keep account tokens in Keychain or Windows Credential Manager. Use restrictive per-user file permissions.
- Use full-disk encryption as an OS baseline. If adding encrypted SQLite, include key lifecycle, rekey, recovery, and migration tests; never imply that local storage automatically means application-level encryption.

### 6.1 Local API protection

Prefer Unix-domain sockets on macOS and named pipes with per-user ACLs on Windows for internal IPC. If HTTP is exposed for compatibility, bind loopback explicitly, require a random per-install bearer token, validate Host and Origin, deny wildcard CORS, cap request bodies, and authenticate WebSocket upgrades. Refuse remote listeners. Health output must not reveal memory or credentials.

A same-user malicious process can often read local files or act with equivalent privileges. The token reduces accidental exposure and browser-origin attacks; it is not a sandbox against all software running as that user.

### 6.2 Prompt injection and authority

Captured pages, messages, documents, and tool results are untrusted evidence. The model must not treat their text as instructions. Separate evidence from commands in the request schema. Tool execution uses application policy and explicit user intent, not instructions found inside retrieved memory.

Maintain distinct tool sets: retrieval; local preference changes; local scheduled jobs; external actions. Baseline generation has no external-action tools. Deletion and integration changes use UI-confirmed commands, not unconstrained model calls.

### 6.3 Deletion and retention

A deletion operation must first stop capture and workers, advance a memory-generation epoch, cancel in-flight requests, and reject results from the old epoch. Then delete source records and all dependents: FTS, vectors, summaries, wiki facts, profile examples, drafts, audio, caches, job payloads, and diagnostic attachments.

For selective deletion, maintain source-to-derived dependency edges. Recompute surviving summaries using retained sources. Do not preserve a deleted fact because it was copied into a higher-level summary.

SQLite WAL and temporary files matter. Use SQLite’s supported checkpoint and close procedures; never delete an active WAL independently. Secure deletion on SSDs and user-controlled backups cannot be guaranteed by ordinary row deletion. Encrypted storage plus key destruction can improve whole-store deletion semantics, provided the key is not retained elsewhere. [SQLite WAL documentation](https://www.sqlite.org/wal.html)

Offer a deletion receipt listing affected categories and any external account records handled separately. Exclusions apply prospectively unless the user explicitly chooses to remove matching historical records.

## 7. Local data model

Use UTC timestamps for ordering, with IANA timezone and local date retained where user-calendar interpretation matters. Use a monotonic clock for elapsed active time. All text fields below contain sanitized data. Enable foreign keys on every connection.

### 7.1 Core schema

The following is an illustrative, executable baseline migration. Production adds migration bookkeeping, database encryption if selected, and the auxiliary tables listed afterward.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  window_session_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  body TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  focused_role TEXT,
  focused_name TEXT,
  focused_path TEXT,
  extraction_quality TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0,1)),
  redaction_version INTEGER NOT NULL,
  CHECK(last_seen_ms >= first_seen_ms),
  UNIQUE(app_id, window_session_id, content_hash)
);
CREATE INDEX snapshots_time ON snapshots(last_seen_ms DESC);
CREATE INDEX snapshots_app_time ON snapshots(app_id, last_seen_ms DESC);

CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  observed_ms INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  focus_fingerprint TEXT,
  source_event TEXT NOT NULL
);
CREATE INDEX observations_time ON observations(observed_ms);
CREATE INDEX observations_snapshot ON observations(snapshot_id, observed_ms);

CREATE TABLE activity_segments (
  id INTEGER PRIMARY KEY,
  app_id TEXT NOT NULL,
  window_session_id TEXT NOT NULL,
  started_ms INTEGER NOT NULL,
  ended_ms INTEGER NOT NULL,
  active_ms INTEGER NOT NULL,
  project_id TEXT,
  assignment_source TEXT,
  confidence REAL,
  CHECK(ended_ms >= started_ms),
  CHECK(active_ms >= 0 AND active_ms <= ended_ms - started_ms)
);
CREATE INDEX activity_time ON activity_segments(started_ms, ended_ms);

CREATE VIRTUAL TABLE snapshots_fts USING fts5(
  title, body, content='snapshots', content_rowid='id',
  tokenize='unicode61'
);
CREATE TRIGGER snapshots_ai AFTER INSERT ON snapshots BEGIN
  INSERT INTO snapshots_fts(rowid,title,body)
  VALUES(new.id,new.title,new.body);
END;
CREATE TRIGGER snapshots_ad AFTER DELETE ON snapshots BEGIN
  INSERT INTO snapshots_fts(snapshots_fts,rowid,title,body)
  VALUES('delete',old.id,old.title,old.body);
END;
CREATE TRIGGER snapshots_au AFTER UPDATE OF title,body ON snapshots BEGIN
  INSERT INTO snapshots_fts(snapshots_fts,rowid,title,body)
  VALUES('delete',old.id,old.title,old.body);
  INSERT INTO snapshots_fts(rowid,title,body)
  VALUES(new.id,new.title,new.body);
END;

CREATE TABLE derived_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  source_watermark_ms INTEGER NOT NULL,
  prompt_version TEXT,
  model_version TEXT,
  status TEXT NOT NULL CHECK(status IN ('valid','stale','rebuilding')),
  UNIQUE(kind,logical_key,revision)
);
CREATE TABLE derived_sources (
  derived_id TEXT NOT NULL REFERENCES derived_items(id) ON DELETE CASCADE,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  PRIMARY KEY(derived_id,snapshot_id)
);
CREATE TABLE derived_dependencies (
  parent_id TEXT NOT NULL REFERENCES derived_items(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES derived_items(id) ON DELETE CASCADE,
  PRIMARY KEY(parent_id,child_id),
  CHECK(parent_id <> child_id)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  run_after_ms INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  lease_until_ms INTEGER,
  memory_epoch INTEGER NOT NULL,
  last_error_code TEXT
);
CREATE INDEX jobs_due ON jobs(state,run_after_ms);
```

FTS5 supplies local lexical retrieval; index consistency is part of the write transaction. If indexing an existing database, explicitly rebuild the FTS table after migration. Choose tokenizer settings against multilingual test data rather than assuming English word boundaries work universally. [SQLite FTS5](https://www.sqlite.org/fts5.html)

### 7.2 Additional tables and invariants

| Table | Essential fields / invariant |
|---|---|
| `chunks` | ID, snapshot ID, character offsets, sanitized text hash; offsets refer to immutable stored text |
| `embeddings` | chunk ID, model ID, dimensions, vector, index version; never mix incompatible models |
| `entities` | ID, type, canonical label, aliases, user overrides; duplicate-name entities remain separable |
| `entity_facts` | entity ID, fact, validity interval, confidence, derived item ID; allow contradictions |
| `entity_edges` | source entity, relation, target entity, evidence; no unsupported inferred relationships |
| `identity_versions` | user-authored profile, inferred suggestions, version, accepted status |
| `commitments` | actor, action, subject, due time/timezone, state, evidence, confidence |
| `conversation_messages` | local thread ID, role, content, evidence refs, generation epoch |
| `rewrite_sessions` | target fingerprint, revision, operation, result status; short retention |
| `schedules` | timezone, schedule expression, misfire policy, enabled, next occurrence |
| `schedule_runs` | schedule ID + occurrence unique key, state, output message ID |
| `settings` | typed key/value, source, version, changed time |
| `exclusions` | app/domain/window matcher, origin, enabled; organization rules cannot be removed locally |
| `integration_receipts` | client, path, inserted entry hash, backup reference, user-removal marker |
| `privacy_events` | operation, category, timestamp, counts; no content |

Before deleting a source, mark dependent derived items stale in the same transaction; then cascade source links. Rebuilders traverse dependency edges and must prevent cycles. Store user corrections separately so a summary refresh cannot erase them.

### 7.3 Capacity model

Illustrative workload, not a measured Rewind figure: 8 active hours/day, 3-second sampling, 25% unique content, 6 KiB per unique snapshot gives 9,600 observations and about 2,400 distinct snapshots/day. Raw text is approximately 14 MiB/day, or 1.3 GiB over 90 days. FTS, versions, metadata, and embeddings can make the total several GiB.

Set a configurable retention horizon and disk cap. Estimate future size from measured rolling averages. When near the cap, stop optional embedding work, compact supported indexes, and apply the stated retention policy. Never silently drop recent source evidence while keeping answers that imply it is still available.

## 8. Memory construction and retrieval

### 8.1 Memory layers

LOCAL CONTRACT: the installed integration guide describes recent activity, full recent working memory, deduplicated snapshots, hour/day/week/month/year chronicles, an entity wiki, time reports, attention context, and promises. It warns that summaries and search snippets are not full evidence and distinguishes capture time from later sightings. This is documentation evidence only; implementation and live tool schemas were not interrogated.

Proposed layers:

| Layer | Content | Update policy |
|---|---|---|
| Immediate context | Focused field and foreground window | On request, bounded live read |
| Recent activity | Ordered observations and activity segments | Continuous local ingestion |
| Working memory | Recent meaningful context, capped by tokens | Incremental, mostly deterministic |
| Search archive | Immutable sanitized source versions | Transactional FTS updates |
| Chronicles | Evidence-linked period summaries | Closed periods plus incremental current-period refresh |
| Entity wiki | People, projects, topics, tools, organizations | Incremental extraction and conflict resolution |
| Identity | Explicit preferences plus supported style examples | User edits immediately; periodic suggestions |
| Commitments | Candidate obligations and status evidence | Event-driven extraction and user review |

### 8.2 Derivation jobs

Use leased, idempotent jobs. Retry transient errors with jitter; classify authentication and quota errors as blocked work rather than repeatedly spending requests. Background jobs are lower priority than user requests and can be deferred on battery or poor connectivity.

Summarize deltas and meaningful sessions, not every polling sample. A one-minute page visit should not generate dozens of cloud requests. Store source IDs, extraction confidence, prompt version, model deployment version, and source watermark with every output.

For hierarchical summaries, retain transitive provenance. A month-level answer must be able to reach underlying source text when an exact fact needs verification. Older summary availability is not equivalent to older verbatim-source availability.

### 8.3 Entity resolution

Extract typed candidates, normalize aliases, and link facts to evidence. Merge only when multiple identifiers agree or the user confirms. Two people named Alex remain separate without reliable evidence. Preserve negative statements, dates, and uncertainty. A wiki page is a generated view over facts and corrections, not the sole source of truth.

### 8.4 Learning writing style

Use explicit preferences first. Additional style examples should have reasonable evidence of authorship: text produced in a known user-owned input, user-approved samples, or a verified sent-message identity. Reading another person’s message must not train the user’s style.

Represent style as editable properties: typical length, punctuation, greetings, formality, language, favored phrasing, emoji frequency, and recipient-specific conventions. Keep factual personal information separate from stylistic patterns. User-edited output can be feedback, but merely leaving generated text on screen is weak evidence of acceptance and no proof that it was sent.

### 8.5 Retrieval algorithm

1. Resolve intent and time expressions using the user’s timezone.
2. Retrieve immediate context and explicit user preferences, when relevant.
3. Search FTS by normalized terms, aliases, app, and date range.
4. Optionally search a local vector index for paraphrases.
5. Merge candidate lists using reciprocal-rank fusion; initial constant `k = 60`.
6. Add small boosts for matching active project, recipient, and recency, without burying older exact matches.
7. Deduplicate near-identical chunks and enforce diversity across source sessions.
8. Fetch actual source text for high-value candidates.
9. Build a bounded context pack and generate an answer with source IDs.
10. Validate cited IDs and reject citations outside the retrieved set.

Starting context budget: 1,500 tokens of identity/preferences, 4,000 immediate context, 6,000 retrieved sources, and 2,000 relevant summary context, plus task instructions and output allowance. These are adjustable caps; do not fill them merely because room exists.

Every source is wrapped with app, observed time, capture quality, author attribution if known, and an “untrusted evidence” marker. Exact quotations and numeric answers use source text rather than a search snippet. Return uncertainty when sources conflict.

### 8.6 Time accounting

Integrate foreground-active segments. Close a segment on app/window switch, idle, lock, sleep, or permission loss. Avoid double counting overlapping windows or multiple monitors. Attribute a segment using explicit user rules first, then known domain/project mapping, then a model suggestion with confidence. Keep unassigned time visible.

Reports must say tracked foreground activity. They cannot establish all working time, meeting attendance, or a billable timesheet. Corrections change assignments while preserving the observed duration.

### 8.7 Commitments and attention

Extract `actor`, `action`, `recipient`, `due_at`, `timezone`, `evidence`, and `confidence`. Dates can be null. Use states `candidate → confirmed → in_progress → completed/dismissed`. A proposed draft does not complete a commitment. Completion needs explicit user input or affirmative source evidence.

Calendar/email information seen on screen is partial. Store “observed at” and freshness, never infer unseen cancellations or fabricate missing times. Show preparation suggestions as based on observed context.

## 9. Inline editing as a validated transaction

This is the highest-risk correctness path. Desktop accessibility providers do not generally offer an atomic cross-application compare-and-swap primitive. The design therefore uses best-effort precondition checks, adapter-specific operations, and conservative fallback. Do not advertise absolute atomicity.

### 9.1 State machine

```text
IDLE → KEY_PENDING → CLASSIFY → SNAPSHOT_TARGET → RETRIEVE → GENERATE
                                                               ↓
                   RESULT_IN_PANEL ← STALE/UNSUPPORTED ← REVALIDATE
                                                               ↓
                                                    APPLY → VERIFY
                                                               ↓
                                                   APPLIED / RECOVERY
```

Cancellation from any pre-apply state leads to `CANCELLED`, leaving the field untouched. A completed request is ignored if its request ID, target generation, or memory epoch is no longer current.

### 9.2 Target revision contract

```ts
type TargetRevision = {
  appId: string;
  processId: number;
  processStartedAt: number;
  windowSessionId: string;
  elementHandle: string;       // opaque, ephemeral, never blindly persisted
  elementFingerprint: string;
  fieldTextHash: string;
  selection: {start: number; end: number; unit: "utf16"};
  selectedTextHash: string;
  capturedAt: number;
};
```

Normalize platform string offsets carefully. Test emoji, combining marks, bidirectional text, and input-method composition. A UTF-16 offset is not a Unicode character count. Cancel if the selection or field changed in a way the adapter cannot reconcile safely.

Before applying, confirm application identity, process lifetime, window, target editability, secure-field status, content revision, and selection. On mismatch, keep the result in the assistant panel and let the user choose Copy or a new attempt.

### 9.3 Insertion strategies

| Strategy | Use | Failure policy |
|---|---|---|
| Native selected-text setter | Provider supports the exact range write | Re-read and verify |
| Native value setter | Plain text field and whole-value replacement is valid | Preserve expected surrounding content |
| Clipboard paste into verified range | Tested adapter; native setter unavailable | Preserve clipboard conditionally; never press Return |
| Assistant panel + Copy | Unsupported/rich/unstable input | No speculative keystrokes |

Clipboard fallback must snapshot available clipboard formats, paste only after focus validation, and restore the previous clipboard only if its change counter still matches the assistant’s write. Do not overwrite a clipboard the user updated meanwhile. Avoid fallback in terminals or command fields where pasted newlines might execute commands; use panel-only behavior there unless a dedicated safe adapter is proven.

After insertion, verify the expected plain-text change. If verification is inconclusive, report that state; do not repeatedly paste or blindly roll back. Undo is offered only if the target still matches the inserted revision. Preserve rich-text formatting through range-specific providers where possible; whole-field replacement of a rich editor is not an acceptable generic fallback.

### 9.4 Keyboard recognition

DOCUMENTED defaults are right Option on Mac, right Shift on Windows, right Command for Japanese Mac keyboards, and platform-specific fallback chords. The shortcut docs explicitly distinguish clean taps from ordinary modifier combinations. [Shortcuts](https://docs.rewind.sh/reference/shortcuts/)

Proposed recognition: track key-down/up, intervening non-modifier keys, hold duration, double-tap window, and composition state. Initial hold threshold: 350 ms; double-tap window: 250 ms. Delay tap dispatch enough to distinguish double-tap, or allow reversible prefetch without applying a first-tap result. Test layout switching, AltGr, capital typing, remote sessions, stuck keys, and key repeat. Global hooks must not become a key logger.

## 10. Voice pipeline

```text
gesture → permission check → audio device → bounded in-memory buffer
        → authenticated speech request → transcript
        → optional punctuation/cleanup → target revalidation → insert
```

Use the speech service’s supported encoding and sample rate through an adapter; resample only when necessary. Keep raw audio in memory where possible and delete temporary files after completion, cancellation, or crash recovery. Bound recording duration and upload size. Distinguish recording, uploading, transcribing, editing, and failed states.

When voice is an edit instruction, feed the transcript into the current edit session. When it is dictation, avoid rewriting its factual meaning. Provide a choice to copy the raw transcript if cleanup fails. On microphone disconnect, stop and preserve only the audio already explicitly captured for that operation.

## 11. Chat, reminders, and proactive behavior

### Desktop surfaces

Implement four independent windows/surfaces: collapsed edge handle; expanded chat; caret-relative edit overlay; settings. The pet is optional and should not own critical status. Respect safe areas, display scaling, menu bars, taskbars, fullscreen applications, and screen changes. Clamp placement to the visible work area when a monitor disconnects.

Use a keyboard-accessible alternative for every hover/drag operation. Provide reduced-motion mode, visible focus, text scaling, and a static busy state. Do not continually steal focus to display a nudge.

### Scheduler semantics

DOCUMENTED Rewind behavior includes morning and evening messages with specific wake catch-up windows, plus user-scheduled reminders and recurring prompts. [Chat guide](https://docs.rewind.sh/guides/chat/)

For parity, default morning brief to about 08:00 with a noon cutoff; evening wrap to about 16:00 with a midnight cutoff. Store timezone explicitly. On wake, evaluate whether today’s occurrence is still eligible. A device-only scheduler cannot deliver while the device is powered off.

Use `(schedule_id, intended_local_occurrence)` as a unique delivery key. Commit the notification record transactionally before display. Across retries, generate or deliver once per occurrence. Define daylight-saving policy: for a nonexistent local time use the next valid time; for repeated local times use the first occurrence. Test timezone travel separately from DST.

For interval checks, use monotonic elapsed time while awake and a stated catch-up policy after sleep. User-scheduled reminders and inferred nudges should be distinguishable in the UI and independently controllable.

### Nudges

Require a specific evidence-backed reason, novelty, and freshness. Start with a maximum of three proactive nudges/day, a two-hour cooldown, quiet hours, and per-topic suppression after dismissal. These are proposed limits, not measured Rewind defaults. Avoid sensitive content in lock-screen notifications. Persist an inbox item when live delivery is suppressed.

Briefs should summarize confirmed activity and open items. Repeated workflow detection can suggest a shortcut or reusable prompt; baseline behavior does not execute the workflow automatically.

## 12. Local API and MCP

### 12.1 Compatibility evidence

LOCAL CONTRACT: the installed guide documents a daemon normally at `127.0.0.1:3333`, an effective-port file, a per-install token file, and a health response that identifies the service. It lists `/search`, `/snapshots`, `/working-memory`, `/recent-activity`, `/chronicle`, wiki routes, time routes, `/promises`, and `/attention`. These were read as static documentation only. Do not assume parameter or response compatibility without testing the actual version’s published schema.

The public docs establish a local `rewind-mcp` executable, stdio configuration, supported-client discovery, and removal/reconnect behavior. [MCP integration guide](https://docs.rewind.sh/guides/ai-clients/)

### 12.2 Proposed versioned API

| Method / route | Purpose | Key inputs |
|---|---|---|
| `GET /v1/health` | Minimal liveness/version | None; no memory metadata |
| `GET /v1/status` | Permissions, capture, indexing state | Authenticated |
| `POST /v1/memory/search` | Search and filter | Query, time range, app IDs, cursor, limit |
| `POST /v1/memory/snapshots` | Retrieve cited source text | IDs; total-byte cap |
| `GET /v1/memory/recent` | Recent ordered context | Since, limit |
| `GET /v1/memory/chronicles` | Period summaries | Level, period, timezone |
| `GET /v1/wiki/search` | Entity lookup | Query, type, cursor |
| `GET /v1/wiki/pages/{id}` | Facts, narrative, evidence | Stable ID |
| `GET /v1/time/report` | Activity aggregation | From, to, timezone, group |
| `GET /v1/commitments` | Obligations and evidence | Status, subject, cursor |
| `POST /v1/chat/runs` | Start streamed answer | Message, thread ID, client request ID |
| `POST /v1/rewrite/runs` | Start a bound rewrite | Target ticket, operation, instruction |
| `POST /v1/runs/{id}/cancel` | Idempotent cancellation | Request ID |
| `PATCH /v1/settings` | Typed settings update | Expected version, changed fields |
| `POST /v1/capture/pause` | Pause/resume | Duration or indefinite |
| `POST /v1/privacy/delete` | Confirmed deletion | Scope, confirmation nonce, epoch |

Use POST for search when avoiding query text in URL logs. The UI should receive a privileged opaque target ticket, not be able to submit arbitrary native handles. Retrieval scopes and mutation scopes are distinct.

```json
{
  "request_id": "req_opaque",
  "data": {
    "results": [{
      "snapshot_id": 412,
      "observed_at": "2026-10-16T08:25:00Z",
      "app": "Example Mail",
      "title": "Launch review",
      "excerpt": "Review moved to Thursday…",
      "evidence_available": true,
      "truncated": false
    }],
    "next_cursor": null,
    "coverage": {"state": "partial", "reason": "capture_paused_in_range"}
  }
}
```

All sample data is synthetic. Treat result limits as maximums, not promises of completeness. Use stable opaque cursors and a total response-size cap.

Errors: `PERMISSION_REQUIRED`, `CAPTURE_PAUSED`, `TARGET_STALE`, `TARGET_UNSUPPORTED`, `NO_EVIDENCE`, `AUTH_EXPIRED`, `RATE_LIMITED`, `MODEL_UNAVAILABLE`, `INDEX_REBUILDING`, `DISK_FULL`, and `CANCELLED`. Include retryability and a user-facing recovery action without leaking source text into logs.

### 12.3 MCP tool surface

Expose read-only tools initially:

```text
search_memory(query, from?, to?, apps?, limit?, cursor?)
get_snapshots(ids)
get_recent_activity(minutes?, limit?)
get_working_memory(limit?)
get_chronicle(level, period, timezone?)
search_wiki(query, type?, limit?)
get_wiki_page(id)
get_time_report(from, to, timezone, group_by?)
get_promises(query?, include_closed?)
get_attention_context(query?, limit?)
```

Use JSON Schema, explicit response limits, evidence references, and tool descriptions that warn about partial screen coverage. Reserve stdout for protocol messages and stderr for sanitized diagnostics. Negotiate the protocol version through the SDK; do not silently implement a changing draft specification. [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

### 12.4 Client registration

Present discovered clients and the memory scope they will receive. After consent, parse each supported configuration format, preserve unknown fields/comments where supported, write a backup, merge only the owned entry, and replace atomically. If safe parsing is unavailable, offer manual setup. Never replace a whole configuration file with a template.

Record installation receipts. Respect intentional user removal. Disabling integration removes only unchanged entries owned by this application. A helper can start the daemon on first use, but it must still respect pause, permissions, and consent. Avoid tokens in command-line arguments or generated MCP configuration.

## 13. Cloud services, inference, and account lifecycle

### 13.1 Boundary

The cloud stores account/device identity, entitlements, consent versions, usage totals, release metadata, and operational events. It does not store the personal memory corpus. Selected request text still crosses the network. Disable request-body logging in the gateway, reverse proxy, exception reporting, tracing, and provider integrations.

Rewind’s policy names account, billing, telemetry, and email providers as well as its inference route. Those vendors are not necessary to reproduce the product. The zero-retention statement is a vendor claim about its arrangements, not a property automatically inherited by every Azure deployment. Validate the chosen deployment’s actual contracts, features, and diagnostics before making the same promise. [Privacy policy](https://rewind.sh/privacy)

### 13.2 Authentication

Use browser-based OAuth/OIDC with PKCE and state validation. Store refresh credentials in the OS secret store, rotate them, and identify each installation separately. Validate redirect destinations and bind callbacks to the originating login attempt. Never place provider inference keys in the desktop binary.

Separate local memory availability from cloud account state. Signing out should stop cloud requests and third-party integrations according to the user’s chosen policy; it should not silently erase local memory. Token expiry leaves local search usable. A switch to another account requires an explicit local-profile decision so one account never inherits another’s archive unnoticed.

### 13.3 Inference routes

```text
POST /v1/inference/rewrite
POST /v1/inference/answer
POST /v1/inference/extract
POST /v1/inference/summarize
POST /v1/inference/transcribe
GET  /v1/account/entitlements
POST /v1/devices/register
POST /v1/billing/checkout
POST /v1/billing/portal
POST /v1/billing/webhook
GET  /v1/releases/{channel}/{platform}
```

The gateway authenticates, validates schema, enforces payload/token/audio caps, reserves quota, calls an allowlisted provider deployment, streams output, and settles actual usage. Use an idempotency key for billable requests and a unique provider-event ID for billing webhooks. Cancel downstream inference when practical if the user cancels.

Return typed streaming events: `started`, `token`, `evidence`, `completed`, `error`, `cancelled`. Inline insertion waits for a completed validated result; chat can render partial output. Do not cache personal response bodies on shared infrastructure. Keep background job payloads on the device.

### 13.4 Model routing and prompts

Use a low-latency text deployment for inline work, a structured-output-capable economical deployment for extraction, a stronger answer model when needed, and a supported speech deployment for dictation. Exact model IDs are configuration, not hardcoded assumptions about the reference product.

Each prompt package includes a version, input schema, output schema, token cap, grounding rules, and regression cases. A rewrite response can include `replacement_text`, `evidence_ids`, and `uncertainties`; the insertion engine uses only the validated replacement. Schema validity does not establish factual correctness, so check grounded dates, names, amounts, and commitments separately.

### 13.5 Entitlements and economics

Keep plan features and limits in an entitlement service. A signed, short-lived cached entitlement supports brief outages without granting permanent access. Billing webhooks update entitlements transactionally and tolerate retries/out-of-order events. Avoid embedding beta pricing assumptions in the client.

Use an explicit cost model rather than an unsupported per-user price:

```text
monthly inference cost/user =
  Σ_task [(input_tokens_task / 1e6 × input_rate)
        + (output_tokens_task / 1e6 × output_rate)]
  + audio_minutes × transcription_rate
  + gateway + metadata + egress allocations
```

For an initial workload estimate, simulate 20 inline requests/day, 5 chat requests/day, session-based summarization, and a configurable speech allowance. Calculate with the provider’s contracted rates before launch. Background summarization is the main uncontrolled-volume risk: debounce, summarize deltas, cap daily spending, and prioritize explicit requests over maintenance.

## 14. Distribution, updates, and operations

DOCUMENTED reference behavior uses a universal macOS application and Windows x64 installer, a helper process, login startup, and periodic automatic updates. Public download endpoints redirect to release artifacts. The latest-manifest URL is documented, but its current contents could not be verified during this research. [Managed installation documentation](https://docs.rewind.sh/get-started/managed-installations/)

### Proposed release pipeline

1. Build macOS arm64/x64 and Windows x64 on appropriate runners.
2. Run unit, migration, security, and packaged integration tests.
3. Sign application and helpers consistently; notarize macOS packages and code-sign Windows artifacts.
4. Produce a software bill of materials and immutable checksum records.
5. Upload immutable installers and signed update metadata.
6. Roll out to internal, canary, then stable cohorts.
7. Download in the background; defer restart during dictation, active edits, or unfinished database migration.
8. Verify signature and hash before installing; reject mismatched or downgraded artifacts unless explicitly supported.
9. Recheck permissions, helper health, database version, and MCP launch paths after upgrade.

Do not copy Rewind’s bundle identifiers or signing identity. Use your own stable app/helper identifiers so permission grants survive legitimate updates.

Migrations must be transactional where possible and resumable where not. Back up using SQLite-supported mechanisms, with encryption and short retention, and expose that temporary copy in deletion policy. Old binaries must refuse schemas they cannot read. Rollback must not overwrite new user data with an old backup silently.

### Enterprise configuration

Support additive managed exclusions and auto-update control initially, matching the documented policy categories. Effective capture permission is the intersection of organizational allowance, user consent, and local rules; an organization cannot force capture of a user-excluded app. Show which restrictions are managed. [Rewind MDM guide](https://docs.rewind.sh/get-started/configure-with-mdm/)

### Diagnostics and resilience

Collect event names, durations, error categories, app-adapter category, version, and resource counts. Do not collect titles, URLs, prompts, clipboard content, audio, or retrieved excerpts. Crash dumps require content-aware handling because process memory may contain private text.

Expose local health states: running, paused, permission missing, indexing, offline, quota exhausted, storage full, and degraded adapter. Support user-reviewed diagnostic bundles with an inventory of included files. Test recovery from daemon crash, hung UI provider, network loss, corrupt index, revoked permission, and full disk.

## 15. Public website specification

### 15.1 Inspected reference

OBSERVED at approximately 1265 × 712 viewport: white background; black text; orange-red italic emphasis; a soft orange fish illustration; left-aligned wordmark in the header; navigation to FAQ, docs, blog, and downloads; a large centered hero and paired platform CTAs. Below it are a privacy popover, activity counter, demonstration area, company-logo strip, rotating quotations, FAQ accordion, closing CTA, and multi-column footer. [Homepage](https://rewind.sh/)

Computed styles from the rendered desktop page:

| Element | Measured value |
|---|---|
| Display family | `Caudex, Georgia, serif` |
| Body family | system sans-serif stack including Inter and Segoe UI |
| Hero font | 89.6 px, weight 400, line-height 91.392 px |
| FAQ heading | 44.8 px, weight 400, line-height 67.2 px |
| Closing CTA heading | 70.4 px, weight 400, line-height 73.216 px |
| Body background | `rgb(255,255,255)` |

These are viewport-specific measurements, not universal CSS constants. The three demonstration controls are real tab controls; selecting the memory tab changed selection, and a later observation showed the first tab selected again, suggesting automatic cycling. The privacy control expands a small explanatory panel. The demonstration’s underlying implementation was not established.

### 15.2 Proposed implementation

Create an original brand identity and artwork. Use the reference’s hierarchy and interaction pattern without copying its testimonials, company endorsements, live counter, legal promises, or proprietary assets.

```css
:root {
  --page-bg: #fff;
  --ink: #101010;
  --muted: #737373;
  --accent: #ff573b; /* proposed approximation, not measured */
  --rule: #e8e8e8;
  --content-max: 1120px;
}
.hero-title {
  font-family: "Caudex", Georgia, serif;
  font-weight: 400;
  font-size: clamp(44px, 7.1vw, 96px);
  line-height: 1.02;
  letter-spacing: -0.035em;
}
```

Desktop: centered hero, generous vertical whitespace, two CTAs on one row, framed product demo, restrained transitions. Mobile: 20–24 px side padding, stacked CTAs, a simplified navigation menu, readable tab controls, and no mascot overlap with text. Proposed breakpoints are 640 and 960 px; responsive behavior was not measured across devices in this inspection.

Build the demo as a deterministic state machine with synthetic data: draft in a message field; retrieve a source-backed answer; request context from another assistant. An HTML simulation gives accessible text and deliberate timing; a captioned video is simpler. Honor reduced motion, pause when off-screen, and let user interaction suspend auto-cycling.

Routes: `/`, `/faq`, `/blog`, `/blog/:slug`, `/privacy`, `/tos`, `/dpa`, docs, and platform download redirects. Use semantic headings, keyboard-operable accordions, visible focus, metadata, sitemap, and download tracking limited to content-free events. Privacy and legal copy must describe the actual shipped data flow.

Acceptance: no horizontal overflow at 360 px; no text occlusion at 200% zoom; downloadable artifacts match OS labels; all navigation works; no fabricated popularity metrics; demo clearly uses example content. Target good Core Web Vitals and validate under representative mobile-network conditions.

## 16. Quality targets and verification plan

All figures below are proposed release gates, not measured reference performance. Define the benchmark hardware, OS versions, app versions, network, memory corpus size, and measurement method before comparing runs.

### 16.1 Performance and reliability targets

| Metric | Initial target |
|---|---|
| Activation visual feedback | p95 ≤ 100 ms |
| Local lexical search over 1 million chunks | p95 ≤ 300 ms on benchmark laptop |
| Inline generation, ≤150 output tokens | p50 ≤ 2.5 s; p95 ≤ 6 s under defined network/model conditions |
| Local answer preparation before provider request | p95 ≤ 500 ms |
| Daemon memory, excluding renderer/model | ≤ 250 MiB steady state in baseline workload |
| Idle daemon CPU | Median < 1% of one core; no sustained polling spikes |
| Active capture CPU | Median < 3% of one core in representative apps |
| Supported-field insertion success | ≥ 99% in explicit supported-app test matrix |
| Destructive stale-target writes | Zero in release test suite; always a release blocker |
| Exact synthetic-secret leaks | Zero in covered fixtures across persistence and egress |
| Scheduled delivery duplicates | Zero for a single occurrence under crash/retry tests |

Battery impact needs a controlled A/B test with an eight-hour workload and renderer animation included. A CPU target alone does not establish acceptable energy use.

### 16.2 Compatibility matrix

Test macOS on Apple silicon and Intel where supported; Windows x64; minimum supported OS plus current versions. The minimum OS is a product decision to set after the native spike.

Application categories: browser plain inputs; contenteditable editors; Gmail/Outlook web; Slack/Teams-style apps; native mail; plain text editors; document editors; Electron apps; code editors; password managers; private browser windows; remote desktop; terminals; elevated Windows applications. Classify each as supported, read-only capture, excluded, or panel-only fallback.

Each supported app/version needs tests for selection, full-field replacement, empty draft, Unicode, rich formatting, focus change during inference, composition, window close/reopen, undo, screen scaling, and clipboard races. “Works anywhere” is not an engineering acceptance criterion.

### 16.3 Essential automated scenarios

1. A permission is revoked mid-read: stop capture; persist no subsequent text.
2. Excluded-domain detection fails: apply conservative policy and record a content-free gap.
3. A page contains a fake system instruction: it cannot change settings or trigger tools.
4. A secret appears in body, title, URL, generated summary, and error: no raw value persists or leaves through automatic processing.
5. Identical content appears Monday and Friday: no four-day activity segment is created.
6. A message is visible but authored by someone else: it is not a user-style example.
7. User types during generation: insertion is rejected as stale; draft remains recoverable.
8. User switches windows/process restarts: never insert into the new target.
9. Clipboard changes during paste: preserve the user’s newer clipboard.
10. Emoji and composed characters cross the selected range: untouched text remains byte-equivalent after normalization rules.
11. Pause, lock, and sleep close active time segments correctly.
12. A deletion races with inference: an old-epoch result cannot recreate deleted memory.
13. An MCP configuration contains custom entries: setup preserves them; disable removes only owned configuration.
14. Gateway retries and billing webhook retries do not double-charge or duplicate usage.
15. The app sleeps through a scheduled time: catch-up follows the cutoff and does not duplicate delivery.
16. A model invents a source ID: the answer is rejected or regenerated before display.
17. A summary loses its source through retention: exact-source UI reports unavailable evidence.
18. Update or migration crashes: local data opens consistently on the next supported launch.

### 16.4 Retrieval and writing evaluation

Build a consented or synthetic evaluation set of at least 200 recall questions and 200 rewrite tasks, split by date, app, entity ambiguity, language, and missing evidence. Include contradictory and deliberately absent facts. Do not use personal production archives as a default test fixture.

Starting gates: recall@10 ≥ 0.90 for known-answer retrieval cases; ≥ 95% of answer claims supported by cited evidence in human review; ≥ 95% correct abstention on absent-fact cases. Evaluate writing on instruction compliance, factual preservation, recipient fit, style similarity, and edit distance after user correction. Treat these as separate dimensions rather than one opaque satisfaction score.

Release only when both retrieval and insertion gates pass. Better prose cannot compensate for incorrect evidence or writing into the wrong window.

## 17. Delivery plan and staffing

Planning estimate for a small team already experienced with native desktop software: roughly 18–24 weeks for a credible two-platform beta. This is not a vendor timeline or a fixed bid. Allow substantial contingency for rich editors, OS permissions, installer behavior, and model evaluations.

Suggested team: one macOS engineer, one Windows/Rust engineer, one backend/memory engineer, one desktop/frontend engineer, with shared product/design and QA/security support. A solo implementation should reduce platform/app scope substantially.

| Phase | Approximate window | Deliverable and exit gate |
|---|---|---|
| 0. Native feasibility | Weeks 1–2 | Read and edit fixture apps on both OSes; demonstrate stale-target rejection; choose supported OS baseline |
| 1. Local foundation | Weeks 3–5 | Daemon, capture policy, redaction, SQLite, FTS, pause/delete; privacy tests pass |
| 2. Inline vertical slice | Weeks 6–8 | Account/gateway, one-key writing, target validation, cancellation, onboarding; defined app matrix passes |
| 3. Useful memory | Weeks 9–12 | Source-grounded chat, chronicles, wiki, identity, time accounting, retrieval evaluation |
| 4. Voice and integrations | Weeks 13–15 | Dictation, edit mode, read-only MCP, safe client setup; configuration and audio tests pass |
| 5. Proactive features | Weeks 16–18 | Reminders, commitments, briefs, nudge controls, memory-management UX |
| 6. Beta hardening | Weeks 19–24 | Signing, updates, recovery, enterprise policy, website, accessibility, battery and security evaluation |

A narrower macOS private alpha can ship after Phase 2 with a small supported-app list. Do not postpone Windows feasibility until after the architecture is fixed.

### First engineering tickets

- Define platform adapter contracts and synthetic accessibility fixtures.
- Build one capture/read/write proof per OS, with selection and stale-focus tests.
- Specify exclusion precedence and unknown-browser-context behavior.
- Implement source/observation/activity separation and baseline migration.
- Implement a redaction fixture suite before enabling persistence.
- Build one complete inline path with a deterministic mock model.
- Add authenticated inference and structured result validation.
- Build evidence-linked search/chat before summaries and vectors.
- Add dependency-aware deletion and memory epochs.
- Package and sign early to expose real permission behavior.

## 18. Key unresolved decisions and validation backlog

| Decision | Recommended default | Evidence needed before changing it |
|---|---|---|
| Framework | Shared Tauri shell with native adapters | Overlay, accessibility, and energy spike |
| Capture scope | Permitted foreground accessibility text | Tested coverage and private-window detection |
| Vector retrieval | Optional, deferred | Measured lift over FTS/entity retrieval |
| Background AI | Separately disclosed and controllable | Quality/cost study with representative sessions |
| Memory encryption | OS protection initially; application encryption if requirements demand | Threat model, key recovery, migration budget |
| Rich editors | Explicit adapter support; otherwise Copy fallback | Formatting and selection regression coverage |
| MCP enrollment | Clear client selection and consent | Actual current client configuration formats |
| Retention | User-visible configurable cap | Measured storage and retrieval needs |
| Pricing | Server-defined entitlements, no assumed price | Business model and contracted inference cost |
| Proactivity | Evidence-based, low frequency, easy disable | False-positive and dismissal rates |

Unverified reference details to investigate if exact parity becomes necessary: installed app UI states; binary/framework metadata; full release manifest; actual MCP schemas; minimum OS versions; per-app adapters; updater rollback behavior; original performance; mobile marketing layout. This specification is sufficient to build an independent equivalent, but those unknowns prevent claiming a byte-for-byte or behaviorally exact clone.

## 19. Research provenance

Public research covered the rendered homepage, FAQ, blog, installation, onboarding, inline key, edit mode, voice, chat, privacy, settings, shortcuts, MCP, managed installation, and MDM documentation. Native APIs, SQLite, Tauri, and MCP transport choices were checked against their primary documentation, linked near the relevant decisions.

A locally installed `rewind/SKILL.md` integration guide supplied the static local-API and memory-layer contract labeled LOCAL CONTRACT. It was not used to search the user’s activity, open private memory, read credentials, or inspect their conversations. No desktop binary was decompiled, no account was created, and no software was installed for this research.

The artifacts are an implementation plan, not a report of a built or tested Rewind replacement. Website observations were made at one desktop viewport; mobile rules are proposed. Documentation claims about privacy and zero retention are attributed to their publisher. All sample data, performance gates, implementation details, and delivery estimates are explicitly design proposals.
