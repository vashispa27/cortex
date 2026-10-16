# Scale test

Question: do quality, latency and index size hold up when the index is 100x to 1000x larger?

Everything here is additive: no production retrieval, chunking, cleaning or storage behaviour is touched.
The only change in shared code is `open-memory eval --extra-corpus DIR` (ingest a second directory, score
only the gold questions) and `--query-repeats N` (more latency samples), see `evals/README.md`.

## Inputs

```bash
# 1. Distractors (deterministic by --seed; the hard set is identical at every N).
python3 evals/scale/gen_distractors.py --seed 7 --also-gold evals/private/gold.jsonl --n 1000   --no-hard --out evals/scale/out/topical-1k
python3 evals/scale/gen_distractors.py --seed 7 --also-gold evals/private/gold.jsonl --n 10000  --no-hard --out evals/scale/out/topical-10k
python3 evals/scale/gen_distractors.py --seed 7 --also-gold evals/private/gold.jsonl --n 100000 --no-hard --out evals/scale/out/topical-100k
python3 evals/scale/gen_distractors.py --seed 7 --also-gold evals/private/gold.jsonl --n 0 --out evals/scale/out/hard-only
python3 evals/scale/gen_distractors.py --seed 7 --also-gold evals/private/gold.jsonl --n 0 --no-hard \
        --mutate-real evals/private/corpus --mutate-n 1000 --out evals/scale/out/mutreal-1k   # private: derived from real data

# 2. Real snapshots as the haystack for the invented gold set (needs evals/private from Part A).
python3 evals/scale/make_real_haystack.py        # excludes real snapshots that contain an invented gold answer
```

`evals/scale/out/` and `evals/private/` are git-ignored.

What the generator emits (see the docstring in `gen_distractors.py`):

* **Topical pages** (`syn-NNNNNN`): the layout, ancestor paths and UI noise of the real Safari captures in
  `evals/corpus`, with the content nodes replaced by generated text in the same domains as the gold set
  (bread, money, travel, home repair, work chat, code, health, outdoors, bikes, billing, Hindi recipes).
  Paragraph counts are log-normal (median about 4 KB of text, p90 about 12 KB), observation times spread over
  30–90 days before the eval clock (20% in the last 29 days).
* **Near-duplicate families** (`-a` re-captured with a later sighting, `-b` scrolled, `-c` one number edited)
  for about half of the pages.
* **Hard distractors** (`hard-qNNN-…`): a clone of the page behind each gold answer with every number, name,
  weekday and month swapped, observed within three hours of the original (same topic and entities,
  different facts); `hard-absqNNN-…` pages share the content words of an absent question.
* **Mutated real snapshots** (`mut-real-…`, private): real snapshots with numbers and names swapped.
* The generator never emits any gold `answer_text` (invented gold plus `--also-gold`); the manifest records
  how many fixtures needed repair or were dropped.

## Run

```bash
cargo build --release -p open-memory
evals/scale/run_scale.sh target/release/open-memory evals/private/reports/scale \
    inv-base inv-hard inv-real inv-1k inv-10k inv-10k-hard real-base real-1k real-10k real-mut
python3 evals/scale/summarize.py evals/private/reports/scale          # aggregate table
```

Each point re-ingests everything into a throwaway state directory (the eval never opens the user's state),
runs every gold query once for scoring plus four repeats for latency, and records ingest time, throughput,
peak RSS (`/usr/bin/time -l`), index size on disk (apparent and allocated) and a per-file breakdown.
