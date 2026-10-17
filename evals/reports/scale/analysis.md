# Scale test: what happens when the index gets bigger

Aggregates only (no text from the real data). Tables: `tables-invented.md`, `tables-real.md` (from `evals/scale/summarize.py`).
Code measured: the fixes agent's `a075fe0` (Fixes 1–7) plus the additive eval options, release build, **before** the ingest dedup layers
(`c8ab98d`) and the raw-tree purge (`06ee2a6`). Distractors come from `evals/scale/gen_distractors.py` (invented, deterministic, never
containing a gold answer) and from the author's own real snapshots.

## What was run

| gold set | extra pages added to the index | what they are |
|---|---|---|
| invented (102 answerable) | none | the 36 invented pages |
| | 429 "hard" pages | clones of each answer's page with every number, name, weekday and month changed, observed within hours of the original |
| | 1,340 real snapshots | the haystack the user actually captured (45 that contain an invented answer excluded) |
| | 1,000 topical pages (+ re-captured, scrolled and edited variants, 1,450 sightings) | invented text in the same topics as the gold questions |
| | 10,000 topical pages (16,672 sightings) | same generator, 13,343 snapshots in the index |
| real (99 answerable) | none | the 1,385 real snapshots |
| | 1,000 topical pages | invented |
| | 833 mutated real snapshots | numbers, names, weekdays and months swapped |

Not run: +100k (hours of ingest on this machine, skipped), 10k plus the hard set, real gold plus 10k, and a run with Fix 7 switched off at
scale. 10k snapshots is 1/16 of the spec's workload (about 2,400 snapshots a day for 90 days = 216,000).
All timings are indicative: the Mac was swapping and stalled whenever no command was active. The `best-of` figure (fastest of five repeats
per query) is the most robust.

## 1. Quality degrades first, and fast

Invented questions (102 answerable):

| index | snapshots | final hit@1 | final hit@8 | MRR | answer in top-40 chunks | absent still answered | final slots held by extra pages |
|---|---|---|---|---|---|---|---|
| base | 36 | 82 | 98 | 0.877 | 101 | 12/22 | 0% |
| + hard distractors | 456 | 28 | 59 | 0.367 | 92 | 18/22 | 89% |
| + real snapshots | 1,376 | 72 | 87 | 0.775 | 97 | 16/22 | 64% |
| + 1k topical | 1,328 | 52 | 74 | 0.576 | 85 | 18/22 | 81% |
| + 10k topical | 13,343 | 45 | 62 | 0.488 | 73 | 18/22 | 88% |

Real questions (99 answerable):

| index | snapshots | final hit@1 | final hit@8 | MRR | answer in top-40 chunks | absent still answered |
|---|---|---|---|---|---|---|
| base | 1,385 | 43 | 72 | 0.541 | 84 | 21/26 |
| + 1k topical | 2,677 | 40 | 65 | 0.489 | 83 | 23/26 |
| + 833 mutated real | 2,043 | 43 | 66 | 0.521 | 84 | 24/26 |

* The first thing to break is **hit@1 and hit@8 once a few hundred look-alike pages exist**, not size as such: 429 hard look-alikes cost 39 points of
  hit@8; 1,340 unrelated-but-real pages cost 11; 1,000 same-topic pages cost 24; 10,000 cost 36. On the real set, 1,000 same-topic invented pages cost 7 questions.
* At +10k the answer is not even in the top-40 chunk list for 29 of 102 questions, so the loss is recall, not only ordering. A page that is not the answer ranked
  above the found answer for 27% of the answerable questions that were still found (28% at +1k).
* Abstention erodes: absent questions that still return results go from 12/22 to 18/22 on invented and 21/26 to 24/26 on real. More pages give every
  query something that looks like support.
* Hard distractors are the worst case (same facts, different numbers); they are a stress test, not typical use. The real-snapshot haystack is the
  more realistic number.

**Which question types suffer** (invented, hit@8, base → +10k): boundary facts 5 → 0 (the generated pages bury them; with the real haystack 4/5), keyword 8 → 5,
multi-snapshot 7 → 3, paraphrase 10 → 6 (3/12 with the hard set), filter traps 15 → 9, time-scoped 19 → 14, app-scoped 4 → 2, domain-scoped 5 → 3,
near-duplicate versions 8 → 6, speaker 8 → 6; non-English holds (5/6). On real data (+1k): paraphrase 12 → 10 of 19, keyword 7 → 6, multi-snapshot 3 → 2,
terminal output 3 → 2; speaker, table and time-scoped questions hold.

**Scale against the fixes.** The largest single fix (Fix 2, more than one chunk per result) was worth about +8 questions at hit@8 on real data and +5 on invented.
1,000 same-topic pages cost 7 (real) to 24 (invented) questions, and 10,000 cost 36 on invented. At this size, **scale hurts more than any one fix helps**; only near-duplicate
collapsing plus removing the keyword rerank bonus (hit@1 +15 points on real, +11 on invented, see `transfer.md`) are in the same range.

## 2. Latency grows with the index, and Fix 7 adds a large constant

Query latency (milliseconds, fastest of 5 repeats per query):

