# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### prefix=context vs base

#### all answerable queries (n=102)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.961 | 0.951 | -0.010 | [-0.029, +0.000] | within noise (1 queries differ) |
| chunk hit@40 | 0.990 | 0.990 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.816 | 0.819 | +0.003 | [-0.033, +0.039] | within noise (21 queries differ) |
| final hit@1 | 0.706 | 0.706 | +0.000 | [-0.029, +0.029] | within noise (2 queries differ) |
| final hit@8 | 0.961 | 0.941 | -0.020 | [-0.049, +0.000] | within noise (2 queries differ) |
| final MRR | 0.824 | 0.814 | -0.010 | [-0.034, +0.010] | within noise (3 queries differ) |

#### type: paraphrase (n=12)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.917 | 0.917 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.655 | 0.587 | -0.068 | [-0.205, +0.074] | within noise (7 queries differ) |
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
| chunk MRR | 0.685 | 0.828 | +0.144 | [-0.004, +0.333] | within noise (3 queries differ) |
| final hit@1 | 0.625 | 0.750 | +0.125 | [+0.000, +0.375] | within noise (1 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.812 | 0.875 | +0.062 | [+0.000, +0.188] | within noise (1 queries differ) |

#### type: time_scoped (n=20)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.900 | 0.900 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.663 | 0.742 | +0.079 | [-0.001, +0.177] | within noise (8 queries differ) |
| final hit@1 | 0.650 | 0.600 | -0.050 | [-0.150, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.950 | 0.900 | -0.050 | [-0.150, +0.000] | within noise (1 queries differ) |
| final MRR | 0.779 | 0.729 | -0.050 | [-0.150, +0.000] | within noise (1 queries differ) |

#### type: filter_trap (n=15)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.900 | 0.850 | -0.050 | [-0.133, +0.000] | within noise (2 queries differ) |
| final hit@1 | 0.867 | 0.867 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.933 | 0.933 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 15/22, variant 15/22.

### prefix=title vs base

#### all answerable queries (n=102)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.961 | 0.961 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.990 | 0.990 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.816 | 0.799 | -0.017 | [-0.046, +0.007] | within noise (15 queries differ) |
| final hit@1 | 0.706 | 0.696 | -0.010 | [-0.029, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.961 | 0.941 | -0.020 | [-0.049, +0.000] | within noise (2 queries differ) |
| final MRR | 0.824 | 0.809 | -0.015 | [-0.039, +0.000] | within noise (2 queries differ) |

#### type: paraphrase (n=12)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.917 | 0.917 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.655 | 0.614 | -0.041 | [-0.125, +0.002] | within noise (2 queries differ) |
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
| chunk MRR | 0.685 | 0.703 | +0.019 | [-0.007, +0.062] | within noise (2 queries differ) |
| final hit@1 | 0.625 | 0.625 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.812 | 0.812 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=20)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.900 | 0.900 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.663 | 0.653 | -0.010 | [-0.107, +0.077] | within noise (8 queries differ) |
| final hit@1 | 0.650 | 0.600 | -0.050 | [-0.150, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.950 | 0.900 | -0.050 | [-0.150, +0.000] | within noise (1 queries differ) |
| final MRR | 0.779 | 0.729 | -0.050 | [-0.150, +0.000] | within noise (1 queries differ) |

#### type: filter_trap (n=15)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.900 | 0.867 | -0.033 | [-0.100, +0.000] | within noise (1 queries differ) |
| final hit@1 | 0.867 | 0.867 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.933 | 0.933 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 15/22, variant 15/22.

