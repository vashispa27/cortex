# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### base vs base

#### all answerable queries (n=102)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.971 | 0.971 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.990 | 0.990 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.838 | 0.838 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.755 | 0.804 | +0.049 | [+0.000, +0.098] | within noise (7 queries differ) |
| final hit@8 | 0.961 | 0.961 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.852 | 0.877 | +0.025 | [+0.000, +0.049] | within noise (7 queries differ) |

#### type: paraphrase (n=12)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.917 | 0.917 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.655 | 0.655 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.500 | 0.583 | +0.083 | [+0.000, +0.250] | within noise (1 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.653 | 0.694 | +0.042 | [+0.000, +0.125] | within noise (1 queries differ) |

#### type: keyword (n=8)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.875 | 0.875 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.938 | 0.938 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=8)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.685 | 0.685 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.625 | 0.875 | +0.250 | [+0.000, +0.625] | within noise (2 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.812 | 0.938 | +0.125 | [+0.000, +0.312] | within noise (2 queries differ) |

#### type: time_scoped (n=20)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.950 | 0.950 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.777 | 0.777 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.850 | 0.850 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.950 | 0.950 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.900 | 0.900 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: filter_trap (n=15)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.900 | 0.900 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.867 | 0.933 | +0.067 | [+0.000, +0.200] | within noise (1 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.933 | 0.967 | +0.033 | [+0.000, +0.100] | within noise (1 queries differ) |

#### type: boundary_fact (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.400 | 0.400 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.617 | 0.617 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 12/22, variant 12/22.

