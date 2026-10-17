# Measure fusion weights and dense reranking; retain hybrid defaults

After removing the keyword bonus and capping pages, sweep dev on both corpora: `--sweep bm25_weight=1.5,2,4 --sweep prefetch=40,160 --sweep mode=dense_only,bm25_only,bm25_dense_rerank`, base hybrid with BM25 weight 1, prefetch 80. Every variant is a separate one-parameter change. Keep defaults at hybrid/1/80: no tested configuration improves both dev corpora, and every alternative loses real dev hit@8. This is a measured negative result, not a reason to force a BM25-heavy default. No new constant was selected using test.

Real dev: hybrid hit@1/@8 33/40 of 49; BM25-only 30/39; dense-only 25/33; dense rerank of BM25 candidates 26/35. Invented dev: hybrid 44/50 of 53; BM25-only 41/49; dense-only 38/49; dense rerank 40/49. Thus the dense leg supplies a net +3 hit@1 and +1 hit@8 on each dev corpus relative to BM25-only; effects at this sample size need the paired intervals below and should not be called a proven quality win. Neither BM25 priority nor the dense-reranking alternative improves the measured hybrid baseline. Controls are dev-only; test evaluates the selected unchanged default. The post-rerank result differs from the old prompt's single-retriever comparisons.

Implementation adds positive finite `bm25_weight` for hybrid RRF and `mode=bm25_dense_rerank`. The latter nests BM25 prefetch under dense scoring and wraps the result in one-list RRF, preserving rank-score units. Weighted RRF normalisation is shared by abstention and version-margin comparisons. No embedding model change, dependency, network/LLM call or index/capture/storage change. Equal-score RRF cutoff winners are now deterministic: retrieve the full possible prefetch union, sort score/id, then cut to `fused_limit`. Qdrant previously cut hash-ordered ties before our sort. Default `ask` format is unchanged; tail results and version pointers can change at that boundary. The pre-fix repeated runs changed nine real query records (mostly low-ranked pointers/candidates) despite equal answer-hit totals. Validation: `cargo test --workspace`, weighted and one-list score-normalisation assertions, full offline best-of-five evals on both corpora, and paired bootstrap. Raw reports remain in ignored run directories.

Aggregate results only. Paired percentile bootstrap: 10,000 resamples, seed 0; intervals containing zero are within noise.

| corpus/run | hit@1 | hit@8 | MRR | duplicate slot share | chunk hit lost at final |
|---|---|---|---|---|---|
| invented before | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| invented after | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| real before | 58/99 | 75/99 | 0.6477 | 0.3163 | 10 |
| real after | 58/99 | 75/99 | 0.6477 | 0.3155 | 10 |

## invented: paired changes

| split/type | n | hit@1 before → after | delta 95% CI | hit@8 before → after | delta 95% CI |
|---|---|---|---|---|---|
| all | 102 | 89 → 89 | [+0.0, +0.0] pp (noise) | 98 → 98 | [+0.0, +0.0] pp (noise) |
| dev | 53 | 44 → 44 | [+0.0, +0.0] pp (noise) | 50 → 50 | [+0.0, +0.0] pp (noise) |
| test | 49 | 45 → 45 | [+0.0, +0.0] pp (noise) | 48 → 48 | [+0.0, +0.0] pp (noise) |
| ambiguous_entity | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| app_scoped | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| boundary_fact | 5 | 5 → 5 | [+0.0, +0.0] pp (noise) | 5 → 5 | [+0.0, +0.0] pp (noise) |
| domain_scoped | 5 | 5 → 5 | [+0.0, +0.0] pp (noise) | 5 → 5 | [+0.0, +0.0] pp (noise) |
| filter_trap | 15 | 12 → 12 | [+0.0, +0.0] pp (noise) | 15 → 15 | [+0.0, +0.0] pp (noise) |
| keyword | 8 | 8 → 8 | [+0.0, +0.0] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| multi_snapshot | 7 | 5 → 5 | [+0.0, +0.0] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| near_duplicate_version | 8 | 8 → 8 | [+0.0, +0.0] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| non_english | 6 | 5 → 5 | [+0.0, +0.0] pp (noise) | 5 → 5 | [+0.0, +0.0] pp (noise) |
| paraphrase | 12 | 9 → 9 | [+0.0, +0.0] pp (noise) | 10 → 10 | [+0.0, +0.0] pp (noise) |
| speaker | 8 | 5 → 5 | [+0.0, +0.0] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| time_scoped | 20 | 19 → 19 | [+0.0, +0.0] pp (noise) | 19 → 19 | [+0.0, +0.0] pp (noise) |

Best-of-five query latency (milliseconds):

| run | p50 | p95 | p99 |
|---|---|---|---|
| before | 5.707 | 9.120 | 10.609 |
| after | 5.900 | 9.200 | 11.199 |

## real: paired changes

