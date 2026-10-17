# Task: build a baseline evaluation harness for the open-memory RAG pipeline

You are working in `/Users/abhinavvashisht/workspace/goldfish-implementation` (Rust workspace, macOS-only crate `crates/open-memory`). Your job is to build an offline evaluation harness and produce a **baseline report** for the current chunking and retrieval. You are **not** fixing retrieval weaknesses in this task. Fixes come later, one at a time, measured against your baseline.

Read first: `README.md`, `docs/implementation-status.md`, `docs/snapshot-text-cleaning-plan.md`, and spec section 8 and 16.4 in `goldfish-end-to-end-spec.md`.

## How the system works today

- Capture: foreground Accessibility (AX) nodes go through `cleaner::clean` (`crates/open-memory/src/cleaner.rs`, cleaner v3). It keeps main content, drops navigation, toolbars, action controls and composer text, and joins fragments. Output is a cleaned `body`, a `quality` (`main_content`, `uncertain`, `navigation_only`), and per-node drop reasons.
- Chunking: `cleaner::chunks` (cleaner.rs:221) splits on lines, then sentences, with a 1,600-byte target and no overlap. It starts a new chunk at speaker markers ("You said:", "ChatGPT said:", "... sent the following message:"). Chunks are stored in SQLite `chunks` with byte spans into the snapshot body.
- Indexing: `Runtime::index_pending` (main.rs:355) embeds each chunk with Model2Vec `minishlab/potion-base-32M` (512-dim dense) plus BM25 sparse, into a Qdrant Edge shard (`crates/open-memory/src/main.rs`). "Derived" points (topic, entity, hour, day extractive summaries) are indexed into the same shard.
- Retrieval: `answer()` (main.rs:917) applies regex-derived filters (`query_filter`, main.rs:831: app words, domain, "private", date via `time_bounds`), runs dense top-80 and BM25 top-80, fuses with RRF (k=60) to 40, collapses to one result per body (`evidence_key`), re-sorts with a keyword-count bonus, truncates to 8, then prints text and optionally calls an LLM (`llm_answer`).
- There are currently no tests in `crates/open-memory` and no evals anywhere.

## Goal and non-goals

Goal: a repeatable command that runs a gold question set against a synthetic corpus through the real chunk, embed, index and retrieve code, and writes a metrics report. The baseline must reflect the current behavior exactly.

Non-goals (do not do these):
- Do not change retrieval, chunking or cleaning behavior. The refactor in step 1 must be behavior-preserving.
- Do not fix the weaknesses listed at the end. Only write the eval cases that expose them.
- Do not enable live capture, request Accessibility permission, or read the user's real state directory (`~/Library/Application Support/Open Memory/local-memory`). Always use a temp dir through `OPEN_MEMORY_STATE_DIR`.
- Do not commit real personal data. All fixture text must be invented.
- Do not add an LLM call to the eval path in this task (answer-quality judging is a later phase).

## Step 1: make retrieval callable (behavior-preserving)

`answer()` returns a formatted `String`, and the crate is binary-only. Extract the ranking into something structured:

- `retrieve(runtime: &mut Runtime, question: &str, params: &Params) -> Result<Retrieval>`, where `Retrieval` holds the final ordered hits (snapshot id, best chunk id, score, hit text) **and** the pre-collapse chunk-level ranked list (chunk id, snapshot id, score, text) from the Qdrant query, so chunk-level metrics are possible.
- `Params` carries the current constants with their current values as defaults: prefetch depth (80), fused limit (40), RRF k (60), final truncate (8), plus switches for `use_filters`, `use_rerank_bonus`, `include_derived`, and `mode` (hybrid, dense_only, bm25_only). Defaults must reproduce today's output exactly.
- `answer()` becomes a thin wrapper that calls `retrieve` and formats. Verify with a before/after comparison that `ask` output on a fixed fixture is byte-identical (capture the "before" output first).

