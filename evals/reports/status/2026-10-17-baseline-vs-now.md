# Where we stand: baseline vs now (2026-10-17)

One run of `evals/run_all.sh all` on commit `605f7b0` (release build, 5 latency repeats, fastest repeat per query), compared with
the very first measurement (`6391653`, before any fix) and with the state after Fixes 1 to 7 (`a075fe0`). Aggregates only; the real
corpus is the owner's own captures (local, never committed). Frozen sets: invented `c2c26900d7e0`, real `e5239c9d66ba`.
Raw rows are in `evals/history/runs.csv` (`python3 evals/history.py`).

## Headline

| | invented: baseline | after Fixes 1-7 | **now** | real: baseline | after Fixes 1-7 | **now** |
|---|---|---|---|---|---|---|
| questions answerable / absent | 100 / 22 | 100 / 22 | 102 / 22 | 99 / 26 | 99 / 26 | 99 / 26 |
| **final hit@1** (answer is result #1) | 56 | 81 | **89** | 36 | 43 | **58** |
| **final hit@8** (answer in the 8 shown) | 76 | 96 | **98** | 55 | 72 | **75** |
| final MRR | 0.652 | 0.879 | **0.912** | 0.437 | 0.541 | **0.648** |
| answer found in top-40 chunks | 84 | 99 | 101 | 76 | 84 | 84 |
| ...but lost before the final 8 | 8 | 3 | 3 | 22 | 13 | **10** |
| absent questions that abstain | 0/22 | 10/22 | 10/22 | 0/26 | 5/26 | 5/26 |
| answerable wrongly abstained | 0 | 2 | 2 | 0 | 4 | 3 |
| near-identical results among final slots (2nd on) | 4% | 3% | 2% | 49% | 46% | **32%** |
| query latency p50 / p95 / p99 (ms) | 1.0 / 1.4 / - | 19.6 / 35.7 / 62.5 | **2.3 / 3.0 / 3.4** | 6.3 / 18.5 / - | 141.9 / 370.7 / 1512 | **16.1 / 30.1 / 41.0** |
| ingest time | 0.8 s | 0.9 s | 0.8 s | 45 s | 62 s | **36 s** |
| index on disk (allocated) | 178 MB | 14 MB | 14 MB | 672 MB | 537 MB | **447 MB** |
| snapshots / chunks indexed | 36 / 87 | 36 / 87 | 36 / 87 | 1,385 / 5,289 | 1,385 / 5,262 | **1,092 / 4,182** |

Reading it:
* **Real data improved a lot: hit@1 36 → 58 of 99 (+22), hit@8 55 → 75 (+20), MRR 0.44 → 0.65.** The largest single step after
  the Fix 1-7 series was turning off the keyword rerank bonus (hit@1 +14 on real, interval +6 to +23 points), then the two-results-per-page cap (duplicate slots 46% → 32%).
* **Invented is now close to ceiling** (89/102 and 98/102), so it can no longer show progress; use the real set to judge changes.
* **Latency**: the Fix 7 slowdown is gone. Invented p50 is back to 2.3 ms (19.6 before the fix); real p50 went 142 → 16 ms. It is still about 2x the pre-Fix-7 baseline
  (1.0 ms invented, about 6 ms real), but the baseline latency was measured on a different basis (all samples, not best of 5), so do not over-read that gap.
* **Disk and ingest on real data are smaller**: ingest-time dedup merged 1,385 captures into 1,092 snapshots (-21%) and 5,262 chunks into 4,182 (-20%); the index is 447 MB against 537 MB,
  and ingest takes 36 s against 62 s. This also changes what the eval ingests, which is why counts differ from the first runs. (The raw-tree deletion and the app blocklist act on the live database and capture loop only, so they do not affect these numbers.)

## At a larger index (`run_all.sh bench`: invented corpus + 1,000 synthetic same-topic pages, 1,327 snapshots)

| | before the tuning commits (scale run) | now |
|---|---|---|
| final hit@1 / hit@8 / MRR | 52 / 74 / 0.576 | **54 / 71 / 0.577** |
| answers found but lost at final | 11 | 14 |
| p50 / p95 / p99 latency | 157 / 349 / 479 ms | **24 / 48 / 58 ms** |
| ingest / index size | 42 s / 258 MB | 37 s / 275 MB |

Quality at +1k is unchanged within noise (hit@8 74 → 71 is 3 questions); latency is 6.5x lower. Adding 1,000 same-topic pages still costs the invented set about 27 points of hit@8 (98 → 71),
which is the same scale effect found before and is not addressed by any commit so far (see `evals/reports/scale/analysis.md`).

## Per question type, baseline to now (final hit@8 and hit@1)

Answerable counts are the "of" numbers; real types with 3 to 5 questions are anecdotes.

| type | invented hit@8 baseline→now | invented hit@1 | real hit@8 baseline→now | real hit@1 |
|---|---|---|---|---|
| absent (still answered) | 20→12 of 21 | – | 24→21 of 26 | – |
| ambiguous_entity | 4→4 of 4 | 3→4 of 4 | 1→1 of 1 | 1→1 of 1 |
| app_scoped | 4→4 of 4 | 3→4 of 4 | 4→6 of 6 | 2→5 of 6 |
| boundary_fact | 0→5 of 5 | 0→5 of 5 | – | – |
| code | – | – | 2→4 of 5 | 1→3 of 5 |
| domain_scoped | 5→5 of 5 | 4→5 of 5 | 8→7 of 9 | 6→7 of 9 |
| filter_trap | 6→15 of 15 | 4→12 of 15 | 1→3 of 5 | 0→2 of 5 |
| keyword | 8→8 of 8 | 7→8 of 8 | 6→8 of 8 | 4→8 of 8 |
| long_document | – | – | 3→1 of 3 | 1→1 of 3 |
| mixed_language | – | – | 1→1 of 3 | 1→1 of 3 |
| multi_snapshot | 6→7 of 7 | 3→5 of 7 | 2→3 of 4 | 1→2 of 4 |
| near_duplicate_version | 7→8 of 8 | 5→8 of 8 | 1→2 of 5 | 1→1 of 5 |
| non_english | 5→5 of 6 | 5→5 of 6 | – | – |
| paraphrase | 8→10 of 12 | 5→9 of 12 | 7→14 of 19 | 4→8 of 19 |
| repeat_capture | – | – | 2→3 of 3 | 2→3 of 3 |
| short_snapshot | – | – | 1→1 of 3 | 1→1 of 3 |
| speaker | 6→8 of 8 | 6→5 of 8 | 7→7 of 7 | 6→6 of 7 |
| table | – | – | 3→4 of 4 | 3→4 of 4 |
| terminal_output | – | – | 1→3 of 5 | 0→1 of 5 |
| time_scoped | 17→19 of 20 | 11→19 of 20 | 5→7 of 9 | 2→4 of 9 |

Biggest real gains: `keyword` 6 → 8 of 8 (hit@1 4 → 8), `paraphrase` 7 → 14 of 19 (hit@1 4 → 8), `app_scoped` hit@1 2 → 5 of 6, `time_scoped` 5 → 7 of 9, `code` 2 → 4 of 5, `terminal_output` 1 → 3 of 5.
Biggest invented gains: `filter_trap` 6 → 15 of 15, `boundary_fact` 0 → 5 of 5, `time_scoped` hit@1 11 → 19 of 20.

## What is still weak

1. **Real `long_document` fell 3 → 1 of 3 and `domain_scoped` 8 → 7 of 9** between the baseline and now. Three and nine questions are within noise, but long pages are what the two-results-per-page cap
   and ingest merging touch, so check these first (compare `a075fe0` real reports before blaming the cap).
2. **Near-identical results still take 32% of the final slots on real data** (invented 2%): re-captured pages that differ by one counter or price survive both dedups.
3. **Abstention only works for time-scoped absent questions**: real content-absent questions still return results (test split: 3/15 absent abstain, 1/50 answerable wrongly abstained).
4. **Short and mixed-language snapshots** (WhatsApp-style): `short_snapshot` 1/3, `mixed_language` 1/3 of real questions found.
5. **Same-topic scale**: +1,000 related pages cost about 27 points of invented hit@8.
6. `near_duplicate_version` on real is still 2 of 5 (versions of a page that differ only slightly).

## Caveats
* Baseline rows used a 122-question invented gold set (now 124) and an older harness; the real baseline latency was measured while the machine was swapping. Quality columns are comparable; latency columns are directional for the baseline and
  after-Fix-7 columns and reliable only for "now" (best of 5, one run).
* One run per cell: no repeat-to-repeat variance on quality (the harness is deterministic) and a single latency measurement.
* The real set was written by one person from one afternoon of captures; it has almost no meetings, mail or multi-day questions (next step in `docs/rag-next-improvements-handover.md`).
