# Running the evals (one page)

Everything below lives inside this repository. Nothing is read from or written to anywhere else, and the eval never
touches your live memory (`~/Library/Application Support/Rewind`).

## Commands

| what | command | time |
|---|---|---|
| quality + latency, invented and real corpora | `evals/run_all.sh` | ~3 min (+ build) |
| only the invented corpus | `evals/run_all.sh invented` | ~15 s |
| only the real corpus | `evals/run_all.sh real` | ~2 min |
| latency/size with 1,000 extra synthetic pages | `evals/run_all.sh bench` | ~2 min |
| everything | `evals/run_all.sh all` | ~5 min |
| show the tracked history | `python3 evals/history.py` (`invented`, `real`, `bench`; `--last N`) | instant |
| compare two runs in detail (bootstrap CIs) | `python3 evals/tools/compare.py OLD.json NEW.json` | seconds |

Add `--note "what I changed"` to label the history row, `--no-build` to skip `cargo build`, and
`EXTRA="--param rerank_bonus=off" evals/run_all.sh` to pass eval options (see `evals/README.md` for the parameter list).

Each run prints the headline numbers next to the previous run, then appends one row to `evals/history/runs.csv`
(tracked in git, aggregates only): commit, whether the code was dirty, frozen dataset id, hit@1/@8, MRR, how often the
answer was found but lost, abstention counts, near-duplicate share, **query latency p50/p95/p99** (per query, the
fastest of 5 repeats, so machine load does not blur it), ingest seconds and index size. Full JSON/Markdown reports
go to `evals/reports/runs/` and `evals/private/reports/runs/` (not tracked).

## What is frozen, and why

The inputs are frozen so that a change in the numbers can only come from a change in the code:

| set | files | where |
|---|---|---|
| invented | `evals/corpus/*.json` (36 fixtures), `evals/gold/gold.jsonl` | in git |
| real | `evals/private/corpus/*.json` (1,385 snapshots exported from the live DB on 2026-10-16), `evals/private/gold.jsonl` (125 questions) | local only, git-ignored |

`evals/frozen.json` (tracked) stores a sha256 for every file. `run_all.sh` runs `python3 evals/freeze.py verify` first
and stops if anything changed, was added or is missing. To change a set on purpose (for example, to add gold questions):
edit, then `python3 evals/freeze.py update <invented|real>` and commit `evals/frozen.json`. The set id changes, and
`history.py` marks rows measured on a different dataset as not comparable. `update` makes the real files read-only.

The fixtures contain raw Accessibility trees, because the eval re-cleans them. The 7-day raw-tree deletion and the app
blocklist apply to the live database and capture loop only; the eval never reads either.

The real set is private data: it is never committed, and a `git clean -fdx` or deleting this folder removes it.
To keep a safe copy, archive `evals/private/` yourself and keep it with your own backups.

## Isolation from your real vectors

The eval builds a fresh SQLite file and a fresh Qdrant index per run inside `evals/.work/` (via `TMPDIR`), and deletes
them afterwards. `ingest-fixtures` refuses to run unless `REWIND_STATE_DIR` is set explicitly. The embedding model
is read from the Hugging Face cache or `target/eval-cache`, never from your state directory.

## Other tools

* Scale test (bigger indexes, disk breakdown): `evals/scale/README.md`.
* Make or change the real gold set: `evals/tools/gold_author.py`.
* Re-export the real corpus from the live DB (then re-freeze): `evals/tools/export_real.py`.
