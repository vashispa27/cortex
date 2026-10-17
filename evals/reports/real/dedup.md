# Ingest-time deduplication: measured on the real corpus (aggregates only)

Same 1,385 real snapshots (3,532 sightings) and 125 real questions (99 answerable) as `transfer.md`; release build of the
tree that adds `crates/open-memory/src/dedup.rs`. Each row is one full eval run with the layers named switched on or off
(`OPEN_MEMORY_NO_INGEST_DEDUP`, `OPEN_MEMORY_NO_NEAR_DUP_MERGE`, `OPEN_MEMORY_CHUNK_SHARING`). Differences of 2–3 questions are noise.

| configuration | snapshots | chunks | vector points | ingest | final hit@1 | final hit@8 | answer in chunk list but lost | query p50 |
|---|---|---|---|---|---|---|---|---|
| all dedup off (previous behaviour) | 1,385 | 5,262 | 6,434 | 45 s | 43 | 72 | 13 | 73 ms |
| layers 2+3: same-tree skip + near-identical merge (**default**) | 1,092 (−21%) | 4,182 (−21%) | 5,353 (−17%) | 36 s | 44 | 71 | 13 | 84 ms |
| layer 4 only: shared chunk points | 1,385 | 5,262 | 4,075 (−37%) | 43 s | 43 | 67 | 18 | 188 ms |
| layers 2+3+4 | 1,092 | 4,182 | 3,739 (−42%) | 35 s | 43 | 66 | 20 | 178 ms |

Invented corpus (36 pages): identical results with and without (hit@1 82/102, hit@8 98/102; 9 chunks share a point).

* **Layer 2 (same tree)**: an unchanged Accessibility tree (text, names, ancestor path; bounds and visibility ignored) is not cleaned,
  stored or embedded again. Pure optimisation, no change in results by construction.
* **Layer 3 (near-identical page)**: a new capture of the same app/URL/title within six hours, with word overlap ≥ 0.9 and identical
  numbers, capitalised words and negations (`versions::mergeable`), is another sighting of the latest matching snapshot. A changed amount or
  date is never merged (unit-tested). Cost on real data: hit@8 −1 (noise).
* **Layer 4 (shared chunk points)**: implemented and tested, **off by default**. It removes 37% of vector points but costs 4–5 questions
  at hit@8 and about 2.5x query latency: every shared point expands to all snapshots that hold the text, so far more candidates reach the
  pairwise comparison of `versions::apply`, and results carry more chunks than the 2,500-character evidence cap can show (the answer chunk
  is cut off). Two evidence-cap variants were tried (drop weakest chunks; best-scored chunks first) and neither helped, so both were reverted.
  It needs a cap on the expansion and a cheaper `versions::apply` before it can be on by default.

Not done: step 5 (normalising volatile text such as counters and relative times before hashing), removing the raw Accessibility trees,
`cleaning_trace_json`, or truncating the Qdrant write-ahead log.

## Step 5 (ignore volatile text when comparing) measured, not built

`evals/tools/volatile_gain.py` replays the 1,385 real snapshots through the ingest rule (it reproduces production: 1,094 survivors vs 1,092
in the real run) and adds, in turn, title normalisation (counters like `(2)`, `High memory usage` and `Audio playing` suffixes, which fire on
972 titles) and masking of relative times, notification counts and view/like counters in the bodies (which fire on thousands of bodies).

| rule set | snapshots merged away |
|---|---|
| as shipped | 291 (21.0%) |
| + title normalisation | 295 (21.3%) |
| + volatile body masking | 295 (21.3%) |

Gain: 4 more snapshots (0.3 points), 1 of them from body masking. No gold answer lives only in a snapshot that would be dropped. Not worth
the added risk, so it is not built. The remaining near-copies are different pages in substance: of 146 kept snapshots with a same-page
predecessor at word overlap ≥ 0.9, 83 differ by six or more numbers or names (a chat or document that grew) and only 17 differ in numbers alone.
