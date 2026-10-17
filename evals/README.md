# open-memory retrieval evals

An offline harness that runs a gold question set against an **invented** corpus through the real
chunk → embed → index → retrieve code and reports metrics. It measures; it does not fix. No LLM is
called, nothing is captured, and the user's state directory is never opened (state lives in a temp
dir that is deleted afterwards).

```
evals/
  pages/<stem>.html          invented pages, styled like the real apps (open in Safari to capture)
  pages/<stem>.facts.json    planted facts, noise strings, logical app/url/time for each page
  corpus/<stem>.json         AX fixtures, one per page (hand_authored until captured, see CAPTURE.md)
  gold/gold.jsonl            124 questions, 13 types, dev/test split
  reports/                   baseline.json/.md, ablations/, ablations.md, analysis; fixes/ = one report per fix + summary.md
  tools/                     corpus generator, report diff, paired bootstrap, ask regression check
  CAPTURE.md  export_fixtures.py   replace hand-authored trees with real Accessibility captures
```

## Run

```bash
cargo build -p open-memory
target/debug/open-memory eval --corpus evals/corpus --gold evals/gold/gold.jsonl \
  --out evals/reports/baseline.json                  # also writes baseline.md
```

The model is taken from `OPEN_MEMORY_MODEL_DIR`, else the Hugging Face cache for the pinned
revision, else downloaded once into `target/eval-cache`. A run takes about 10 s.

