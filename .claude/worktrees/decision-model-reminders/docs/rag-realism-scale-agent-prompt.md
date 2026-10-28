# Task: check that the retrieval eval numbers transfer to real use (real-data eval + scale test)

You are working in `/Users/abhinavvashisht/workspace/rewind` (Rust workspace, macOS-only crate `crates/cortex`). An eval harness exists (`evals/`), with 24+ invented pages, a gold set, and a baseline. Another agent is fixing retrieval weaknesses at the same time (`docs/rag-fixes-agent-prompt.md`). Your job is different: find out whether the baseline numbers mean anything outside the small, clean, invented corpus.

Read first: `evals/README.md`, `evals/reports/baseline-analysis.md`, `evals/reports/baseline.md`, `docs/rag-fixes-agent-prompt.md` (so you know what the other agent owns), then `crates/cortex/src/main.rs` (`open_runtime`, `index_pending`, `retrieve`, the eval and ingest code) and `evals/tools/`.

## Permission to use the user's real data

The user has explicitly allowed you to read and use their real captured data to speed this work up. They do not consider it sensitive and do not mind if it is changed. The real state directory is `~/Library/Application Support/Cortex/local-memory` (SQLite `memory.sqlite3` with about 1,400 snapshots and 3,700 observations, plus `qdrant-edge/`). Backups from earlier cleaning runs (`memory.pre-clean-v1.sqlite3`, 61 snapshots; `memory.pre-clean-v3.sqlite3`, 57) are in the same folder.

- You may read it directly with `sqlite3` or from Rust. No need to make copies first. You may write to it if that is the fastest route, but prefer ingesting into a throwaway temp state dir (`CORTEX_STATE_DIR`) for eval runs, because the harness needs a deterministic, disposable index.
- Do not start live capture and do not request Accessibility permission (that needs the user). If a capture process is running (`pgrep -fl cortex`), do not kill it; read the database anyway.
- Keep real-data-derived files (exports, private gold set, reports with real text) out of git: put them under `evals/private/` and make sure `.gitignore` excludes it. This is hygiene so nothing is pushed by accident, not a privacy worry.
- No network calls and no LLM calls with this data in this task. The eval path needs neither.
- All other rules still apply: no dependency added without asking the user; no changes to production retrieval, chunking or cleaning behavior.

## Coordination with the fixes agent

- Work on your own git branch in a separate worktree (`git worktree add ../cortex-scale -b evals-realism`). Do not work on the fixes agent's branch.
- The fixes agent owns, and you must not edit: `query_filter`, `time_bounds`, `retrieve`/`answer`/`snippet`/`llm_answer` logic, `cleaner.rs`, `evals/gold/gold.jsonl`, `evals/corpus/*`, `evals/pages/*`. You may read them.
- You own: new files under `evals/scale/`, `evals/private/` tooling, `evals/tools/` additions, and new eval subcommand options that do not change existing behavior. If you need a small change in shared code (for example an eval flag), keep it minimal and additive, and say so in the commit message so the merge is easy.
- Re-run against the latest fixes-agent commit before you report numbers, and state which commit you measured.

## Part A: real-data eval (do this first; it is the biggest win)

Question: do the invented-corpus results hold on what the user actually captured?

1. **Export.** Write `evals/private/export_real.py` (or a Rust subcommand) that reads the real database and writes one AX-style fixture per snapshot into `evals/private/corpus/` in the same JSON format as `evals/corpus` (app id, title, url, source type, observed time, `ax_nodes_json` roots). Include `ax_nodes_json` so the current cleaner re-cleans them through the real path. Skip snapshots with no AX nodes, `navigation_only`, `content_unavailable`, and `browser_private` ones. Record counts per app/domain and per cleaner quality, and body-size and chunk-count distributions: this alone already shows how different real data is from the invented pages (many short chunks? giant pages? terminal output? repeated captures of the same page?).
2. **Write a real gold set yourself.** You may read the cleaned bodies and write questions. Aim for 80–120 questions in `evals/private/gold.jsonl`, same schema and type taxonomy as `evals/gold/gold.jsonl`. Rules:
   - Write questions the way a person would ask later from memory ("what did Priya say about the launch date", "what was the olive oil amount ChatGPT suggested"), not by copying words from the answer. Include many paraphrase questions and many that need an app, date or speaker.
   - Every `answer_text` must be an exact substring of that snapshot's cleaned body (the harness verifies this). Prefer short, distinctive answer strings.
   - Real data has duplicates and re-captures, so one fact can appear in many snapshots. Compute relevance by text, not by a single snapshot: any retrieved chunk containing `answer_text` is a hit. For wrong-version questions use `wrong_text` where applicable.
   - `absent` questions must be verified absent: scan every cleaned body for the key terms and the answer before labelling one absent. Include near-miss absents (same people or topics, different fact) and time-scoped absents.
   - Cover the types in the existing gold taxonomy, and add types the invented pages cannot show: terminal output, code, long documents, very short snapshots, repeated near-identical captures, mixed-language text, tables.
   - Split dev/test about 50/50, assigned by a stable hash of the id.
   - Do not look at retrieval results while writing questions.
