# Retrieval eval: rerank_bonus=off

- commit `017fce468f` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 1600 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":false,"include_derived":true,"mode":"hybrid","now_ms":1792238400000}`
- corpus: 24 fixtures {"hand_authored":24} · gold: 59 evaluated of 59 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 30/54 (56%) |
| chunk | hit@5 | 43/54 (80%) |
| chunk | hit@8 | 44/54 (81%) |
| chunk | hit@10 | 46/54 (85%) |
| chunk | hit@40 | 46/54 (85%) |
| chunk | MRR / nDCG@10 | 0.6686 / 0.7023 |
| final | hit@1 | 36/54 (67%) |
| final | hit@8 | 40/54 (74%) |
| final | MRR | 0.7006 |
| final | chunk found but lost by final stage | 6/54 (11%) |
| final | stale/wrong text above the answer | 2/8 (25%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 14/375 (4%) / 30/375 (8%) |
| derived | top-10 slots held by derived points | 170/487 (35%) |
| filters | filter excluded every relevant snapshot | 4/54 (7%) |
| filters | zero-result queries | 2/59 (3%) |
| abstention | absent queries that still returned results | 5/5 (100%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.8635 / 0.8635 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 5/5 (100%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.7857 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| app_scoped | 4 | 2/4 (50%) | 4/4 (100%) | 4/4 (100%) | 0.7083 | 2/4 (50%) | 3/4 (75%) | 0.625 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) |
| domain_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| filter_trap | 4 | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0.0 | 0/4 (0%) | 0/4 (0%) | 0.0 | 2/4 (50%) |
| keyword | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| near_duplicate_version | 5 | 3/5 (60%) | 4/5 (80%) | 5/5 (100%) | 0.7222 | 3/5 (60%) | 4/5 (80%) | 0.7 | 0/5 (0%) |
| non_english | 4 | 1/4 (25%) | 3/4 (75%) | 3/4 (75%) | 0.5 | 2/4 (50%) | 2/4 (50%) | 0.5 | 0/4 (0%) |
| paraphrase | 7 | 3/7 (43%) | 6/7 (86%) | 7/7 (100%) | 0.6333 | 4/7 (57%) | 5/7 (71%) | 0.619 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| time_scoped | 6 | 4/6 (67%) | 6/6 (100%) | 6/6 (100%) | 0.8056 | 5/6 (83%) | 5/6 (83%) | 0.8333 | 0/6 (0%) |

## Chunking

- 83 chunks over 23 snapshots; bytes mean 355.6747 / p50 153.0 / p95 1507.0 / max 1593.0
- answers split across chunks: 3/50 (6%)
- chars per chunk, English mean 328.8625 vs non-English mean 418.0 (bytes 329.0875 vs 1064.6667)
- chunks whose text also appears in another snapshot: 24/83 (29%)

## Cleaner

- planted facts surviving cleaning: 66/66 (100%)
- noise strings leaked into bodies: 36/105 (34%) (fixtures with any leak: 16/24 (67%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 756.7654 ms · query latency p50 9.8193 ms / p95 12.487 ms · index on disk 175127117 bytes