Keep the crate building as a binary. If a lib target is cleaner, add `src/lib.rs`, but keep `#![cfg(target_os = "macos")]` semantics and make sure `cargo build -p open-memory` and `cargo test --workspace` still work on macOS.

## Step 2: fixture ingest path

Add a way to load AX fixtures into an isolated state dir without the AX helper:

- Fixture format: one JSON file per capture, with `app_id`, `title`, `url`, `source_type`, `observed_ms`, and `roots` (array of AX nodes in the same shape as `AxNode`: `role`, `name`, `value`, plus `ancestor_path` extras). Match what the real helper emits; look at `crates/platform-mac/native/AXProbe.swift` / `Capture.swift` and `ax_nodes_json` handling in `record()` to get the shape right.
- Ingest by calling the existing `record()` then `index_pending()` so cleaning, dedup, chunking and indexing are the real code paths.
- Gold labels reference fixtures by a stable fixture id (filename stem), so map fixture id to snapshot id during ingest.

## Step 3: the corpus

Create `evals/corpus/*.json` (start with about 20 fixtures, designed to grow to 100+). Content is invented, with planted facts that have known exact strings.

Realism matters: the cleaner depends on AX tree structure, so fixtures must have realistic ancestor paths, regions, roles, sidebars, toolbars, action buttons and composer nodes, not flat lists of text.

**You write the HTML pages; the user only runs the capture.** Author one self-contained `.html` file per corpus page in `evals/pages/` (no external assets, invented content only, planted facts with known exact strings). Style each like the real app so Safari/Chrome expose a realistic AX tree: for a ChatGPT-style page use a sidebar with a chat list, a header, `article` elements per turn with "You said:" / "ChatGPT said:" headings, Copy / Rate response / Share buttons, a footer disclaimer ("ChatGPT can make mistakes. Check important info.") and a prompt textarea; for multi-speaker chat use a conversation list, a message list with sender names and displayed times (e.g. "Lokesh 10:42 AM"), and a composer; for articles use nav, `main`, headings and a footer; likewise for email, terminal-like pages and notes. Use semantic HTML and ARIA roles/labels (`role="main"`, `aria-label="Conversation"`, `aria-label="Chat history"`, etc.) the way the real sites do, because `cleaner::region` keys on those labels. The repo's own manual check (README, "Manual macOS check") used an invented chat page opened in Safari; follow that precedent.

Then write `evals/CAPTURE.md`: exact, short steps for the user to capture every page on their Mac (`OPEN_MEMORY_STATE_DIR="$(mktemp -d)" target/debug/open-memory capture --print`, open each page in Safari, wait for `new #N`, move on), plus a small script `evals/export_fixtures.*` that reads that temp SQLite database and writes `evals/corpus/<page-stem>.json` fixtures (app_id, title, url, source_type, `ax_nodes_json` roots) matched back to the HTML filename by URL. Do not run capture or request Accessibility permission yourself; the user does this step and confirms.

Until the user has captured, develop and test the harness against a few hand-authored AX fixtures built from the `cleaner.rs` region rules, mark them `provenance: hand_authored`, and replace or supplement them once real captures arrive (`provenance: real_capture_invented_content`). Keep a single `evals/pages/<stem>.facts.json` per page listing planted facts and `noise_strings` (UI text that must not leak into the cleaned body), which the gold set and cleaner checks reference.

Cover these app types: ChatGPT-style thread (with sidebar, "You said:"/"ChatGPT said:", Copy/Rate buttons, composer), multi-speaker chat (X-chat or Slack style, speaker plus displayed time), article/blog, email, terminal output, notes/docs, and one navigation-only page that must not be searchable.

Include these hard cases:
- Two near-duplicate versions of one page where an amount or decision changed (same app and URL, different body).
- The same page captured before and after scrolling (overlapping content, different body).
- Two different people with the same first name.
- A long page where the answer sits deep in the middle, plus a fact that straddles a likely chunk boundary (number plus unit, Q&A pair, list item with its header).
- A non-English page (include Devanagari or similar, since chunk size is in bytes).
- Contradictory facts at different dates.
- Distractor pages with overlapping vocabulary but different facts.
- Pages whose titles are common English words matching the app-name filters (`notes`, `messages`, `edge`, `terminal`).

