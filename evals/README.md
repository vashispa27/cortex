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
  gold/gold.jsonl            61 questions, 13 types, dev/test split
  reports/                   baseline.json/.md, ablations/, ablations.md, analysis
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
Keys: `mode` (hybrid | dense_only | bm25_only), `rerank_bonus`, `filters`, `derived` (on | off),
`rrf_k`, `prefetch`, `fused_limit`, `final_k`, `chunk_target` (bytes). `filters=off` disables the
regex filters and the post-cut observation-time check.

```bash
# the ablation set recorded with the baseline
target/debug/open-memory eval --out evals/reports/ablations/ablation.json \
  --sweep mode=dense_only,bm25_only --sweep rerank_bonus=off --sweep filters=off \
  --sweep derived=off --sweep chunk_target=800,3200
python3 evals/tools/compare.py evals/reports/ablations/ablation.json evals/reports/ablations/ablation.*-*.json \
  --out evals/reports/ablations.md          # paired bootstrap 95% CIs
python3 evals/tools/diff_reports.py a.json b.json   # determinism: identical apart from `timing`
evals/tools/ask_regression.sh <old-binary> <new-binary>   # `ask` output byte-identical?
```

Determinism: the clock is injected (2026-10-17T12:00Z), the timezone is forced to UTC, ingest order
is by (observed time, fixture id), and exact RRF ties are broken by point id. Two runs differ only
in the `timing` block.

## Definitions

* **Gold labels are answer text, not chunk ids.** A returned item is a hit if its normalised text
  (lower-cased, whitespace collapsed) contains `answer_text`. Every `answer_text` is verified
  against the cleaned body of its fixture at ingest and the run fails if one is missing.
* **Chunk level** uses the Qdrant result before collapsing (derived points included, hit text is the
  chunk or the derived summary). Recall@k is the share of a question's relevant items found in the
  top k; `hit@k` is "at least one found" (counts shown as `n/N`). MRR uses the first relevant item.
* **Final level** is the 8 results `ask` shows. A result is a hit if the retrieved chunk (or the
  first 2,500 characters of the body for derived hits) plus the printed snippet contains the answer,
  which is the evidence an LLM would receive.
* **Near-duplicate crowding**: share of final slots (2nd onward) whose body has word-set Jaccard ≥ 0.8
  (and ≥ 0.5) with a higher-ranked result. **Derived pollution**: share of the top-10 chunk-level
  slots that are derived points.
* **Fact-split rate**: share of distinct gold `(fixture, answer_text)` pairs that no single chunk of
  that fixture contains whole. `stale_or_wrong_text_ranked_above_answer` uses the optional gold field
  `wrong_text`.
* **Abstention**: the pipeline has no threshold; the report records whether absent questions still
  returned results and the top-score distributions (plus AUROC of answerable vs absent) for later
  calibration on `dev`.
* Tokens are not reported: model2vec-rs does not expose its tokenizer, so bytes, characters and
  whitespace words are given instead.

## Caveats

* 61 questions: a difference of one or two queries is noise. `compare.py` prints bootstrap intervals
  and flags rows "within noise".
* Until `CAPTURE.md` is run, fixtures are synthesized from the page definitions with the same node
  rules as the AX helper; the roles real apps expose may differ. Hand-authored and real-capture
  numbers are not comparable.
* The corpus is engineered to expose weaknesses (planted boundary straddles, near-duplicates,
  filter traps); the rates it reports are not production rates.
* Changes made to `main.rs` for this harness are behaviour-preserving: `retrieve()`/`Params` defaults
  reproduce `ask`, `ask` output is byte-identical (`ask_regression.sh`), and the only intentional
  difference is that exactly tied RRF scores are ordered by point id instead of arbitrarily.
