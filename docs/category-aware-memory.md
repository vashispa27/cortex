# Experimental category-aware memory

This worktree contains an opt-in local-model ingestion and retrieval experiment. Existing behavior remains the default. The local model receives cleaned screen text and app/URL context, so use only a trusted local HTTP server; raw screen content is never sent to a remote endpoint by this feature.

## Ingestion

Set `REWIND_CATEGORY_ENABLED=1`, `REWIND_CATEGORY_URL` to an OpenAI-compatible local `/v1/chat/completions` endpoint, and `REWIND_CATEGORY_MODEL` to the served model identifier. Each new, non-duplicate snapshot is cleaned using the existing cleaner. The model receives numbered lines of that body and returns an ordered partition into message, post, email, document, event, or unknown objects. Long objects are then chunked using the existing chunker. Each chunk stores category, optional literal author and displayed time, source-body byte offsets, object offsets, and model identifier in SQLite; the category is also attached to its Qdrant point. Capture and displayed times are distinct. There is no event-time inference or people table.

The response is accepted only if every line is covered exactly once, in order, and categories are valid. Author and displayed time are retained only when they occur verbatim in their object's text. Model failures, invalid output, or input larger than 24,000 bytes fall back to the original chunker with `unknown` labels, unless `REWIND_CATEGORY_STRICT=1` makes the operation fail. No model-generated text replaces source text. Segmentation is currently synchronous and may delay capture by up to the request timeout (30 seconds); use as an experiment, not as a finished background ingestion pipeline.

Extraction runs on the existing cleaned body, not the original Accessibility tree: structure and text already removed by the cleaner cannot be recovered. Labels and boundaries may still be wrong even when the output validates. A model-generated author/time is not proof that it belongs to the surrounding text.

Enabling this applies to **new** snapshots only. It does not relabel or reindex previously captured data; re-cleaning currently uses the baseline chunker. Use a fresh isolated evaluation archive to compare ingest variants. Existing chunks have category `unknown`; legacy indexed points with no category payload remain searchable. Chunk-sharing is disabled for newly indexed classified chunks to prevent sharing across categories.

## Retrieval

Set `REWIND_CATEGORY_ROUTE=1` to have the local model choose zero or more categories for each query. A non-empty route filters candidate prefetches to selected categories plus unknown/legacy and derived points; an empty/invalid route searches all categories. An empty or abstained filtered result falls back to unfiltered retrieval. A wrong but non-empty route can still omit good evidence, so evaluate the impact before enabling this for normal use. A model call adds latency to each routed query and repeats on every query repeat. This is a filter experiment, not a calibrated relevance boost.

## Run the three-way comparison

Start an OpenAI-compatible **local** model server and set its endpoint and model name. All evals use temporary SQLite and Qdrant archives; no live capture is started. Use invented or explicitly authorized local eval fixtures. For comparable scores, use the same corpus, gold set, model, and settings in both invocations:

```sh
export REWIND_CATEGORY_URL=http://127.0.0.1:8080/v1/chat/completions
export REWIND_CATEGORY_MODEL=your-local-model
export REWIND_CATEGORY_STRICT=1

# Baseline: current chunking, no category routing.
REWIND_CATEGORY_ENABLED=0 REWIND_CATEGORY_ROUTE=0 cargo run -p rewind --release -- eval \
  --corpus evals/corpus --gold evals/gold/gold.jsonl \
  --param category_route=off --out /tmp/rewind-baseline.json

# Segmentation-only base, then category routing on the same segmented data.
REWIND_CATEGORY_ENABLED=1 REWIND_CATEGORY_ROUTE=0 cargo run -p rewind --release -- eval \
  --corpus evals/corpus --gold evals/gold/gold.jsonl \
  --param category_route=off --sweep category_route=on \
  --out /tmp/rewind-segmented.json
```

The sweep produces a separate `category_route-on` report; inspect filenames printed by the command. Reports include category counts, enabled state, model name, retrieval metrics, timing and index size. Strict mode stops the eval on model errors or oversized inputs rather than silently scoring fallback chunks; an empty route is a valid broad-search response. Dev/test splits and the existing question types are supported by the eval harness. Build a representative multi-day gold set with posts, messages, mixed categories, and negative cases before drawing product conclusions; the existing sample alone cannot establish category quality.

A small end-to-end smoke test uses a mock server and invented text; it checks indexing and routed filtering, not model quality:

```sh
cargo build -p rewind
python3 evals/tools/category_smoke.py --bin target/debug/rewind
```

The embedding model must already be cached or provided via `REWIND_MODEL_DIR`, as for other evals.