| split/type | n | hit@1 before → after | delta 95% CI | hit@8 before → after | delta 95% CI |
|---|---|---|---|---|---|
| all | 99 | 58 → 58 | [+0.0, +0.0] pp (noise) | 75 → 75 | [+0.0, +0.0] pp (noise) |
| dev | 49 | 33 → 33 | [+0.0, +0.0] pp (noise) | 40 → 40 | [+0.0, +0.0] pp (noise) |
| test | 50 | 25 → 25 | [+0.0, +0.0] pp (noise) | 35 → 35 | [+0.0, +0.0] pp (noise) |
| ambiguous_entity | 1 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| app_scoped | 6 | 5 → 5 | [+0.0, +0.0] pp (noise) | 6 → 6 | [+0.0, +0.0] pp (noise) |
| code | 5 | 3 → 3 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| domain_scoped | 9 | 7 → 7 | [+0.0, +0.0] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| filter_trap | 5 | 2 → 2 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| keyword | 8 | 8 → 8 | [+0.0, +0.0] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| long_document | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| mixed_language | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| multi_snapshot | 4 | 2 → 2 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| near_duplicate_version | 5 | 1 → 1 | [+0.0, +0.0] pp (noise) | 2 → 2 | [+0.0, +0.0] pp (noise) |
| paraphrase | 19 | 8 → 8 | [+0.0, +0.0] pp (noise) | 14 → 14 | [+0.0, +0.0] pp (noise) |
| repeat_capture | 3 | 3 → 3 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| short_snapshot | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| speaker | 7 | 6 → 6 | [+0.0, +0.0] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| table | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| terminal_output | 5 | 1 → 1 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| time_scoped | 9 | 4 → 4 | [+0.0, +0.0] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |

Best-of-five query latency (milliseconds):

| run | p50 | p95 | p99 |
|---|---|---|---|
| before | 82.407 | 157.762 | 249.884 |
| after | 83.407 | 157.345 | 251.281 |

## Dev sweep

Only dev was inspected to choose the default. Each sweep varies one parameter from its base.

| corpus | variant | dev hit@1 | dev hit@8 | dev MRR |
|---|---|---|---|---|
| invented | bm25_weight=1.5 | 43/53 | 50/53 | 0.8711 |
| invented | bm25_weight=2 | 43/53 | 50/53 | 0.8711 |
| invented | bm25_weight=4 | 41/53 | 50/53 | 0.8522 |
| invented | base | 44/53 | 50/53 | 0.8836 |
| invented | mode=bm25_dense_rerank | 40/53 | 49/53 | 0.8333 |
| invented | mode=bm25_only | 41/53 | 49/53 | 0.8443 |
| invented | mode=dense_only | 38/53 | 49/53 | 0.8052 |
| invented | prefetch=160 | 44/53 | 50/53 | 0.8836 |
| invented | prefetch=40 | 44/53 | 50/53 | 0.8805 |
| real | bm25_weight=1.5 | 30/49 | 36/49 | 0.6582 |
| real | bm25_weight=2 | 30/49 | 37/49 | 0.6578 |
| real | bm25_weight=4 | 27/49 | 36/49 | 0.6095 |
| real | base | 33/49 | 40/49 | 0.7245 |
| real | mode=bm25_dense_rerank | 26/49 | 35/49 | 0.5986 |
| real | mode=bm25_only | 30/49 | 39/49 | 0.6652 |
| real | mode=dense_only | 25/49 | 33/49 | 0.5665 |
| real | prefetch=160 | 33/49 | 39/49 | 0.7194 |
| real | prefetch=40 | 32/49 | 37/49 | 0.6956 |

## Dense contribution on dev

Paired hybrid minus BM25-only, 10,000 resamples. These are dev observations, not held-out evidence.

| corpus/group | n | delta hit@1 [95% CI] | delta hit@8 [95% CI] |
|---|---|---|---|
| invented/all | 53 | +3 [-1.9, +15.1] pp (noise) | +1 [+0.0, +5.7] pp (noise) |
| invented/paraphrase | 6 | +2 [+0.0, +66.7] pp (noise) | +0 [+0.0, +0.0] pp (noise) |
| real/all | 49 | +3 [-6.1, +20.4] pp (noise) | +1 [-8.2, +12.2] pp (noise) |
| real/paraphrase | 8 | -2 [-62.5, +0.0] pp (noise) | +0 [+0.0, +0.0] pp (noise) |

Dev paraphrase controls:

| corpus | variant | hit@1 | hit@8 | chunk hit@40 |
|---|---|---|---|---|
| invented | bm25_weight=1.5 | 4/6 | 4/6 | 6/6 |
| invented | bm25_weight=2 | 4/6 | 4/6 | 6/6 |
| invented | bm25_weight=4 | 4/6 | 4/6 | 6/6 |
| invented | base | 4/6 | 4/6 | 6/6 |
| invented | mode=bm25_dense_rerank | 4/6 | 4/6 | 5/6 |
| invented | mode=bm25_only | 2/6 | 4/6 | 5/6 |
| invented | mode=dense_only | 3/6 | 5/6 | 6/6 |
| invented | prefetch=160 | 4/6 | 4/6 | 6/6 |
| invented | prefetch=40 | 4/6 | 4/6 | 6/6 |
| real | bm25_weight=1.5 | 3/8 | 6/8 | 7/8 |
| real | bm25_weight=2 | 3/8 | 7/8 | 7/8 |
| real | bm25_weight=4 | 3/8 | 7/8 | 7/8 |
| real | base | 3/8 | 6/8 | 7/8 |
| real | mode=bm25_dense_rerank | 3/8 | 6/8 | 6/8 |
| real | mode=bm25_only | 5/8 | 6/8 | 7/8 |
| real | mode=dense_only | 3/8 | 4/8 | 4/8 |
| real | prefetch=160 | 3/8 | 5/8 | 6/8 |
| real | prefetch=40 | 3/8 | 5/8 | 7/8 |
