# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### base vs base

#### all answerable queries (n=100)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.900 | +0.100 | [+0.050, +0.160] | better (10 queries differ) |
| chunk hit@40 | 0.840 | 0.940 | +0.100 | [+0.040, +0.160] | better (10 queries differ) |
| chunk MRR | 0.651 | 0.746 | +0.095 | [+0.040, +0.155] | better (10 queries differ) |
| final hit@1 | 0.560 | 0.660 | +0.100 | [+0.050, +0.160] | better (10 queries differ) |
| final hit@8 | 0.760 | 0.860 | +0.100 | [+0.050, +0.160] | better (10 queries differ) |
| final MRR | 0.652 | 0.752 | +0.100 | [+0.050, +0.160] | better (10 queries differ) |

#### type: paraphrase (n=12)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.917 | 0.917 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.655 | 0.655 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.417 | 0.417 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.667 | 0.667 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.528 | 0.528 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| final hit@1 | 0.625 | 0.625 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.875 | 0.875 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=20)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.850 | 0.850 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.658 | 0.658 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.550 | 0.550 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.850 | 0.850 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.679 | 0.679 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: filter_trap (n=15)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.400 | 1.000 | +0.600 | [+0.333, +0.867] | better (9 queries differ) |
| chunk hit@40 | 0.400 | 1.000 | +0.600 | [+0.333, +0.867] | better (9 queries differ) |
| chunk MRR | 0.333 | 0.900 | +0.567 | [+0.333, +0.800] | better (9 queries differ) |
| final hit@1 | 0.267 | 0.867 | +0.600 | [+0.333, +0.867] | better (9 queries differ) |
| final hit@8 | 0.400 | 1.000 | +0.600 | [+0.333, +0.867] | better (9 queries differ) |
| final MRR | 0.333 | 0.933 | +0.600 | [+0.333, +0.867] | better (9 queries differ) |

#### type: boundary_fact (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 21/22, variant 21/22.

