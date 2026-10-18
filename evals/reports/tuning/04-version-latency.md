# Preserve version merging while removing repeated tokenisation

The pairwise merge is still active after ingest dedup: invented removes 0 of 2,022 candidate appearances over 124 retrieval passes; real removes 52 of 3,520 over 127 passes (125 questions plus app-fallback passes). Thirty-two real passes merge something, with at most four removals per pass. Trying `--param dedup_jaccard=0` leaves invented unchanged but changes 19 real query records, including one relevant-result rank, confidence signals and version pointers. Both headline hit totals stay 89/98 of 102 invented and 58/75 of 99 real, but removing merging would violate the required result-preservation constraint. Retain the rule and its existing threshold; no constant is tuned here.

Profile first: a three-second release CPU sample attributed 1,557 of 1,852 samples under the retrieval branch to `versions::apply` (about 84%); critical-token rebuilding dominated there. Aggregate-only instrumentation then measured 9,339.379 ms in real merging versus 4.143 ms ordering over 127 retrieval passes. The equivalent invented totals were 442.961 ms versus 0.800 ms. Merging, not version ordering, dominates the version step.

Implementation computes each candidate's word set, critical-token set and query-match count once per query, carries them along when replacing a representative, rejects impossible Jaccard pairs with the exact min/max word-set-size bound, stops critical-set comparisons at the first difference, and moves version entries rather than cloning source bodies/chunks. Raw body-byte ratios cannot safely bound word-set Jaccard (repeated words and Unicode), so the word-set bound is used. Nothing is cached across queries. The public `mergeable` rule used by ingest is untouched; no edits to `dedup.rs` or `rawtrees.rs`.

Measurement: `03-after.json` is the immediately preceding release default with five repeats, reused for before-latency (same parameters and every logical result as the instrumented pre-optimization run). `04-before.json` runs the old algorithm once with `REWIND_PROFILE_VERSIONS=1` to count/profile it; `04-after.json` runs the optimized algorithm with five repeats and the same profiling flag. Both corpora use these commands. The latency table below uses best-of-five on both sides; after timings include the small stderr profiling overhead. Profile counts after divide exactly by five to the original counts: invented 620 passes/10,110 candidates/0 merges, real 635/17,600/260.

Identity: `python3 evals/tools/diff_reports.py BEFORE AFTER --ignore-index-files` passes on both corpora. All query records (including ranks, chunks, snippets, scores, support, abstention and version pointers), metadata/parameters, aggregates, probes and logical SQLite rows/payload sizes are identical. Raw strict comparisons fail only on physical index metadata: generated segment UUID file paths and filesystem allocation/WAL checkpoint sizes. Those are existing nondeterministic cost measurements, not retrieval differences. Added an explicit opt-in flag that skips only `index_size.state_dir_entries` and `index_size.vector_shard`; default strict mode is unchanged. Four Python tests verify this flag never filters query, parameter or logical SQLite changes. Full raw reports therefore cannot be called identical apart from timing alone; this physical-cost exception is explicit.

Validation: all existing version tests, boundary/Unicode/changed-fact equivalence against the unchanged public merge rule, a representative-replacement cache test, `cargo test --workspace`, four report-comparison tests, both complete offline corpora, frozen-input verification, and byte-identical `ask` output for 12 questions (359 lines). Default `ask` has no visible change from this optimization. No dependency, model, capture, storage, cleaning, chunking, gold, network or LLM change.

Aggregate results only. Paired percentile bootstrap: 10,000 resamples, seed 0; intervals containing zero are within noise.

| corpus/run | hit@1 | hit@8 | MRR | duplicate slot share | chunk hit lost at final |
|---|---|---|---|---|---|
| invented before | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| invented after | 89/102 | 98/102 | 0.9121 | 0.0235 | 3 |
| real before | 58/99 | 75/99 | 0.6477 | 0.3155 | 10 |
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
| before | 5.900 | 9.200 | 11.199 |
| after | 2.320 | 3.033 | 3.433 |

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
| before | 83.407 | 157.345 | 251.281 |
| after | 16.206 | 30.204 | 41.292 |

## Version-step profile

Per retrieval pass (including fallbacks). Five repeats in the after rows; counts scale exactly with repeats.

| corpus/run | passes | candidate appearances | merged | merge median ms | merge mean ms | ordering mean ms |
|---|---|---|---|---|---|---|
| invented before | 124 | 2022 | 0 | 3.6175 | 3.5723 | 0.0065 |
| invented after | 620 | 10110 | 0 | 0.5245 | 0.4329 | 0.0044 |
| real before | 127 | 3520 | 52 | 71.4810 | 73.5384 | 0.0326 |
| real after | 635 | 17600 | 260 | 6.9520 | 6.4865 | 0.0101 |

## Cumulative start → end

| corpus | hit@1 | hit@8 | MRR | duplicate slots | query p50 / p95 / p99 ms |
|---|---|---|---|---|---|
| invented | 82 → 89/102 | 98 → 98/102 | 0.8766 → 0.9121 | 3.13% → 2.35% | 5.58/9.04/10.09 → 2.32/3.03/3.43 |
| real | 44 → 58/99 | 71 → 75/99 | 0.5423 → 0.6477 | 46.53% → 31.55% | 80.21/157.81/253.12 → 16.21/30.20/41.29 |

The cumulative real hit@1 gain is above noise (paired 95% CI +6.1..+23.2 pp). Invented hit@1 and both hit@8 changes are within paired noise. Final version questions stay 8/8 invented and 2/5 real; multi-snapshot stays 7/7 and 3/4. Ten real answers still reach chunks but are lost at final; investigate evidence selection there next. No scale/haystack benchmark or model swap was attempted in this four-change task.
