# Retrieval eval: chunk_target=3200

- commit `9eb3aca58b` · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 3200 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"hybrid","now_ms":1792238400000}`
- corpus: 24 fixtures {"hand_authored":24} · gold: 61 evaluated of 61 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 34/55 (62%) |
| chunk | hit@5 | 47/55 (85%) |
| chunk | hit@8 | 48/55 (87%) |
| chunk | hit@10 | 50/55 (91%) |
| chunk | hit@40 | 50/55 (91%) |
| chunk | MRR / nDCG@10 | 0.7322 / 0.7647 |
| final | hit@1 | 36/55 (65%) |
| final | hit@8 | 44/55 (80%) |
| final | MRR | 0.7197 |
| final | chunk found but lost by final stage | 6/55 (11%) |
| final | stale/wrong text above the answer | 2/8 (25%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 15/388 (4%) / 27/388 (7%) |
| derived | top-10 slots held by derived points | 175/504 (35%) |
| filters | filter excluded every relevant snapshot | 4/55 (7%) |
| filters | zero-result queries | 2/61 (3%) |
| abstention | absent queries that still returned results | 6/6 (100%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.783 / 0.9214 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 5/5 (100%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.7857 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 2/4 (50%) | 4/4 (100%) | 4/4 (100%) | 0.75 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 3/3 (100%) | 3/3 (100%) | 0.5 | 0/3 (0%) | 1/3 (33%) | 0.1667 | 0/3 (0%) |
| domain_scoped | 4 | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) | 1.0 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| filter_trap | 4 | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0.0 | 0/4 (0%) | 0/4 (0%) | 0.0 | 2/4 (50%) |
| keyword | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| near_duplicate_version | 5 | 3/5 (60%) | 4/5 (80%) | 5/5 (100%) | 0.7222 | 3/5 (60%) | 4/5 (80%) | 0.7 | 0/5 (0%) |
| non_english | 4 | 3/4 (75%) | 3/4 (75%) | 3/4 (75%) | 0.75 | 3/4 (75%) | 3/4 (75%) | 0.75 | 0/4 (0%) |
| paraphrase | 7 | 3/7 (43%) | 6/7 (86%) | 7/7 (100%) | 0.6333 | 3/7 (43%) | 5/7 (71%) | 0.5714 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| time_scoped | 7 | 5/7 (71%) | 7/7 (100%) | 7/7 (100%) | 0.8333 | 5/7 (71%) | 6/7 (86%) | 0.7619 | 0/8 (0%) |

## Chunking

- 78 chunks over 23 snapshots; bytes mean 378.5385 / p50 153.0 / p95 1685.0 / max 3196.0
- answers split across chunks: 0/50 (0%)
- chars per chunk, English mean 341.7143 vs non-English mean 1256.0 (bytes 341.9481 vs 3196.0)
- chunks whose text also appears in another snapshot: 24/78 (31%)

## Cleaner

- planted facts surviving cleaning: 66/66 (100%)
- noise strings leaked into bodies: 35/105 (33%) (fixtures with any leak: 15/24 (62%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 861.7451 ms · query latency p50 9.093 ms / p95 13.7476 ms · index on disk 175118796 bytes
