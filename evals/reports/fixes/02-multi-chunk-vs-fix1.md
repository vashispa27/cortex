# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### base vs base

#### all answerable queries (n=100)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.900 | 0.900 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.940 | 0.940 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.746 | 0.746 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.660 | 0.690 | +0.030 | [+0.000, +0.070] | within noise (3 queries differ) |
| final hit@8 | 0.860 | 0.910 | +0.050 | [+0.010, +0.100] | better (5 queries differ) |
| final MRR | 0.752 | 0.792 | +0.040 | [+0.010, +0.080] | better (5 queries differ) |

#### type: paraphrase (n=12)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.917 | 0.917 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.655 | 0.655 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.417 | 0.500 | +0.083 | [+0.000, +0.250] | within noise (1 queries differ) |
| final hit@8 | 0.667 | 0.833 | +0.167 | [+0.000, +0.417] | within noise (2 queries differ) |
| final MRR | 0.528 | 0.653 | +0.125 | [+0.000, +0.333] | within noise (2 queries differ) |

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
| final hit@8 | 0.875 | 1.000 | +0.125 | [+0.000, +0.375] | within noise (1 queries differ) |
| final MRR | 0.750 | 0.812 | +0.062 | [+0.000, +0.188] | within noise (1 queries differ) |

#### type: time_scoped (n=20)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.850 | 0.850 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.658 | 0.658 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.550 | 0.650 | +0.100 | [+0.000, +0.250] | within noise (2 queries differ) |
| final hit@8 | 0.850 | 0.950 | +0.100 | [+0.000, +0.250] | within noise (2 queries differ) |
| final MRR | 0.679 | 0.779 | +0.100 | [+0.000, +0.250] | within noise (2 queries differ) |

#### type: filter_trap (n=15)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.900 | 0.900 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.867 | 0.867 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.933 | 0.933 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

