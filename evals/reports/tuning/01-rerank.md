# Disable the keyword rerank bonus

Baseline is clean main `05ca1b3`, after capture dedup `c8ab98d` and raw-tree purge `06ee2a6`. Step 0 used `EXTRA='--query-repeats 5' evals/run_all.sh`. Invented is unchanged from the prompt's pre-dedup reference (82/102 hit@1, 98/102 hit@8, MRR 0.8766). Real moved only from 43 to 44/99 hit@1 and 72 to 71/99 hit@8, within noise; MRR is 0.5423. Duplicate final slots remain 3.13% invented and 46.53% real. Ingest dedup did not remove the retrieval crowding problem. Real chunk hits lost at final remain 13/99. Historical pre-dedup figures are reference aggregates, not a new paired run.

Swept on dev only: `--split dev --sweep rerank_bonus=off,chunks --sweep rerank_weight=0.01`, on each corpus with default body weight 1 as the base. Chose off: real dev hit@1 26→33/49 and hit@8 39→40/49, versus chunks 24/37 and small weight 32/40. Invented dev hit@1 46→44/53, hit@8 unchanged at 50/53. Off is the simplest option and has the best real dev hit@1/MRR, with a two-query invented dev loss; no test results were inspected to choose it. Full before/after runs use best-of-five latency. Raw reports stay in ignored run directories.

`ask` now ranks by fused relevance without adding whole-page keyword counts. Scores, ordering, evidence snippets and abstention can change as a consequence; output structure is unchanged. Body and retrieved-chunk bonuses remain available as eval parameters; finite nonnegative `rerank_weight` scales them. Validation: `cargo test --workspace`, full offline evals on both corpora, and paired bootstrap comparisons below. No capture/storage/cleaning/chunking changes or model/network/LLM calls.

Aggregate results only. Paired percentile bootstrap: 10,000 resamples, seed 0; intervals containing zero are within noise.

| corpus/run | hit@1 | hit@8 | MRR | duplicate slot share | chunk hit lost at final |
|---|---|---|---|---|---|
| invented before | 82/102 | 98/102 | 0.8766 | 0.0313 | 3 |
| invented after | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| real before | 44/99 | 71/99 | 0.5423 | 0.4653 | 13 |
| real after | 58/99 | 75/99 | 0.6468 | 0.4546 | 10 |

## invented: paired changes

| split/type | n | hit@1 before → after | delta 95% CI | hit@8 before → after | delta 95% CI |
|---|---|---|---|---|---|
| all | 102 | 82 → 89 | [-1.0, +14.7] pp (noise) | 98 → 98 | [+0.0, +0.0] pp (noise) |
| dev | 53 | 46 → 44 | [-13.2, +5.7] pp (noise) | 50 → 50 | [+0.0, +0.0] pp (noise) |
| test | 49 | 36 → 45 | [+8.2, +30.6] pp | 48 → 48 | [+0.0, +0.0] pp (noise) |
| ambiguous_entity | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| app_scoped | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| boundary_fact | 5 | 2 → 5 | [+20.0, +100.0] pp | 5 → 5 | [+0.0, +0.0] pp (noise) |
| domain_scoped | 5 | 4 → 5 | [+0.0, +60.0] pp (noise) | 5 → 5 | [+0.0, +0.0] pp (noise) |
| filter_trap | 15 | 14 → 12 | [-40.0, +13.3] pp (noise) | 15 → 15 | [+0.0, +0.0] pp (noise) |
| keyword | 8 | 7 → 8 | [+0.0, +37.5] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| multi_snapshot | 7 | 4 → 5 | [+0.0, +42.9] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| near_duplicate_version | 8 | 7 → 8 | [+0.0, +37.5] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| non_english | 6 | 5 → 5 | [+0.0, +0.0] pp (noise) | 5 → 5 | [+0.0, +0.0] pp (noise) |
| paraphrase | 12 | 7 → 9 | [+0.0, +41.7] pp (noise) | 10 → 10 | [+0.0, +0.0] pp (noise) |
| speaker | 8 | 7 → 5 | [-50.0, +0.0] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| time_scoped | 20 | 17 → 19 | [+0.0, +25.0] pp (noise) | 19 → 19 | [+0.0, +0.0] pp (noise) |

