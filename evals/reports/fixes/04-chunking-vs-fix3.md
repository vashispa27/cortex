# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### base vs base

#### all answerable queries (n=100)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.900 | 0.960 | +0.060 | [+0.020, +0.110] | better (6 queries differ) |
| chunk hit@40 | 0.940 | 0.990 | +0.050 | [+0.010, +0.100] | better (5 queries differ) |
| chunk MRR | 0.746 | 0.807 | +0.060 | [+0.020, +0.106] | better (8 queries differ) |
| final hit@1 | 0.690 | 0.710 | +0.020 | [+0.000, +0.050] | within noise (2 queries differ) |
| final hit@8 | 0.910 | 0.960 | +0.050 | [+0.010, +0.100] | better (5 queries differ) |
| final MRR | 0.792 | 0.823 | +0.031 | [+0.005, +0.063] | better (5 queries differ) |

#### type: paraphrase (n=12)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.917 | 0.917 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.655 | 0.655 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.653 | 0.653 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.812 | 0.812 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=20)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.850 | 0.900 | +0.050 | [+0.000, +0.150] | within noise (1 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.658 | 0.659 | +0.001 | [+0.000, +0.004] | within noise (1 queries differ) |
| final hit@1 | 0.650 | 0.650 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.950 | 0.950 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.779 | 0.779 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| chunk hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (5 queries differ) |
| chunk hit@40 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (5 queries differ) |
| chunk MRR | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (5 queries differ) |
| final hit@1 | 0.000 | 0.400 | +0.400 | [+0.000, +0.800] | within noise (2 queries differ) |
| final hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (5 queries differ) |
| final MRR | 0.000 | 0.617 | +0.617 | [+0.333, +0.900] | better (5 queries differ) |

#### type: non_english (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.750 | 0.833 | +0.083 | [+0.000, +0.250] | within noise (1 queries differ) |
| final hit@1 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 15/22, variant 15/22.

