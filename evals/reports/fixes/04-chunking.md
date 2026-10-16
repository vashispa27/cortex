# Retrieval eval: base

- commit `3f2e0a9957` (dirty) · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunking `{"target":1600,"chars":true,"overlap_pct":0,"boundaries":true}`
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":true,"mode":"hybrid","now_ms":1792238400000,"app_filter":"phrase","app_fallback":"empty","app_fallback_ratio":0.75,"chunks_per_result":3,"abstain_score":0.0,"abstain_support":0.0,"abstain_dense":0.0,"abstain_chunk":0.0,"abstain_unseen":0.33,"abstain_unseen_sim":0.23,"abstain_ident":1.0,"abstain_time_support":0.25}`
- corpus: 36 fixtures {"hand_authored":12,"real_capture_invented_content":24} · gold: 122 evaluated of 122 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 71/100 (71%) |
| chunk | hit@5 | 93/100 (93%) |
| chunk | hit@8 | 96/100 (96%) |
| chunk | hit@10 | 96/100 (96%) |
| chunk | hit@40 | 99/100 (99%) |
| chunk | MRR / nDCG@10 | 0.8066 / 0.8339 |
| final | hit@1 | 71/100 (71%) |
| final | hit@8 | 96/100 (96%) |
| final | MRR | 0.8225 |
| final | chunk found but lost by final stage | 3/100 (3%) |
| final | stale/wrong text above the answer | 6/16 (38%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 34/804 (4%) / 50/804 (6%) |
| derived | top-10 slots held by derived points | 432/1093 (40%) |
| filters | filter excluded every relevant snapshot | 0/100 (0%) |
| filters | zero-result queries | 1/122 (1%) |
| abstention | absent queries that still returned results | 15/22 (68%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.7162 / 0.6714 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 21 (absent) | – | – | – | – | – | – | – | returned results: 15/21 (71%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8333 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| boundary_fact | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 2/5 (40%) | 5/5 (100%) | 0.6167 | 0/5 (0%) |
| domain_scoped | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 4/5 (80%) | 5/5 (100%) | 0.9 | 0/5 (0%) |
| filter_trap | 15 | 12/15 (80%) | 15/15 (100%) | 15/15 (100%) | 0.9 | 13/15 (87%) | 15/15 (100%) | 0.9333 | 0/15 (0%) |
| keyword | 8 | 8/8 (100%) | 8/8 (100%) | 8/8 (100%) | 1.0 | 7/8 (88%) | 8/8 (100%) | 0.9375 | 0/8 (0%) |
| multi_snapshot | 7 | 5/7 (71%) | 7/7 (100%) | 7/7 (100%) | 0.7823 | 4/7 (57%) | 7/7 (100%) | 0.7857 | 0/7 (0%) |
| near_duplicate_version | 8 | 4/8 (50%) | 8/8 (100%) | 8/8 (100%) | 0.6845 | 5/8 (62%) | 8/8 (100%) | 0.8125 | 0/8 (0%) |
| non_english | 6 | 5/6 (83%) | 5/6 (83%) | 5/6 (83%) | 0.8333 | 5/6 (83%) | 5/6 (83%) | 0.8333 | 0/6 (0%) |
| paraphrase | 12 | 6/12 (50%) | 11/12 (92%) | 12/12 (100%) | 0.655 | 6/12 (50%) | 10/12 (83%) | 0.6528 | 0/12 (0%) |
| speaker | 6 | 5/6 (83%) | 6/6 (100%) | 6/6 (100%) | 0.8889 | 6/6 (100%) | 6/6 (100%) | 1.0 | 0/6 (0%) |
| time_scoped | 20 | 10/20 (50%) | 18/20 (90%) | 20/20 (100%) | 0.6589 | 13/20 (65%) | 19/20 (95%) | 0.7792 | 0/21 (0%) |

## Chunking

- 87 chunks over 35 snapshots; bytes mean 399.092 / p50 184.0 / p95 1542.0 / max 2381.0
- answers split across chunks: 0/78 (0%)
- chars per chunk, English mean 375.5349 vs non-English mean 944.0 (bytes 376.0465 vs 2381.0)
- chunks whose text also appears in another snapshot: 18/87 (21%)

## Cleaner

- planted facts surviving cleaning: 82/82 (100%)
- noise strings leaked into bodies: 51/151 (34%) (fixtures with any leak: 26/36 (72%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 1261.8734 ms · query latency p50 26.4145 ms / p95 39.0715 ms · index on disk 176091921 bytes
