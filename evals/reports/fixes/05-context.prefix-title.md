# Retrieval eval: prefix=title

- commit `2f66f80255` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512:prefix-title-v1` · cleaner v3 · chunking `{"target":1600,"chars":true,"overlap_pct":0,"boundaries":true}`
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"hybrid","now_ms":1792238400000,"app_filter":"phrase","app_fallback":"empty","app_fallback_ratio":0.75,"chunks_per_result":3,"abstain_score":0.0,"abstain_support":0.0,"abstain_dense":0.0,"abstain_chunk":0.0,"abstain_unseen":0.33,"abstain_unseen_sim":0.23,"abstain_ident":1.0,"abstain_time_support":0.25}`
- corpus: 36 fixtures {"hand_authored":12,"real_capture_invented_content":24} · gold: 124 evaluated of 124 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 70/102 (69%) |
| chunk | hit@5 | 95/102 (93%) |
| chunk | hit@8 | 98/102 (96%) |
| chunk | hit@10 | 99/102 (97%) |
| chunk | hit@40 | 101/102 (99%) |
| chunk | MRR / nDCG@10 | 0.7988 / 0.8287 |
| final | hit@1 | 71/102 (70%) |
| final | hit@8 | 96/102 (94%) |
| final | MRR | 0.8088 |
| final | chunk found but lost by final stage | 5/102 (5%) |
| final | stale/wrong text above the answer | 6/16 (38%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 33/812 (4%) / 48/812 (6%) |
| derived | top-10 slots held by derived points | 403/1113 (36%) |
| filters | filter excluded every relevant snapshot | 0/102 (0%) |
| filters | zero-result queries | 1/124 (1%) |
| abstention | absent queries that still returned results | 15/22 (68%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.6207 / 0.6697 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 21 (absent) | – | – | – | – | – | – | – | returned results: 15/21 (71%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| app_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 2/5 (40%) | 5/5 (100%) | 0.6167 | 0/5 (0%) |
| domain_scoped | 5 | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 0.85 | 4/5 (80%) | 5/5 (100%) | 0.9 | 0/5 (0%) |
| filter_trap | 15 | 11/15 (73%) | 15/15 (100%) | 15/15 (100%) | 0.8667 | 13/15 (87%) | 15/15 (100%) | 0.9333 | 0/15 (0%) |
| keyword | 8 | 8/8 (100%) | 8/8 (100%) | 8/8 (100%) | 1.0 | 7/8 (88%) | 8/8 (100%) | 0.9375 | 0/8 (0%) |
| multi_snapshot | 7 | 5/7 (71%) | 7/7 (100%) | 7/7 (100%) | 0.8095 | 3/7 (43%) | 6/7 (86%) | 0.6429 | 0/7 (0%) |
| near_duplicate_version | 8 | 4/8 (50%) | 8/8 (100%) | 8/8 (100%) | 0.7031 | 5/8 (62%) | 8/8 (100%) | 0.8125 | 0/8 (0%) |
| non_english | 6 | 5/6 (83%) | 5/6 (83%) | 5/6 (83%) | 0.8333 | 5/6 (83%) | 5/6 (83%) | 0.8333 | 0/6 (0%) |
| paraphrase | 12 | 5/12 (42%) | 11/12 (92%) | 12/12 (100%) | 0.6139 | 6/12 (50%) | 10/12 (83%) | 0.6528 | 0/12 (0%) |
| speaker | 8 | 7/8 (88%) | 8/8 (100%) | 8/8 (100%) | 0.9375 | 8/8 (100%) | 8/8 (100%) | 1.0 | 0/8 (0%) |
| time_scoped | 20 | 10/20 (50%) | 18/20 (90%) | 20/20 (100%) | 0.6533 | 12/20 (60%) | 18/20 (90%) | 0.7292 | 0/21 (0%) |

## Chunking

- 87 chunks over 35 snapshots; bytes mean 401.1149 / p50 184.0 / p95 1542.0 / max 2381.0
- answers split across chunks: 0/80 (0%)
- chars per chunk, English mean 377.5814 vs non-English mean 944.0 (bytes 378.093 vs 2381.0)
- chunks whose text also appears in another snapshot: 18/87 (21%)

## Cleaner

- planted facts surviving cleaning: 82/82 (100%)
- noise strings leaked into bodies: 51/151 (34%) (fixtures with any leak: 26/36 (72%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 1244.2633 ms · query latency p50 33.8738 ms / p95 90.7449 ms · index on disk 176145433 bytes
