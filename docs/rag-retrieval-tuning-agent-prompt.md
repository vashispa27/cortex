# Task: four retrieval improvements measured on real captures (open-memory)

You are working in `/Users/abhinavvashisht/workspace/goldfish-implementation` (Rust workspace, macOS-only crate `crates/open-memory`), on `main`. Do each of the four changes below as its own commit and prove it with the eval on **both** corpora. Another agent has been working on capture-side dedup and storage (`dedup.rs`, `rawtrees.rs`); do not touch those, and re-read `git log` before you start so you build on their latest commit.

## Read first
1. `evals/README.md`, `evals/reports/real/transfer.md` (what the real corpus showed and why), `evals/scale/README.md`.
2. `crates/open-memory/src/main.rs`: `retrieve_with` (fusion, collapse, rerank bonus, version step, final cut), `Params`, `answer`.
3. `crates/open-memory/src/versions.rs` (Fix 7: pairwise merge and version ordering) and `abstain.rs` for context.

## How to measure (one command)
```bash
evals/run_all.sh             # builds release, runs invented and real corpora, prints key numbers vs the previous run
```
Reports go to `evals/reports/runs/` (invented, ignored by git) and `evals/private/reports/runs/` (real, never committed). Detailed paired comparison with bootstrap intervals:
```bash
python3 evals/tools/compare.py OLD.json NEW.json
python3 evals/tools/ablation_table.py BASE.json VARIANT.json ...    # compact table from one run with --sweep
```
`target/release/open-memory eval --help`-style options live in `evals/README.md`: `--param key=value`, `--sweep key=v1,v2`, `--query-repeats N` (use 5 for latency; read `query_latency_best_of_repeats_ms`, which ignores machine load).