3. **Run it.** `cortex eval --corpus evals/private/corpus --gold evals/private/gold.jsonl --out evals/private/reports/real-baseline.json` (and the usual ablations: mode, rerank_bonus, filters, derived, chunk_target). Use the latest fixes-agent code and also the `baseline` commit, so you can show how each fix transfers.
4. **Compare with the invented corpus.** Produce `evals/reports/real/transfer.md` with aggregates only: for each question type and metric, the invented-corpus number next to the real-data number, with counts. Do not put snapshot text in this committed file. Say clearly which weaknesses from the baseline analysis are bigger or smaller on real data, which new failure modes appear (write them down with a few anonymized examples in the private folder, not in the committed report), and whether the fix order from `baseline-analysis.md` still holds.
5. **Also provide the authoring helper**: a small CLI that shows a snapshot's cleaned body and lets the user add questions to `evals/private/gold.jsonl` with the answer-string check, so the user can grow the set later. Keep it simple.

## Part B: scale test

Question: does quality, latency and index size hold up when the index is 100x to 1000x larger?

1. **Use real snapshots as the haystack.** The real corpus (about 1,400 snapshots) is a far better distractor set than invented text. Run the invented gold questions (and the real ones) with the real snapshots added as extra distractors: add an additive eval option `--extra-corpus DIR` (default off, deterministic) that ingests a second directory but scores only the gold questions. Make sure no real snapshot happens to contain an invented gold `answer_text`; if one does, report it and exclude it.
2. **Synthetic multiplication for bigger N.** Write `evals/scale/gen_distractors.py` (deterministic by seed) that produces more invented fixtures across the same app types, with realistic length distribution and UI noise, topic overlap with the gold questions, near-duplicate families (re-captured and scrolled variants), timestamps spread across 30–90 days, and a few hard distractors per gold question (same topic or entity, different fact). It must never emit a gold `answer_text` verbatim; verify automatically. Optionally derive more realistic distractors by mutating real snapshots (shuffled sentences, swapped numbers), flagged as such.
3. **Scale points**: base only, +real snapshots (~1.4k), +1k, +10k synthetic, and +100k only if ingest time allows (say if skipped). For each: hit@1, hit@8, MRR overall and per type, abstention behavior, near-duplicate crowding, ingest time and throughput, query latency p50/p95/p99, index size on disk, peak memory if measurable. Report release-build latency if it differs from debug.
4. **Index-size anomaly.** The baseline reports about 176 MB on disk for 71 chunks over 23 snapshots, while the real index (`qdrant-edge/`, about 86 MB for about 1,400 snapshots) is smaller than that. Find where the bytes go (preallocated segments, WAL, payload, HNSW, per-shard overhead) and compute size per chunk at each scale point. Extrapolate to the spec's workload (about 2,400 snapshots a day for 90 days). You may inspect the real index directly. Do not change production storage settings in this task; recommend.
5. Compare with the fixes agent's reports where possible, and say whether scale hurts more than any single fix helps.

## Deliverables

- Part A: private export and gold set (git-ignored), authoring helper, run reports in `evals/private/reports/`, and the committed aggregate-only `evals/reports/real/transfer.md`.
- Part B: generator, additive eval option, reports under `evals/reports/scale/` and `evals/reports/scale/analysis.md` answering: which metrics degrade first and at what N, which question types suffer, whether latency or disk becomes a problem, and the size-per-chunk explanation with the extrapolation.
- Commits small and descriptive, on your branch only. Do not merge into the fixes agent's branch; tell the user the merge order and any conflicts you expect.
- Final message: the key numbers, what surprised you (especially where real data differs from invented), what you could not measure, and recommended next actions, including any real-data findings that should become new invented gold questions for the main gold set (describe them generically so no private text is needed).

Stop and ask the user before: starting live capture or asking for Accessibility permission, adding a dependency, changing production retrieval, chunking, cleaning or storage behavior, or sending any data off the machine.
