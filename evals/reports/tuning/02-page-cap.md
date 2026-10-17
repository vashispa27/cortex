# Cap results per page after version ordering

Compare the previous change (keyword bonus off) with a per-page cap applied after `versions::apply` and before the final cut. Group by app plus normalised URL (fragment/default port/trailing slash normalised; paths and query strings retained), or normalised window title when no valid URL exists. Preserve the already-ordered member so original/current intent remains effective. Overflow snapshot IDs remain version pointers; different pages on one site stay separate.

Dev sweep on both corpora: `--split dev --sweep page_cap=1,2`, base `page_cap=0`. Chose 2 before inspecting test: invented dev hit@8 stays 50/53 (cap 1 drops to 47/53); real dev stays 40/49 (cap 1 drops to 39/49). Real dev duplicate-slot share falls 45.85%→32.86%. Cap 1 is too aggressive for distinct versions and multi-source evidence. Full before/after runs use best-of-five latency. Raw reports stay in ignored run directories.

Visible `ask` change: at most two results per app/page, with skipped snapshot IDs in the existing other-versions line. It can return fewer than eight results when too few distinct pages remain. Validation: page identity and version-intent/pointer unit tests, `cargo test --workspace`, and both full offline evals. No capture, storage, cleaner, chunker, model or gold changes. The independent eval-runner commit `c373fe7` landed between changes; these quality/latency runs invoke the binary directly and do not use its runner modifications.

Aggregate results only. Paired percentile bootstrap: 10,000 resamples, seed 0; intervals containing zero are within noise.

| corpus/run | hit@1 | hit@8 | MRR | duplicate slot share | chunk hit lost at final |
|---|---|---|---|---|---|
| invented before | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| invented after | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| real before | 58/99 | 75/99 | 0.6468 | 0.4546 | 10 |
| real after | 58/99 | 75/99 | 0.6477 | 0.3163 | 10 |

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
| before | 5.543 | 8.668 | 10.270 |
| after | 5.707 | 9.120 | 10.609 |

## real: paired changes

| split/type | n | hit@1 before → after | delta 95% CI | hit@8 before → after | delta 95% CI |
|---|---|---|---|---|---|
| all | 99 | 58 → 58 | [+0.0, +0.0] pp (noise) | 75 → 75 | [-4.0, +4.0] pp (noise) |
| dev | 49 | 33 → 33 | [+0.0, +0.0] pp (noise) | 40 → 40 | [-6.1, +6.1] pp (noise) |
| test | 50 | 25 → 25 | [+0.0, +0.0] pp (noise) | 35 → 35 | [-6.0, +6.0] pp (noise) |
| ambiguous_entity | 1 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| app_scoped | 6 | 5 → 5 | [+0.0, +0.0] pp (noise) | 6 → 6 | [+0.0, +0.0] pp (noise) |
| code | 5 | 3 → 3 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| domain_scoped | 9 | 7 → 7 | [+0.0, +0.0] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| filter_trap | 5 | 2 → 2 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| keyword | 8 | 8 → 8 | [+0.0, +0.0] pp (noise) | 8 → 8 | [+0.0, +0.0] pp (noise) |
| long_document | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| mixed_language | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 2 → 1 | [-100.0, +0.0] pp (noise) |
| multi_snapshot | 4 | 2 → 2 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| near_duplicate_version | 5 | 1 → 1 | [+0.0, +0.0] pp (noise) | 2 → 2 | [+0.0, +0.0] pp (noise) |
| paraphrase | 19 | 8 → 8 | [+0.0, +0.0] pp (noise) | 14 → 14 | [-15.8, +15.8] pp (noise) |
| repeat_capture | 3 | 3 → 3 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| short_snapshot | 3 | 1 → 1 | [+0.0, +0.0] pp (noise) | 1 → 1 | [+0.0, +0.0] pp (noise) |
| speaker | 7 | 6 → 6 | [+0.0, +0.0] pp (noise) | 7 → 7 | [+0.0, +0.0] pp (noise) |
| table | 4 | 4 → 4 | [+0.0, +0.0] pp (noise) | 4 → 4 | [+0.0, +0.0] pp (noise) |
| terminal_output | 5 | 1 → 1 | [+0.0, +0.0] pp (noise) | 3 → 3 | [+0.0, +0.0] pp (noise) |
| time_scoped | 9 | 4 → 4 | [+0.0, +0.0] pp (noise) | 6 → 7 | [+0.0, +33.3] pp (noise) |

Best-of-five query latency (milliseconds):

| run | p50 | p95 | p99 |
|---|---|---|---|
| before | 81.349 | 155.734 | 251.281 |
| after | 82.407 | 157.762 | 249.884 |

## Dev sweep

Only dev was inspected to choose the default. Each sweep varies one parameter from its base.

| corpus | variant | dev hit@1 | dev hit@8 | dev MRR |
|---|---|---|---|---|
| invented | base | 44/53 | 50/53 | 0.8836 |
| invented | page_cap=1 | 44/53 | 47/53 | 0.8585 |
| invented | page_cap=2 | 44/53 | 50/53 | 0.8836 |
| real | base | 33/49 | 40/49 | 0.7252 |
| real | page_cap=1 | 33/49 | 39/49 | 0.7206 |
| real | page_cap=2 | 33/49 | 40/49 | 0.7245 |