Two corpora, both must be reported for every change:
* **invented**: `evals/corpus` + `evals/gold/gold.jsonl` (124 questions, clean, small).
* **real**: `evals/private/corpus` (1,385 of the owner's own snapshots) + `evals/private/gold.jsonl` (125 questions: 99 answerable, 26 absent). Local only; never put its text, names or URLs in a commit message, report that is committed, or code comment. Aggregates (counts, rates) are fine.

Current numbers at `53dfca6` (main before the blocklist and the dedup work; re-measure your own starting point first):

| | invented | real |
|---|---|---|
| final hit@1 | 82/102 | 43/99 |
| final hit@8 | 98/102 | 72/99 |
| final MRR | 0.877 | 0.541 |
| near-identical results among final slots (2nd on) | 3% | 46% |
| query latency p50 (release, best-of-5) | about 5 ms | about 70 ms |

## Ground rules
* **One change per commit.** Message states the measured delta on both corpora with counts, and says which are within noise.
* **Don't tune to the test split.** Constants chosen on `dev`, reported on `test` (`by_split` in each report).
* **Don't edit existing gold questions** to make numbers look better. If a real question is wrong, fix it in a separate commit and say why.
* A change that lowers any per-type final hit@8 by more than noise on either corpus needs an explanation, or a revert. With 99 real questions, 3 to 4 questions is noise; use the paired bootstrap, not eyeballing.
* No new dependency without asking the user. No network or LLM calls in the eval path. Do not start live capture or touch `~/Library/Application Support/Open Memory` (evals use throwaway state dirs).
* Keep `ask` working; list visible output changes in the commit message. Run `cargo test --workspace` before every commit.
* Match the surrounding code style. No unrelated refactors.

## Change 1: remove or rework the keyword rerank bonus
**Evidence (measured, latest code):** `--sweep rerank_bonus=off` raised final hit@1 on real from 42 to 57 of 99 (paired 95% CI +6 to +24 points; 19 questions up, 4 down) and on invented from 75 to 86 of 100 (CI +3 to +19). hit@8 was unchanged on invented and +5 on real (CI includes 0). The Fix 7 notes kept the bonus because on their sample the CI included 0.

**What it is:** in `retrieve_with`, after chunks are collapsed to one entry per snapshot, each score gets `+ matches / sqrt(max(body_len, 100))` where `matches` counts query content terms in the *whole body* (each capped at 5). It ignores which chunk matched and duplicates what BM25 already does.

**Do:** confirm the numbers on the current code (`--sweep rerank_bonus=off`). Try three variants and pick on `dev`: off; count terms only in the retrieved chunks; a much smaller weight. Make the choice a `Params` field if it isn't already. Report per-type effects (watch `keyword`, `speaker`, `table`, `near_duplicate_version`). Default to the simplest variant that keeps the gain.

## Change 2: cap how many results one page can take
**Evidence:** on real data 46% of final slots (2nd on) are near-identical to a higher result, and 94% of queries have at least one; in 13 of 99 answerable questions the answer is in the top-40 chunk list but is lost before the final 8. Pages are re-captured every few seconds while open, so the same URL/title appears many times. Capture-side dedup is being fixed elsewhere; this change is the retrieval-side guard for copies that remain (and for old data).

**Do:** after collapsing to one entry per snapshot and before the final cut, group results by `(app_id, normalised URL or window title)` and let a group occupy at most `N` of the `final_k` slots (try 1 and 2). Keep the highest-scoring member (the version logic in `versions.rs` already orders versions; respect it and don't reintroduce the stale-version problem: the invented `near_duplicate_version` questions must not regress). The skipped members may be listed as pointers the way `versions.rs` lists other versions, so no information is hidden. Make `N` a `Params` field and sweep it on `dev`.
Measure: the near-duplicate slot share, the "answer in chunk list but lost at final" count, hit@1/hit@8 on both corpora, and the `near_duplicate_version` and `multi_snapshot` types (a question may legitimately need two pages from the same site).

## Change 3: weight BM25 above dense retrieval, or fix the dense side
**Evidence:** on real data `mode=dense_only` loses 10 points of hit@8 (CI −18 to −3) and its chunk hit@40 is 64% against 84% for hybrid; `mode=bm25_only` is as good or better than hybrid (hit@1 +6 points, CI 0 to +12; hit@8 +3, CI includes 0). On invented all three modes are within noise. The dense model is Model2Vec `potion-base-32M`, which is a weak fit for real text (prices, UI labels, Hinglish, terminal output).

**Do:** sweep fusion weights, e.g. RRF with a weight on the BM25 list (add a `bm25_weight` param, default 1.0 = today), and `prefetch` sizes. Pick on `dev`, confirm on `test`. Also try dense only as a re-ranker of the BM25 candidates. Report whether any setting beats hybrid on **both** corpora; if the only gains are on real, say so and show per-type effects (`paraphrase` is where dense should help; check it does not collapse). Do not swap the embedding model here (that needs a dependency decision); do record in the commit message what the dense leg is contributing.

## Step 0 (before changes 1 to 4): re-measure after the capture-side dedup
The numbers in this prompt were taken at `53dfca6`, **before** the other agent's ingest-time dedup (`dedup.rs`, commit `c8ab98d`) and raw-tree purge. Run `evals/run_all.sh` on current `main` first and use that as your starting point. Check, on both corpora: how large the near-identical share of final slots still is, and whether the numbers in the table above moved. If ingest-time dedup already removed most copies, Change 2 may matter less and Change 4 may become "delete code" (see below). Say so in your first report instead of following the old numbers.

## Change 4: remove the Fix 7 latency regression
**Evidence:** release build, same machine, best-of-5: the invented corpus went from p50 1.8 ms (Fix 6) to 11.5 ms (Fix 7 and later), and the real corpus from about 12 ms to about 70 to 140 ms. The cost does not grow with index size; it grows with body size and candidate count. `versions::apply` calls `mergeable()` pairwise over all collapsed candidates (up to 40 snapshots), and every call rebuilds word sets and critical-token sets from the full bodies of both snapshots.

**First question to answer:** with ingest-time dedup now in place, how many results does the pairwise merge in `versions::apply` still collapse (count it on both corpora)? Fix 7 was written when copies still reached the index; its two jobs are (a) merging provably identical results and (b) ordering versions of one page by what the question asks. Job (b) must stay (changed prices, counts and dates are different versions and must not be merged). If (a) now merges almost nothing, remove it (or keep it behind `dedup_jaccard=0`) instead of optimising it, and show with `diff_reports.py` that results are unchanged. Old snapshots saved before the dedup still contain copies, so check the real corpus, which is made of such captures, before deleting.

**Do:** profile first (`sample` or a timing around `versions::apply`) and say what dominates. Then: compute each candidate's word set and critical-token set once per query; skip pairs whose lengths or word-set sizes make Jaccard >= `dedup_jaccard` impossible; early-exit on the first difference in critical tokens; avoid cloning bodies. Cache nothing across queries unless it is keyed safely by snapshot id and invalidated on change.
**Constraint:** results must be identical. Run the eval before and after and use `python3 evals/tools/diff_reports.py` (identical apart from `timing`) on both corpora, plus the existing `versions.rs` unit tests. Report p50/p95/p99 best-of-5 before and after on both corpora; the target is back near Fix 6 latency (a few ms invented, tens of ms real).

## Deliverables
* Four commits on `main` (or a branch if the user says so), each with the measured delta.
* `evals/reports/tuning/NN-<name>.md` per change with the before/after table for both corpora (aggregates only), the sweep you ran, and the `dev`/`test` split for any constant you chose.
* Final message: key numbers (invented and real, start vs end), what surprised you, anything you could not measure, and the next change you would make. State clearly which results are within noise.

## Stop and ask the user before
Adding a dependency, changing the embedding model, changing capture, chunking, cleaning or storage behaviour, touching `evals/private/gold.jsonl` questions, or anything that sends data off the machine.
