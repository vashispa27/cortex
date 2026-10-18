# Fix 7: versions of the same page (notes)

Two mechanisms, `crates/rewind/src/versions.rs`, applied after ranking and before the cut to 8:

1. **Collapse near-identical results** (`dedup_jaccard`, default 0.9): two results become one only when they share the
   same numbers, capitalised words (names, months, weekdays) and negations *and* have word-set Jaccard overlap above the
   threshold. The representative is the better match to the question, then the newer snapshot; the other is kept as a
   pointer (`Hit::versions`, printed by `ask` as "Other captured versions of this page"). Unit tests prove a changed
   amount, date, name, weekday, negation or contraction is never merged.
2. **Order the remaining versions** (`version_order`, `version_margin`): snapshots with the same app, title and URL are
   permuted among the slots they already occupy, newest first by default and for now/current/latest/revised/updated,
   oldest first for original/before/previous/first. Only versions whose normalised scores are within 0.3 of each other
   are reordered.

## Measured (124 questions, vs Fix 6)
| | Fix 6 | Fix 7 |
|---|---|---|
| final hit@1 | 77 | 82 (paired CI [0.000, +0.098] of 102: borderline) |
| final hit@8 | 98 | 98 |
| final MRR | 0.852 | 0.877 (CI [0.000, +0.049]) |
| near_duplicate_version final hit@1 | 5/8 | 7/8 |
| stale/wrong text ranked above the answer | 5/16 | 1/16 |
| near-duplicate slots (Jaccard >= 0.8) | 24/767 | 24/767 |
| near_duplicate_version chunk hit@1 | 4/8 | 4/8 |

The ordering is where the gain comes from (7 queries change; q025, q051, q088, q102 stop ranking the stale version
first). The interval touches zero, so treat it as likely real but not proven at this size.

## What did not move, and why
* Crowding did not fall and chunk-level hit@1 did not rise: no pair of results in this corpus is mergeable. The budget,
  roofing and garden pairs differ in amounts, dates or content, which the spec says must stay distinct, and the collapse
  works on results, not on the chunk list. `dedup_jaccard` 0.5 / 0.7 / 0.9 and 0 give identical reports, so 0.9 is the
  conservative pick, backed by unit tests rather than by the eval.
* Identical chunk text is still stored once per snapshot (57-71% of chunks in edited/scrolled pages). Sharing chunk
  points across snapshots would change the index layout and payload semantics (per-snapshot `last_seen`, spans), so only
  retrieval-time collapse was done; the idea is recorded here, not implemented.

## Low-priority decisions measured on the 124-question set
* `rerank_bonus=off`: final hit@1 +0.069, CI [-0.010, +0.147], hit@8 unchanged, 17 queries change order. Within noise,
  so the bonus stays (the rule was to remove it only if the interval supports it).
