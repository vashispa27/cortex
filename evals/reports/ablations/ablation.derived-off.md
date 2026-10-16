# Retrieval eval: derived=off

- commit `9eb3aca58b` · model `minishlab/potion-base-32M@1e5a03f8eeb2c98b928fbbd846f22f816360919f:model2vec-rs-0.3.0:default-512` · cleaner v3 · chunk target 1600 B
- params: `{"prefetch":80,"fused_limit":40,"rrf_k":60,"final_k":8,"use_filters":true,"use_rerank_bonus":true,"include_derived":false,"mode":"hybrid","now_ms":1792238400000}`
- corpus: 24 fixtures {"hand_authored":24} · gold: 61 evaluated of 61 ("all" split) · clock fixed at 2026-10-17T12:00Z, TZ=UTC

Counts are queries; small n means wide intervals, so differences of a few queries are within noise.

## Overall

| level | metric | value |
|---|---|---|
| chunk | hit@1 | 31/55 (56%) |
| chunk | hit@5 | 45/55 (82%) |
| chunk | hit@8 | 46/55 (84%) |
| chunk | hit@10 | 46/55 (84%) |
| chunk | hit@40 | 48/55 (87%) |
| chunk | MRR / nDCG@10 | 0.6824 / 0.7174 |
| final | hit@1 | 33/55 (60%) |
| final | hit@8 | 41/55 (75%) |
| final | MRR | 0.6652 |
| final | chunk found but lost by final stage | 7/55 (13%) |
| final | stale/wrong text above the answer | 2/8 (25%) |
| crowding | final slots near-duplicate (Jaccard ≥0.8 / ≥0.5) | 23/388 (6%) / 35/388 (9%) |
| derived | top-10 slots held by derived points | 0/507 (0%) |
| filters | filter excluded every relevant snapshot | 4/55 (7%) |
| filters | zero-result queries | 2/61 (3%) |
| abstention | absent queries that still returned results | 6/6 (100%) |
| abstention | AUROC answerable vs absent by top score (chunk / final) | 0.7909 / 0.9151 |

## By query type

| type | n | chunk hit@1 | chunk hit@8 | chunk hit@40 | chunk MRR | final hit@1 | final hit@k | final MRR | zero-result |
|---|---|---|---|---|---|---|---|---|---|
| absent | 5 (absent) | – | – | – | – | – | – | – | returned results: 5/5 (100%) |
| ambiguous_entity | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.8125 | 3/4 (75%) | 4/4 (100%) | 0.8125 | 0/4 (0%) |
| app_scoped | 4 | 2/4 (50%) | 4/4 (100%) | 4/4 (100%) | 0.7083 | 2/4 (50%) | 3/4 (75%) | 0.625 | 0/4 (0%) |
| boundary_fact | 3 | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) | 0/3 (0%) | 0.0 | 0/3 (0%) |
| domain_scoped | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| filter_trap | 4 | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0.0 | 0/4 (0%) | 0/4 (0%) | 0.0 | 2/4 (50%) |
| keyword | 5 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1.0 | 5/5 (100%) | 5/5 (100%) | 1.0 | 0/5 (0%) |
| multi_snapshot | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 3/4 (75%) | 4/4 (100%) | 0.875 | 0/4 (0%) |
| near_duplicate_version | 5 | 3/5 (60%) | 5/5 (100%) | 5/5 (100%) | 0.7333 | 3/5 (60%) | 4/5 (80%) | 0.7 | 0/5 (0%) |
| non_english | 4 | 1/4 (25%) | 3/4 (75%) | 4/4 (100%) | 0.5078 | 2/4 (50%) | 2/4 (50%) | 0.5 | 0/4 (0%) |
| paraphrase | 7 | 3/7 (43%) | 6/7 (86%) | 7/7 (100%) | 0.631 | 3/7 (43%) | 5/7 (71%) | 0.5714 | 0/7 (0%) |
| speaker | 4 | 3/4 (75%) | 4/4 (100%) | 4/4 (100%) | 0.875 | 4/4 (100%) | 4/4 (100%) | 1.0 | 0/4 (0%) |
| time_scoped | 7 | 5/7 (71%) | 7/7 (100%) | 7/7 (100%) | 0.8333 | 5/7 (71%) | 6/7 (86%) | 0.7619 | 0/8 (0%) |

## Chunking

- 83 chunks over 23 snapshots; bytes mean 355.6747 / p50 153.0 / p95 1507.0 / max 1593.0
- answers split across chunks: 3/50 (6%)
- chars per chunk, English mean 328.8625 vs non-English mean 418.0 (bytes 329.0875 vs 1064.6667)
- chunks whose text also appears in another snapshot: 24/83 (29%)

## Cleaner

- planted facts surviving cleaning: 66/66 (100%)
- noise strings leaked into bodies: 35/105 (33%) (fixtures with any leak: 15/24 (62%))
- navigation-only fixtures: [{"fixture":"nav-only-newtab-01","quality":"navigation_only","body_bytes":0,"ok":true}]

## Cost

- ingest 839.8842 ms · query latency p50 12.9044 ms / p95 14.4624 ms · index on disk 175118901 bytes