| index | p50 | p95 |
|---|---|---|
| invented base (36 snapshots) | 7.9 | 22.8 |
| + hard (456) | 21.8 | 74.0 |
| + real (1,376) | 92.3 | 241.7 |
| + 1k topical (1,328) | 156.8 | 349.2 |
| + 10k topical (13,343) | 271.6 | 905.0 (p99 about 1.9 s) |
| real base (1,385) | 72.9 | 159.6 |
| real + 1k topical (2,677) | 100.4 | 207.0 |

* Fix 7 (`versions::apply`) compares every pair of up to 40 candidate snapshots by full-body word sets. On the 36-page corpus alone it
  made p50 go from 1.8 ms (Fix 6) to 11.5 ms. Its cost scales with body size and number of candidates, not with index size.
* Latency still grows from 157 ms at 1.3k snapshots to 272 ms at 13k. I did not split this between Fix 7 on bigger bodies (the synthetic
  pages are bigger than the invented ones), the per-candidate SQLite reads of full bodies, and the Qdrant search itself, because the run with
  Fix 7 off at scale never finished. This needs profiling (`docs/rag-latency-fix-agent-prompt.md`).
* Ingest: 76 snapshots/s on the real set, 39–57 /s at 1–2k pages, 21.5/s at 13k (775 s for 16,672 sightings; most of the CPU is fsync from per-snapshot Qdrant
  flushes). At 216k snapshots that is about 3 hours at the 10k rate.
* Peak memory is not a product measurement here: the harness holds the whole base corpus (823 MB at 10k invented; 4–5 GB when the base is the real corpus).
  Production RAM was not measured. Dense vectors are memory-mapped at 2 KB each, about 2.1 GB at 1.06M points.

## 3. Disk: where the bytes go

The old baseline (176 MB for 71 chunks over 23 snapshots) was the sum of **apparent** file sizes. Qdrant Edge preallocates 32 MiB files
(WAL segments, vector chunks, BM25 and payload pages); a tiny index has only about 7 MB actually allocated. Real index of the live database: 194 MB apparent, 86 MB
allocated.

At +10k (13,343 snapshots, 73,069 vector points), allocated bytes:

| part | size | note |
|---|---|---|
| Qdrant: WAL segments | 772 MB (77% of 1,008 MB) | 24 files of 33.6 MB, never truncated; one new segment per ~10,100 operations |
| Qdrant: dense vectors | 150 MB | 512 floats = 2 KB per point |
| Qdrant: BM25 + payload | 47 + 36 MB | |
| SQLite | 1,343 MB | raw Accessibility trees stored twice (`snapshots` and `raw_versions`) = 1,044 MB (78%); trace 70 MB; bodies 81 MB; chunk bodies 81 MB |

* Segments cost about **3.2 KB per vector point** (2 KB dense, about 0.65 KB BM25, about 0.5 KB payload). Per snapshot on real data (4.9 points per snapshot): about 16 KB.
* The live database: 683 MB for 1,427 snapshots, **94% raw trees** (644 MB); without them about 28 KB per snapshot.

Extrapolation to 216,000 snapshots (estimates from the ratios above, not measured at that size):

| | with today's storage | after the raw-tree purge (`06ee2a6`) and a WAL cap |
|---|---|---|
| SQLite | about 100 GB (480 KB per snapshot) | about 6 GB |
| Qdrant segments | about 3.5 GB | about 3.5 GB (about 2.0 GB after the 21% snapshot dedup of `c8ab98d`, before layer 4) |
| Qdrant WAL | roughly 10–13 GB (about 1.8 segments per 1,000 snapshots) | a few hundred MB if truncated |

## 4. Answers to the questions in the task

* **Which metrics degrade first, at what N?** Hit@1/hit@8 and abstention, from a few hundred look-alike pages (hard set: −39 points at 456 snapshots);
  same-topic pages −24 points at ~1.3k, −36 at ~13k. Latency is next (p50 8 → 157 ms by 1.3k snapshots, 272 ms at 13k). Disk is the third and the cheapest to fix.
* **Which question types suffer?** Keyword, multi-snapshot, paraphrase, filter-trap, time-scoped, app/domain-scoped and boundary facts (above).
* **Does latency or disk become a problem?** Both, at the spec's size: latency is already 0.1–0.3 s at 1–13k snapshots with no profiling done; disk would be
  about 100 GB of raw trees plus 10+ GB of WAL.
* **Size per chunk:** about 3.2 KB per vector point in segments; the 176 MB figure was preallocation, and retained WAL is the largest real cost in the vector store.

## Recommendations (not applied by this work)

1. Cut query latency: compute word sets once per query, compare only the top candidates, drop the keyword rerank bonus (also +11 to +15 points hit@1), then profile the rest.
2. Cap or truncate the Qdrant WAL after flush.
3. Keep raw trees for 7 days (done) and stop storing them twice; drop `cleaning_trace_json`; stop storing chunk text in both `snapshots.body` and `chunks.body` if the chunk rows can be derived.
4. Coalesce near-identical captures at ingest (done for the safe cases) and share identical chunk points (built, off by default: needs a cap on the expansion and a cheaper
   `versions::apply`).
5. Re-run this series, and a 100k point, after 1 and 2, on a machine that is not swapping.