Add a corpus generator or validator script only if it helps; hand-written is fine for the first 20.

## Step 4: the gold set

Create `evals/gold/gold.jsonl`, one JSON object per line, about 40 questions to start, designed to grow to 200+:

```json
{"id":"q042","type":"paraphrase","query":"how much olive oil should I add to hit my fat target?","relevant":[{"fixture":"chatgpt-nutrition-01","answer_text":"Add 10 ml olive oil (~80 kcal, 9 g fat)"}],"expect_abstain":false,"notes":""}
```

Rules:
- **Label by answer text, not chunk id.** A returned chunk is a hit if its text contains `answer_text` (normalized for whitespace and case). This keeps the gold set valid when chunking changes, which is the whole point.
- `answer_text` must be an exact substring of the cleaned body of that fixture. The ingest step must verify this and fail loudly if not.
- `type` is one of: `keyword` (exact terms/numbers), `paraphrase` (low lexical overlap), `speaker`, `time_scoped`, `app_scoped`, `domain_scoped`, `multi_snapshot`, `absent` (answer not in corpus, `expect_abstain: true`, empty `relevant`), `ambiguous_entity`, `filter_trap`, `near_duplicate_version`, `boundary_fact`, `non_english`.
- Write at least 3 questions per type. Include `filter_trap` questions such as "what is an edge case in this test plan" or "what did I write in my notes about X" that should not be restricted to an app. Include `time_scoped` questions with "yesterday"/"today" and explicit dates; set fixture `observed_ms` relative to a fixed injected "now" so the results are deterministic (add a way to inject the clock for `time_bounds`, defaulting to the real clock).
- Add a `dev` or `test` split field, about 50/50, so thresholds (such as an abstention cutoff) can later be calibrated on dev and reported on test.
- Do not draft questions by looking at retrieval output. Write them from the planted facts first.

## Step 5: the `eval` subcommand

Add `open-memory eval --corpus evals/corpus --gold evals/gold/gold.jsonl [--split dev|test|all] [--param key=value ...] --out evals/reports/<name>.json`. Load the embedding model once. Use a fresh temp state dir per run (delete afterwards). Make runs deterministic.