Options: `--split dev|test|all` (default all), `--param key=value` (repeatable, changes the base),
`--sweep key=v1,v2` (repeatable; each value is an extra variant written next to `--out` as
`<name>.<key>-<value>.json` and shares the base's index unless it changes `chunk_target`).
Keys: `mode` (hybrid | dense_only | bm25_only | bm25_dense_rerank), `rerank_bonus` (off | body/on | chunks), `rerank_weight` (finite, nonnegative), `filters`, `derived` (on | off),
`rrf_k`, `bm25_weight` (positive finite hybrid RRF weight; default 1), `prefetch`, `fused_limit`, `final_k`, `page_cap` (0 disables; cap per app and normalised page URL/title), `chunk_target`, `chunk_unit` (chars | bytes), `chunk_overlap` (percent), `chunk_boundaries` (on | off),
`chunk_mode=legacy` (the pre-Fix-4 chunker), `prefix` (none | title | context: text embedded with each chunk), `app_filter` (phrase | legacy),
`app_fallback` (empty | weak | off), `app_fallback_ratio`, `chunks_per_result`, `obs_prefilter`, `dedup_jaccard`, `version_order`, `version_margin`, `abstain=off` (zeroes every
abstention threshold) and `abstain_score|support|dense|chunk|unseen|unseen_sim|ident|time_support`. `filters=off` disables the
regex filters and the post-cut observation-time check.

```bash
# the ablation set recorded with the baseline
target/debug/open-memory eval --out evals/reports/ablations/ablation.json \
  --sweep mode=dense_only,bm25_only --sweep rerank_bonus=off --sweep filters=off \
  --sweep derived=off --sweep chunk_target=800,3200
python3 evals/tools/compare.py evals/reports/ablations/ablation.json evals/reports/ablations/ablation.*-*.json \
  --out evals/reports/ablations.md          # paired bootstrap 95% CIs
python3 evals/tools/diff_reports.py a.json b.json   # strict: identical apart from `timing`
# Scale reports also include random index file UUIDs and filesystem allocation/checkpoint costs.
# Exclude those physical files explicitly; logical SQLite sizes, params and ALL retrieval fields still compare:
python3 evals/tools/diff_reports.py a.json b.json --ignore-index-files
evals/tools/ask_regression.sh <old-binary> <new-binary>   # `ask` output byte-identical?
```

Determinism: the clock is injected (2026-10-17T12:00Z), the timezone is forced to UTC, ingest order
is by (observed time, fixture id), and exact RRF ties are broken by point id. Two runs differ only
in the `timing` block.

## Real-data eval and scale test (additive tooling)

Everything below is opt-in; the default `eval` run is unchanged.

* `--extra-corpus DIR`: ingest a second directory of fixtures (streamed, merged by observed time) and score
  only the gold questions. Reports gain `scale` (counts), `distractors` (final slots held by extra / `hard-`
  snapshots), the ingest curve, apparent vs allocated index bytes and a per-file `index_size` breakdown.
* `--query-repeats N`: re-run each query N times; `query_latency_ms` covers all samples and
  `query_latency_best_of_repeats_ms` the per-query fastest run (robust against machine load).
* `open-memory ingest-fixtures --corpus DIR --dump-bodies OUT` writes every fixture's cleaned body and an index.
* Real data (never committed): `evals/tools/export_real.py` exports the real database as fixtures into
  `evals/private/corpus`; `evals/tools/gold_author.py` browses cleaned bodies and appends gold questions with
  the answer-string check; gold goes in `evals/private/gold.jsonl` (types as above plus `terminal_output`,
  `code`, `long_document`, `short_snapshot`, `repeat_capture`, `mixed_language`, `table`). `evals/private/` is
  git-ignored. `evals/tools/transfer_table.py`, `transfer_types.py`, `ablation_table.py` and
  `dedup_potential.py` produce aggregate-only tables from the reports.
* `evals/run_all.sh` builds and runs the invented and real evals, saves timestamped reports and prints the key numbers against the previous run.
* Ingest-time dedup switches (env): `OPEN_MEMORY_NO_INGEST_DEDUP=1` (all off), `OPEN_MEMORY_NO_NEAR_DUP_MERGE=1`, `OPEN_MEMORY_CHUNK_SHARING=1` (on; off by default); results in `reports/real/dedup.md`.
* Raw Accessibility trees are deleted 7 days after a snapshot was last seen (`raw-trees` command, automatic in `capture`); evals and `export_real.py` need them, so set `OPEN_MEMORY_RAW_TREE_DAYS=forever` while collecting data for evals.
* Scale test: see `evals/scale/README.md` (generator, runner, summariser).

## Definitions

* **Gold labels are answer text, not chunk ids.** A returned item is a hit if its normalised text
  (lower-cased, whitespace collapsed) contains `answer_text`. Every `answer_text` is verified
  against the cleaned body of its fixture at ingest and the run fails if one is missing.
* **Chunk level** uses the Qdrant result before collapsing (derived points included, hit text is the
  chunk or the derived summary). Recall@k is the share of a question's relevant items found in the
  top k; `hit@k` is "at least one found" (counts shown as `n/N`). MRR uses the first relevant item.
* **Final level** is the 8 results `ask` shows. A result is a hit if its retrieved chunks (up to
  `chunks_per_result`, default 3, per snapshot; the first 2,500 characters of the body for derived
  hits) plus the printed snippet contain the answer, which is the evidence an LLM receives. The snippet
  is taken from the retrieved chunks when they hold a query term, else from the whole page. Before
  Fix 2 the definition used one chunk and a whole-page snippet; `--param chunks_per_result=1`
  reproduces it, so earlier reports can be re-scored (`reports/fixes/02-multi-chunk.chunks_per_result-1.json`).
* **Near-duplicate crowding**: share of final slots (2nd onward) whose body has word-set Jaccard ≥ 0.8
  (and ≥ 0.5) with a higher-ranked result. **Derived pollution**: share of the top-10 chunk-level
  slots that are derived points.
* **Fact-split rate**: share of distinct gold `(fixture, answer_text)` pairs that no single chunk of
  that fixture contains whole. `stale_or_wrong_text_ranked_above_answer` uses the optional gold field
  `wrong_text`.
* **Abstention**: `ask` prints "No matching captured evidence" when the rule in `abstain.rs` fires. The report
  gives, for absent questions, how many abstained, and for answerable ones how many were wrongly abstained
  (and how many of those would have hit): always read the two together. Per-query signals (`score_norm`,
  `support`, `dense_sim`, `chunk_sim`, `unseen`, `ident`) are recorded for every query; thresholds are
  chosen on `dev` only with `tools/abstention_curve.py` and reported on `test` (`by_split` in each report).
  RRF scores are rank based, so `score_norm` divides by the best attainable score (rank 1 in every retriever).
* Tokens are not reported: model2vec-rs does not expose its tokenizer, so bytes, characters and
  whitespace words are given instead.

## Caveats

* 61 questions: a difference of one or two queries is noise. `compare.py` prints bootstrap intervals
  and flags rows "within noise".
* Fixtures are now real Safari captures (`provenance: real_capture_invented_content`, app id, URL and
  time rewritten). `evals/tools/build_corpus.py` can still regenerate hand-authored trees; the earlier
  hand-authored baseline is kept in `reports/hand-authored/`. Do not mix the two when comparing.
* The corpus is engineered to expose weaknesses (planted boundary straddles, near-duplicates,
  filter traps); the rates it reports are not production rates.
* Changes made to `main.rs` for this harness are behaviour-preserving: `retrieve()`/`Params` defaults
  reproduce `ask`, `ask` output is byte-identical (`ask_regression.sh`), and the only intentional
  difference is that exactly tied RRF scores are ordered by point id instead of arbitrarily.

Aggregate-only version profiling: `OPEN_MEMORY_PROFILE_VERSIONS=1` logs candidate/merge counts and
merge/order microseconds per retrieval pass to stderr; it never logs the question or source text.
Features used for pairwise version merging are query-local; the public ingest merge rule is unchanged.
