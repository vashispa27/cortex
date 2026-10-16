# Fix 4: chunk boundaries and size (notes)

Grid run on the 122-question set before choosing the default (hybrid retrieval, all other settings as in
Fix 3). "bound" = boundary_fact questions answered in the final 8 (chunk hit@8 in brackets); "split" =
gold answers no single chunk contains whole (of 78 distinct answers).

| chunker | final hit@1 | final hit@8 | final MRR | chunk MRR | bound | split | chunks | near-dup slots |
|---|---|---|---|---|---|---|---|---|
| legacy (bytes, no overlap, plain cuts) | 69 | 91 | 0.7917 | 0.7463 | 0/5 (0) | 5 | 88 | 4.10% |
| bytes, boundary-aware | 71 | 96 | 0.8225 | 0.8016 | 5/5 (5) | 0 | 88 | 4.23% |
| bytes, overlap 10%, plain cuts | 71 | 95 | 0.8192 | 0.7963 | 4/5 (5) | 0 | 88 | 4.23% |
| bytes, overlap 10%, boundary-aware | 71 | 96 | 0.8225 | 0.8016 | 5/5 (5) | 0 | 88 | 4.23% |
| bytes, overlap 20%, boundary-aware | 71 | 96 | 0.8225 | 0.8016 | 5/5 (5) | 0 | 88 | 4.23% |
| chars, plain cuts | 69 | 91 | 0.7917 | 0.7513 | 0/5 (0) | 5 | 87 | 4.10% |
| **chars, boundary-aware (chosen)** | 71 | 96 | 0.8225 | 0.8066 | 5/5 (5) | 0 | 87 | 4.23% |
| chars, overlap 10%, boundary-aware | 71 | 96 | 0.8225 | 0.8066 | 5/5 (5) | 0 | 87 | 4.23% |
| chars, overlap 20%, boundary-aware | 71 | 96 | 0.8225 | 0.8066 | 5/5 (5) | 0 | 87 | 4.23% |

Chosen: characters, label/heading/Q&A-aware boundaries, no overlap. Boundary awareness alone repairs all
five planted straddles; overlap alone repairs 4 of 5 (it cannot help when the label is the last line and the
value alone overflows) and adds nothing once boundaries are aware, so it stays at 0 (the chunker supports
10/20% and refuses to cross a speaker marker; `--param chunk_overlap=`). Characters beat bytes only slightly
on this corpus (chunk MRR 0.8066 vs 0.8016): the one Hindi page fits one 1,600-character chunk now.
Costs: crowding 4.10% -> 4.23% of final slots (+1 slot of 804), index on disk unchanged (176 MB, dominated by
the base shard), chunk count 88 -> 87.

## Non-English
* Hindi page: legacy 3 chunks of 472 characters on average (1,190 bytes); default 1 chunk of 944 characters.
  A 1,600-character target now holds the same amount of text for Devanagari as for English. The danda
  (।) and CJK full stops are sentence ends in the default chunker, so a long Hindi paragraph can be split
  at sentence ends instead of staying one unbroken unit.
* q058 (English query, Hindi page): it does not fail in the 122-question runs in any mode (hybrid, dense_only,
  bm25_only all rank the Hindi page first), but the 61-question baseline had it fail. In every case the
  match arrives through the page's cookie/nav chunk and its derived topic and hour points, not through the
  recipe sentence, and `potion-base-32M` is an English-vocabulary embedder, so there is no evidence of
  cross-lingual semantic matching. Treat it as incidental. Cause of the earlier miss: ranking noise from
  English pages with the same distractor words, not chunk size (the answer chunk was retrievable at rank 2
  in the legacy run) and not the query language alone. Not fixable here without a multilingual embedder
  (needs the user's approval).

## Migration
No schema change and no `cleaner::VERSION` bump: the stored `chunks` rows keep their meaning
(`start_byte`/`end_byte` into the stored body, UTF-8 aligned). New snapshots are chunked with the new rules;
existing snapshots keep their old chunks until the user runs `open-memory capture --apply-cleaning`, which
re-chunks every stored body and rebuilds the vector index (that is theirs to run on their own data). A
live database can therefore hold both kinds of chunks; retrieval treats them identically.