Compute, overall and per `type`:
- **Chunk-level** (from the pre-collapse list): Recall@1/5/8/10/40, MRR, nDCG@10, hit = chunk text contains `answer_text`.
- **Final-output level** (the 8 results `ask` returns): hit@8, hit@1, MRR.
- **Near-duplicate crowding**: fraction of final slots occupied by results whose text is nearly identical (normalized overlap) to a higher-ranked result.
- **Derived pollution**: fraction of top-10 chunk-level slots occupied by derived points.
- **Filter diagnostics**: for every query, record the filter that `query_filter` produced and flag cases where the filter excluded all relevant snapshots. Also record zero-result queries.
- **Abstention**: for `absent` questions, how many returned any results at all (current behavior: expect this to be near 100% "wrongly answered"). Also dump the top score for absent vs answerable questions so a threshold can be calibrated later; do not implement a threshold.
- **Chunking intrinsics**: chunk count, byte-size distribution (mean, p50, p95, max), tokens if available, **fact-split rate** (share of gold `answer_text` strings contained whole by no single chunk), redundancy across chunks of near-duplicate snapshots.
- **Cleaner intrinsics**: per fixture, whether each planted answer survived cleaning, and whether known noise strings (listed in the fixture's `noise_strings`) leaked into the body; navigation-only fixtures must produce no searchable body.
- **Cost**: ingest time, query latency p50/p95, index size on disk.

Report format: a JSON file with all aggregates, per-type breakdown, and per-query results (rank of first hit, filter used, top-5 hit texts), plus a short human-readable markdown summary next to it. Include run metadata: git commit, `MODEL_VERSION`, cleaner version, params, corpus fixture count, gold count.

Support single-parameter sweeps through `--param` (`mode=dense_only|bm25_only|hybrid`, `rerank_bonus=on|off`, `filters=on|off`, `derived=on|off`, `rrf_k=N`, `prefetch=N`, `final_k=N`) so the later ablations need no code changes. Chunk size and overlap sweeps need `cleaner::chunks` to take its target size as a parameter with the current 1,600 as default; add that, behavior unchanged by default.

## Step 6: unit tests (cheap tier, no model needed)

In `cargo test` for the crate, add tests for `cleaner::chunks` and `cleaner::clean` on small inputs:
- Chunk spans are valid UTF-8 boundaries, in order, non-overlapping, and cover all non-whitespace content.
- No chunk exceeds the target by more than one sentence (document the actual bound).
- Speaker markers start a new chunk and stay attached to their message.
- Multi-byte text (Devanagari, emoji) does not panic or split inside a character.
- Navigation-only input yields an empty body and `navigation_only` quality.
- Known-bug cases: add tests that currently FAIL, marked `#[ignore = "known weakness: ..."]` with a clear reason, for: a number-plus-unit fact straddling the boundary, and the app-name filter traps in `query_filter` (`edge case`, `my notes`). They document the weaknesses and become regression tests when fixed.

## Step 7: run the baseline

Run the eval with default params and commit the report as `evals/reports/baseline.json` and `baseline.md`. Also run the ablation set once for the baseline record: `mode` (dense_only, bm25_only, hybrid), `rerank_bonus` on/off, `filters` on/off, `derived` on/off. With 40 questions the confidence intervals will be wide: report counts alongside percentages and say plainly which differences are within noise. Add a paired bootstrap CI if time permits.

## Acceptance criteria

- `cargo build -p open-memory` and `cargo test --workspace` pass on macOS (ignored known-weakness tests are fine and must be listed).
- `ask` output on a fixed fixture is byte-identical before and after the refactor (show the diff check).
- `open-memory eval ...` runs end to end from a clean checkout, in a temp state dir, and is deterministic across two runs (same report apart from timing fields).
- Every `answer_text` in the gold set is verified against the cleaned bodies at ingest.
- The baseline report and ablation numbers are committed, with a short summary of what the numbers say and where the pipeline is weakest by query type.
- Nothing touches the user's real state directory or enables capture.

## Hypotheses the eval should confirm or refute (report on each; do not fix)

1. Absent-fact queries still return 8 results (no abstention).
2. `query_filter` treats ordinary words (`notes`, `messages`, `edge`, `terminal`) as app filters and returns nothing with no fallback.
3. Facts straddling the 1,600-byte boundary are split across chunks (no overlap).
4. Chunks embedded without title, app or speaker context lose meaning ("Fat: 35 g").
5. Derived points (topic, entity, hour, day) compete with chunk results; entity regex produces junk entities ("Monday").
6. The keyword-count re-rank bonus helps or hurts versus plain RRF order (unvalidated).
7. Near-duplicate snapshots (scroll, edits) crowd the top 8 because dedup keys on the whole body.
8. Model2Vec static embeddings underperform BM25 on paraphrase queries (or not).
9. Byte-based chunk size makes non-English chunks much shorter in characters.
10. Date handling covers only today, yesterday and ISO dates; "last week" is ignored, and the observation check runs after the top-40 cut.

## Working style

Work in small commits (one per step). Ask the user before: enabling capture, using any real captured data, changing retrieval behavior, or adding a dependency. If a fixture's AX shape is uncertain, say so in the fixture's `notes` rather than guessing silently. Pause and tell the user when the HTML pages and `evals/CAPTURE.md` are ready so they can run the capture step. At the end, summarize: what exists, the baseline numbers, which hypotheses held, and a proposed ordering of fixes ranked by measured impact.