Best-of-five query latency (milliseconds):

| run | p50 | p95 | p99 |
|---|---|---|---|
| before | 5.578 | 9.038 | 10.087 |
| after | 5.543 | 8.668 | 10.270 |

## real: paired changes

| split/type | n | hit@1 before → after | delta 95% CI | hit@8 before → after | delta 95% CI |
|---|---|---|---|---|---|
| all | 99 | 44 → 58 | [+6.1, +23.2] pp | 71 → 75 | [-3.0, +11.1] pp (noise) |
| dev | 49 | 26 → 33 | [+4.1, +26.5] pp | 39 → 40 | [-6.1, +10.2] pp (noise) |
| test | 50 | 18 → 25 | [+0.0, +28.0] pp (noise) | 32 → 35 | [-4.0, +16.0] pp (noise) |
| ambiguous_entity | 1 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| app_scoped | 6 | 4 → 5 | [+0.0, +50.0] pp (noise) | 6 → 6 | [+0.0, +0.0] pp (noise) |
| code | 5 | 1 → 3 | [+0.0, +80.0] pp (noise) | 3 → 4 | [+0.0, +60.0] pp (noise) |
| domain_scoped | 9 | 6 → 7 | [+0.0, +33.3] pp (noise) | 8 → 7 | [-33.3, +0.0] pp (noise) |
| filter_trap | 5 | 0 → 2 | [+0.0, +80.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| keyword | 8 | 5 → 8 | [+12.5, +75.0] pp | 7 → 8 | [+0.0, +37.5] pp (noise) |
| long_document | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 2 → 1 | [-100.0, +0.0] pp (noise) |
| mixed_language | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 2 | [+0.0, +100.0] pp (noise) |
| multi_snapshot | 4 | 1 → 2 | [+0.0, +75.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| near_duplicate_version | 5 | 1 → 1 | [+0.0, +0.0] pp (noise) | 2 → 2 | [+0.0, +0.0] pp (noise) |
| paraphrase | 19 | 7 → 8 | [-15.8, +26.3] pp (noise) | 12 → 14 | [-10.5, +31.6] pp (noise) |
| repeat_capture | 3 | 2 → 3 | [+0.0, +100.0] pp (noise) | 2 → 3 | [+0.0, +100.0] pp (noise) |
| short_snapshot | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| speaker | 7 | 6 → 6 | [-42.9, +42.9] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| table | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| terminal_output | 5 | 0 → 1 | [+0.0, +60.0] pp (noise) | 2 → 3 | [+0.0, +60.0] pp (noise) |
| time_scoped | 9 | 3 → 4 | [-22.2, +44.4] pp (noise) | 7 → 6 | [-33.3, +0.0] pp (noise) |

Best-of-five query latency (milliseconds):

| run | p50 | p95 | p99 |
|---|---|---|---|
| before | 80.213 | 157.806 | 253.122 |
| after | 81.349 | 155.734 | 251.281 |

## Dev sweep

Only dev was inspected to choose the default. Each sweep varies one parameter from its base.

| corpus | variant | dev hit@1 | dev hit@8 | dev MRR |
|---|---|---|---|---|
| invented | base | 46/53 | 50/53 | 0.9025 |
| invented | rerank_bonus=chunks | 46/53 | 50/53 | 0.9057 |
| invented | rerank_bonus=off | 44/53 | 50/53 | 0.8836 |
| invented | rerank_weight=0.01 | 44/53 | 50/53 | 0.8836 |
| real | base | 26/49 | 39/49 | 0.6052 |
| real | rerank_bonus=chunks | 24/49 | 37/49 | 0.5838 |
| real | rerank_bonus=off | 33/49 | 40/49 | 0.7252 |
| real | rerank_weight=0.01 | 32/49 | 40/49 | 0.7211 |
