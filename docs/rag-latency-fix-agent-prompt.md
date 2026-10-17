# Task: cut query latency in open-memory without losing retrieval quality

You are working in `/Users/abhinavvashisht/workspace/goldfish-implementation` (Rust workspace, macOS-only crate `crates/open-memory`, branch `main`).
Retrieval was fixed one weakness at a time and then measured on real data and at larger sizes. Quality is acceptable; **query latency is not**,
and part of it is a single known cause. Your job is to make queries much faster, prove quality did not drop, and report what each change bought.

Read first: `evals/README.md`, `evals/reports/real/transfer.md`, `evals/reports/real/dedup.md`, `evals/reports/scale/analysis.md`, then the code:
`crates/open-memory/src/versions.rs` (`apply`, `mergeable`, `critical_tokens`), `crates/open-memory/src/main.rs` (`retrieve_with`, the keyword rerank
bonus and the `versions::apply` call after it, `evidence_text`, `answer`), `crates/open-memory/src/abstain.rs`, and `crates/open-memory/src/eval.rs`
(latency fields).

## What was measured

All numbers are query latency in milliseconds on a release build, fastest of 5 repeats per query (`query_latency_best_of_repeats_ms`), on a Mac that
was swapping, so treat them as ratios, not absolutes. Re-measure everything yourself on a quiet machine first.

| index | p50 | p95 |
|---|---|---|
| invented corpus, 36 snapshots, Fix 6 (before Fix 7) | 1.8 | 2.6 |
| the same corpus, after Fix 7 | 5.7–11.5 | 20+ |
| real corpus, 1,385 snapshots (about 12 before Fix 7) | 73 | 160 |
| real + 1k same-topic pages (2,677 snapshots) | 100 | 207 |
| invented + 1k topical pages (1,328 snapshots) | 157 | 349 |
| invented + 10k topical pages (13,343 snapshots) | 272 | 905 (p99 about 1.9 s) |

* **Known cause 1 (Fix 7):** `versions::apply` merges near-identical results by comparing every pair of up to 40 candidate snapshots; `mergeable` rebuilds the
  word set and the critical-token set of both full bodies on every call. Bodies reach 33 KB. Cost is O(n² · body size) per query, independent of index size.
* **Known cause 2 (rerank bonus):** the keyword rerank bonus in `retrieve_with` counts term matches over the full body of every candidate. Switching it off
  (`--param rerank_bonus=off`) raised final hit@1 by **+15 points on real data (CI [+6, +24]) and +11 on invented (CI [+3, +19])**, hit@8 unchanged or +5. So
  removing it is faster *and* better; the fixes agent kept it because on its own sample the interval included zero.
* **Unexplained:** p50 still rises from 157 ms (1.3k snapshots) to 272 ms (13k). Candidate causes, none verified: full-body reads from SQLite per candidate,
  `chunks_per_result` selection, payload filters on non-indexed fields in Qdrant, `prefetch` 80 and `fused_limit` 40 being large, per-hit `load_source` queries
  and the per-hit observation check. **Profile before guessing** (`sample <pid>` on macOS, or timing instrumentation around each stage in `retrieve_with`).

## Do, in this order, one commit each

1. **Make a measurement harness result you can trust.** Run `evals/run_all.sh` and, with a bigger index, the scale runs in `evals/scale/` (README there). Record p50/p95/p99
   (best-of-repeats) for: invented, real, invented + `evals/scale/out/topical-1k`, invented + `topical-10k`, real + `topical-1k`. Generate the inputs with the commands in
   `evals/scale/README.md` (needs `evals/private`; it is git-ignored). Keep the machine awake and idle; if it swaps, say so.
2. **Profile.** Report time per stage for a typical real query: embedding, Qdrant query, hit resolution (SQLite), rerank bonus, `versions::apply`, final assembly.
3. **Fix `versions::apply`.** Compute each candidate's word set and critical-token set once per query (cache by snapshot id); compare only the top `2 × final_k` candidates;
   skip pairs whose length ratio makes Jaccard ≥ 0.9 impossible; keep the exact merge rule (word overlap ≥ `dedup_jaccard`, identical numbers/capitalised words/negations).
   Behaviour must be identical: same merges, same order. Add a test that the optimised path equals the old one on random bodies.
4. **Decide the rerank bonus.** Remove it or cap its work (for example count matches in the retrieved chunks, not the whole body). Show the paired bootstrap
   (`evals/tools/compare.py`, `evals/tools/ablation_table.py`) on both corpora; keep it only if it earns its cost.
5. **Remove the next biggest cost the profile shows** (per-candidate body reads, filters, `prefetch`/`fused_limit`, etc.), one change at a time.
6. Optional, separate commit: **cap the Qdrant Edge write-ahead log.** At +10k, 772 of 1,008 MB of the vector store are 24 retained 33.6 MB WAL segments. Find the
   Qdrant Edge setting or call that truncates or limits retained segments after `flush`, check that a crash after a flush still recovers (kill the process mid-ingest in a
   throwaway state dir, reopen, run an eval), and report the saved size. Do not change anything else in storage.

## Targets (on a quiet machine, release build, best-of-repeats)

* invented base: p50 ≤ 3 ms; real corpus: p50 ≤ 30 ms, p95 ≤ 80 ms; invented + 1k topical: p50 ≤ 60 ms; + 10k topical: p50 ≤ 120 ms, p99 ≤ 600 ms.
* If a target is out of reach, say why and what the profile shows instead.

## Quality guard (must hold after every commit)

* `evals/run_all.sh` before and after: invented final hit@1 82/102 and hit@8 98/102 (current), real hit@1 44/99 and hit@8 71/99. No drop larger than noise
  (2–3 questions); any drop must be explained, and a drop caused by removing the rerank bonus must not happen (it is expected to gain).
* Near-duplicate and version behaviour (`near_duplicate_version` type, `stale_or_wrong_text_ranked_above_answer`) must not get worse.
* `cargo test --workspace` passes; `evals/tools/ask_regression.sh <old-binary> <new-binary>` is reviewed (output may change only where you say it does).
* Recall is not allowed to buy speed: do not shrink `fused_limit`/`prefetch` unless chunk hit@40 is unchanged on both corpora.

## Rules

* Work on `main` in small commits, one change each, message stating the measured before/after (latency and hit counts). Pull first; if the tree has uncommitted
  changes you did not make, stop and ask.
* The user's live state (`~/Library/Application Support/Open Memory/local-memory`) is not to be opened or changed. Evals use throwaway state directories.
  No network calls or LLM calls; no new dependency without asking; do not start live capture or ask for Accessibility permission.
* Do not edit `evals/gold/gold.jsonl`, `evals/private/gold.jsonl` or the corpora. Real-data reports stay under `evals/private/` (git-ignored); committed reports are
  aggregates only.
* Dedup layers 2–3 and the 7-day raw-tree purge are on by default; chunk sharing is off (`OPEN_MEMORY_CHUNK_SHARING=1`). Do not turn it on; it is slower and was left off for exactly that reason.

## Deliverables

* The commits above, `evals/reports/latency/` with the before/after table, the stage profile, and the paired comparison for every quality-sensitive change.
* Final message: the before/after numbers per index size, which change bought what, what you could not measure, and what is still slow.
