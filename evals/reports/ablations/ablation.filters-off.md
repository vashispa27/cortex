# Retrieval eval: filters=off

- commit `017fce468f` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 1600 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":false,"use_rerank_bonus":true,"include_derived":true,"mode":"hybrid","now_ms":1792238400000}`
- corpus: 24 fixtures {"hand_authored":24} · gold: 59 evaluated of 59 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 31/54 (57%) |
| chunk | hit@5 | 46/54 (85%) |
| chunk | hit@8 | 48/54 (89%) |
| chunk | hit@10 | 50/54 (93%) |
| chunk | hit@40 | 50/54 (93%) |
| chunk | MRR / nDCG@10 | 0.7021 / 0.7454 |
| final | hit@1 | 34/54 (63%) |
| final | hit@8 | 43/54 (80%) |
| final | MRR | 0.7052 |
| final | chunk found but lost by final stage | 7/54 (13%) |
| final | stale/wrong text above the answer | 3/8 (38%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 21/472 (4%) / 39/472 (8%) |
| derived | top-10 slots held by derived points | 276/590 (47%) |
| filters | filter excluded every relevant snapshot | 0/54 (0%) |
| filters | zero-result queries | 0/59 (0%) |
| abstention | absent queries that still returned results | 5/5 (100%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.8185 / 0.9241 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 5/5 (100%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.7857 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 2/4 (50%) | 4/4 (100%) | 4/4 (100%) | 0.6607 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) |
| domain_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 2/4 (50%) | 4/4 (100%) | 0.75 | 0/4 (0%) |
| filter_trap | 4 | 2/4 (50%) | 4/4 (100%) | 4/4 (100%) | 0.75 | 3/4 (75%) | 3/4 (75%) | 0.75 | 0/4 (0%) |
| keyword | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| near_duplicate_version | 5 | 3/5 (60%) | 4/5 (80%) | 5/5 (100%) | 0.7222 | 3/5 (60%) | 4/5 (80%) | 0.7 | 0/5 (0%) |
| non_english | 4 | 1/4 (25%) | 3/4 (75%) | 3/4 (75%) | 0.5 | 2/4 (50%) | 2/4 (50%) | 0.5 | 0/4 (0%) |
| paraphrase | 7 | 3/7 (43%) | 6/7 (86%) | 7/7 (100%) | 0.6333 | 3/7 (43%) | 5/7 (71%) | 0.5714 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| time_scoped | 6 | 3/6 (50%) | 6/6 (100%) | 6/6 (100%) | 0.6389 | 2/6 (33%) | 4/6 (67%) | 0.4722 | 0/6 (0%) |

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

- ingest 756.7654 ms · query latency p50 5.4804 ms / p95 7.0236 ms · index on disk 175127117 bytes
