# Retrieval eval: app_filter=legacy

- commit `6391653d7a` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 1600 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"hybrid","now_ms":1792238400000,"app_filter":"legacy","app_fallback":"empty","app_fallback_ratio":0.75}`
- corpus: 36 fixtures {"hand_authored":12,"real_capture_invented_content":24} · gold: 122 evaluated of 122 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 57/100 (57%) |
| chunk | hit@5 | 81/100 (81%) |
| chunk | hit@8 | 83/100 (83%) |
| chunk | hit@10 | 84/100 (84%) |
| chunk | hit@40 | 87/100 (87%) |
| chunk | MRR / nDCG@10 | 0.6763 / 0.7063 |
| final | hit@1 | 59/100 (59%) |
| final | hit@8 | 79/100 (79%) |
| final | MRR | 0.6817 |
| final | chunk found but lost by final stage | 8/100 (8%) |
| final | stale/wrong text above the answer | 5/16 (31%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 36/825 (4%) / 53/825 (6%) |
| derived | top-10 slots held by derived points | 380/1044 (36%) |
| filters | filter excluded every relevant snapshot | 7/100 (7%) |
| filters | zero-result queries | 1/122 (1%) |
| abstention | absent queries that still returned results | 21/22 (95%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.646 / 0.6248 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 21 (absent) | – | – | – | – | – | – | – | returned results: 20/21 (95%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8333 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 5 | 0/5 (0%) | 0/5 (0%) | 0/5 (0%) | 0.0 | 0/5 (0%) | 0/5 (0%) | 0.0 | 0/5 (0%) |
| domain_scoped | 5 | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 0.9 | 4/5 (80%) | 5/5 (100%) | 0.9 | 0/5 (0%) |
| filter_trap | 15 | 6/15 (40%) | 9/15 (60%) | 9/15 (60%) | 0.5 | 7/15 (47%) | 9/15 (60%) | 0.5333 | 0/15 (0%) |
| keyword | 8 | 8/8 (100%) | 8/8 (100%) | 8/8 (100%) | 1.0 | 7/8 (88%) | 8/8 (100%) | 0.9375 | 0/8 (0%) |
| multi_snapshot | 7 | 4/7 (57%) | 6/7 (86%) | 6/7 (86%) | 0.6395 | 3/7 (43%) | 6/7 (86%) | 0.6429 | 0/7 (0%) |
| near_duplicate_version | 8 | 4/8 (50%) | 8/8 (100%) | 8/8 (100%) | 0.6845 | 5/8 (62%) | 7/8 (88%) | 0.75 | 0/8 (0%) |
| non_english | 6 | 4/6 (67%) | 5/6 (83%) | 5/6 (83%) | 0.75 | 5/6 (83%) | 5/6 (83%) | 0.8333 | 0/6 (0%) |
| paraphrase | 12 | 6/12 (50%) | 11/12 (92%) | 12/12 (100%) | 0.655 | 5/12 (42%) | 8/12 (67%) | 0.5278 | 0/12 (0%) |
| speaker | 6 | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 0.8889 | 6/6 (100%) | 6/6 (100%) | 1.0 | 0/6 (0%) |
| time_scoped | 20 | 10/20 (50%) | 17/20 (85%) | 20/20 (100%) | 0.6576 | 11/20 (55%) | 17/20 (85%) | 0.6792 | 0/21 (0%) |

## Chunking

- 88 chunks over 35 snapshots; bytes mean 394.5455 / p50 182.0 / p95 1550.0 / max 1593.0
- answers split across chunks: 5/78 (6%)
- chars per chunk, English mean 375.5349 vs non-English mean 471.5 (bytes 376.0465 vs 1190.0)
- chunks whose text also appears in another snapshot: 18/88 (20%)

## Cleaner

- planted facts surviving cleaning: 82/82 (100%)
- noise strings leaked into bodies: 51/151 (34%) (fixtures with any leak: 26/36 (72%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 1365.2068 ms · query latency p50 9.735 ms / p95 15.7492 ms · index on disk 176087822 bytes
