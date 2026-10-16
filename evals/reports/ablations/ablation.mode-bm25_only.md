# Retrieval eval: mode=bm25_only

- commit `12c3a3fae7` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 1600 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"bm25_only","now_ms":1792238400000}`
- corpus: 24 fixtures {"real_capture_invented_content":24} · gold: 61 evaluated of 61 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 35/55 (64%) |
| chunk | hit@5 | 45/55 (82%) |
| chunk | hit@8 | 46/55 (84%) |
| chunk | hit@10 | 46/55 (84%) |
| chunk | hit@40 | 46/55 (84%) |
| chunk | MRR / nDCG@10 | 0.712 / 0.7378 |
| final | hit@1 | 37/55 (67%) |
| final | hit@8 | 44/55 (80%) |
| final | MRR | 0.7288 |
| final | chunk found but lost by final stage | 2/55 (4%) |
| final | stale/wrong text above the answer | 2/8 (25%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 8/265 (3%) / 20/265 (8%) |
| derived | top-10 slots held by derived points | 138/360 (38%) |
| filters | filter excluded every relevant snapshot | 4/55 (7%) |
| filters | zero-result queries | 5/61 (8%) |
| abstention | absent queries that still returned results | 3/6 (50%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.5 / 0.7453 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 2/5 (40%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) |
| domain_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| filter_trap | 4 | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0.0 | 0/4 (0%) | 0/4 (0%) | 0.0 | 2/4 (50%) |
| keyword | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| near_duplicate_version | 5 | 2/5 (40%) | 5/5 (100%) | 5/5 (100%) | 0.575 | 3/5 (60%) | 4/5 (80%) | 0.7 | 0/5 (0%) |
| non_english | 4 | 3/4 (75%) | 3/4 (75%) | 3/4 (75%) | 0.75 | 3/4 (75%) | 3/4 (75%) | 0.75 | 0/4 (0%) |
| paraphrase | 7 | 4/7 (57%) | 6/7 (86%) | 6/7 (86%) | 0.6714 | 4/7 (57%) | 6/7 (86%) | 0.6905 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8333 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| time_scoped | 7 | 6/7 (86%) | 7/7 (100%) | 7/7 (100%) | 0.9286 | 5/7 (71%) | 6/7 (86%) | 0.7857 | 0/8 (0%) |

## Chunking

- 71 chunks over 23 snapshots; bytes mean 356.4648 / p50 143.0 / p95 1507.0 / max 1593.0
- answers split across chunks: 3/50 (6%)
- chars per chunk, English mean 332.087 vs non-English mean 471.5 (bytes 332.3043 vs 1190.0)
- chunks whose text also appears in another snapshot: 18/71 (25%)

## Cleaner

- planted facts surviving cleaning: 66/66 (100%)
- noise strings leaked into bodies: 27/105 (26%) (fixtures with any leak: 15/24 (62%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 884.9743 ms · query latency p50 5.7002 ms / p95 7.639 ms · index on disk 175733091 bytes
