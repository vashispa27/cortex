# Retrieval eval: chunk_target=800

- commit `12c3a3fae7` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 800 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"hybrid","now_ms":1792238400000}`
- corpus: 24 fixtures {"real_capture_invented_content":24} · gold: 61 evaluated of 61 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 30/55 (55%) |
| chunk | hit@5 | 48/55 (87%) |
| chunk | hit@8 | 48/55 (87%) |
| chunk | hit@10 | 50/55 (91%) |
| chunk | hit@40 | 51/55 (93%) |
| chunk | MRR / nDCG@10 | 0.6923 / 0.7379 |
| final | hit@1 | 34/55 (62%) |
| final | hit@8 | 42/55 (76%) |
| final | MRR | 0.6864 |
| final | chunk found but lost by final stage | 9/55 (16%) |
| final | stale/wrong text above the answer | 2/8 (25%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 11/388 (3%) / 26/388 (7%) |
| derived | top-10 slots held by derived points | 167/514 (32%) |
| filters | filter excluded every relevant snapshot | 4/55 (7%) |
| filters | zero-result queries | 2/61 (3%) |
| abstention | absent queries that still returned results | 6/6 (100%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.7138 / 0.9544 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 5/5 (100%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8333 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 3/3 (100%) | 3/3 (100%) | 0.5 | 0/3 (0%) | 1/3 (33%) | 0.1667 | 0/3 (0%) |
| domain_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| filter_trap | 4 | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0.0 | 0/4 (0%) | 0/4 (0%) | 0.0 | 2/4 (50%) |
| keyword | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| near_duplicate_version | 5 | 1/5 (20%) | 4/5 (80%) | 5/5 (100%) | 0.5222 | 3/5 (60%) | 4/5 (80%) | 0.7 | 0/5 (0%) |
| non_english | 4 | 2/4 (50%) | 3/4 (75%) | 4/4 (100%) | 0.6324 | 2/4 (50%) | 2/4 (50%) | 0.5 | 0/4 (0%) |
| paraphrase | 7 | 3/7 (43%) | 6/7 (86%) | 7/7 (100%) | 0.6214 | 3/7 (43%) | 5/7 (71%) | 0.5714 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8333 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| time_scoped | 7 | 4/7 (57%) | 7/7 (100%) | 7/7 (100%) | 0.7381 | 4/7 (57%) | 5/7 (71%) | 0.6429 | 0/8 (0%) |

## Chunking

- 84 chunks over 23 snapshots; bytes mean 301.1429 / p50 193.0 / p95 789.0 / max 796.0
- answers split across chunks: 0/50 (0%)
- chars per chunk, English mean 286.2875 vs non-English mean 235.25 (bytes 286.475 vs 594.5)
- chunks whose text also appears in another snapshot: 18/84 (21%)

## Cleaner

- planted facts surviving cleaning: 66/66 (100%)
- noise strings leaked into bodies: 27/105 (26%) (fixtures with any leak: 15/24 (62%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 873.9485 ms · query latency p50 8.8019 ms / p95 12.515 ms · index on disk 175733388 bytes
