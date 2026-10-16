# Retrieval eval: mode=dense_only

- commit `12c3a3fae7` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 1600 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"dense_only","now_ms":1792238400000}`
- corpus: 24 fixtures {"real_capture_invented_content":24} · gold: 61 evaluated of 61 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 30/55 (55%) |
| chunk | hit@5 | 44/55 (80%) |
| chunk | hit@8 | 45/55 (82%) |
| chunk | hit@10 | 46/55 (84%) |
| chunk | hit@40 | 48/55 (87%) |
| chunk | MRR / nDCG@10 | 0.6599 / 0.6921 |
| final | hit@1 | 34/55 (62%) |
| final | hit@8 | 41/55 (75%) |
| final | MRR | 0.6742 |
| final | chunk found but lost by final stage | 7/55 (13%) |
| final | stale/wrong text above the answer | 1/8 (12%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 10/388 (3%) / 25/388 (6%) |
| derived | top-10 slots held by derived points | 166/504 (33%) |
| filters | filter excluded every relevant snapshot | 4/55 (7%) |
| filters | zero-result queries | 2/61 (3%) |
| abstention | absent queries that still returned results | 6/6 (100%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.5 / 0.6494 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 5/5 (100%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.7917 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 2/4 (50%) | 4/4 (100%) | 4/4 (100%) | 0.75 | 2/4 (50%) | 3/4 (75%) | 0.625 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) |
| domain_scoped | 4 | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) | 1.0 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| filter_trap | 4 | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0.0 | 0/4 (0%) | 0/4 (0%) | 0.0 | 2/4 (50%) |
| keyword | 5 | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 0.85 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8333 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| near_duplicate_version | 5 | 2/5 (40%) | 4/5 (80%) | 5/5 (100%) | 0.6222 | 4/5 (80%) | 4/5 (80%) | 0.8 | 0/5 (0%) |
| non_english | 4 | 2/4 (50%) | 3/4 (75%) | 4/4 (100%) | 0.6318 | 2/4 (50%) | 2/4 (50%) | 0.5 | 0/4 (0%) |
| paraphrase | 7 | 2/7 (29%) | 6/7 (86%) | 7/7 (100%) | 0.5459 | 3/7 (43%) | 5/7 (71%) | 0.5476 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| time_scoped | 7 | 5/7 (71%) | 7/7 (100%) | 7/7 (100%) | 0.8333 | 5/7 (71%) | 6/7 (86%) | 0.7857 | 0/8 (0%) |

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

- ingest 884.9743 ms · query latency p50 8.1983 ms / p95 9.9116 ms · index on disk 175733091 bytes
