# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### mode=dense_only vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.800 | -0.018 | [-0.073, +0.036] | within noise (3 queries differ) |
| chunk hit@40 | 0.855 | 0.855 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.675 | 0.631 | -0.044 | [-0.104, +0.009] | within noise (12 queries differ) |
| final hit@1 | 0.618 | 0.618 | +0.000 | [-0.055, +0.055] | within noise (2 queries differ) |
| final hit@8 | 0.745 | 0.745 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.674 | 0.671 | -0.003 | [-0.030, +0.024] | within noise (3 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [-0.429, +0.429] | within noise (2 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.547 | -0.087 | [-0.408, +0.160] | within noise (3 queries differ) |
| final hit@1 | 0.429 | 0.429 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.548 | -0.024 | [-0.071, +0.000] | within noise (1 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 0.867 | -0.133 | [-0.400, +0.000] | within noise (1 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.622 | -0.100 | [-0.300, +0.000] | within noise (1 queries differ) |
| final hit@1 | 0.600 | 0.800 | +0.200 | [+0.000, +0.600] | within noise (1 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.800 | +0.100 | [+0.000, +0.300] | within noise (1 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.762 | 0.762 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### mode=bm25_only vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.836 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk hit@40 | 0.855 | 0.836 | -0.018 | [-0.055, +0.000] | within noise (1 queries differ) |
| chunk MRR | 0.675 | 0.691 | +0.017 | [-0.031, +0.064] | within noise (13 queries differ) |
| final hit@1 | 0.618 | 0.655 | +0.036 | [+0.000, +0.091] | within noise (2 queries differ) |
| final hit@8 | 0.745 | 0.764 | +0.018 | [-0.036, +0.091] | within noise (3 queries differ) |
| final MRR | 0.674 | 0.698 | +0.024 | [-0.021, +0.088] | within noise (4 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 0.857 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |
| chunk MRR | 0.633 | 0.743 | +0.110 | [-0.062, +0.286] | within noise (4 queries differ) |
| final hit@1 | 0.429 | 0.571 | +0.143 | [+0.000, +0.429] | within noise (1 queries differ) |
| final hit@8 | 0.714 | 0.857 | +0.143 | [+0.000, +0.429] | within noise (1 queries differ) |
| final MRR | 0.571 | 0.690 | +0.119 | [-0.071, +0.429] | within noise (2 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 1.000 | +0.200 | [+0.000, +0.600] | within noise (1 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.525 | -0.197 | [-0.497, +0.006] | within noise (3 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.600 | -0.200 | [-0.600, +0.000] | within noise (1 queries differ) |
| final MRR | 0.700 | 0.600 | -0.100 | [-0.300, +0.000] | within noise (1 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.929 | +0.095 | [+0.000, +0.238] | within noise (2 queries differ) |
| final hit@1 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.762 | 0.762 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.500 | 0.625 | +0.125 | [+0.000, +0.375] | within noise (1 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 3/6.

### rerank_bonus=off vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.818 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.855 | 0.855 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.675 | 0.675 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.618 | 0.673 | +0.055 | [-0.036, +0.145] | within noise (7 queries differ) |
| final hit@8 | 0.745 | 0.745 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.674 | 0.706 | +0.032 | [-0.018, +0.088] | within noise (8 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.633 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.429 | 0.571 | +0.143 | [+0.000, +0.429] | within noise (1 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.619 | +0.048 | [-0.071, +0.214] | within noise (2 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [-0.600, +0.600] | within noise (2 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [-0.300, +0.300] | within noise (2 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.714 | 0.857 | +0.143 | [+0.000, +0.429] | within noise (1 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.762 | 0.857 | +0.095 | [+0.000, +0.286] | within noise (1 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### filters=off vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.891 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk hit@40 | 0.855 | 0.927 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk MRR | 0.675 | 0.708 | +0.033 | [-0.029, +0.105] | within noise (11 queries differ) |
| final hit@1 | 0.618 | 0.636 | +0.018 | [-0.073, +0.109] | within noise (7 queries differ) |
| final hit@8 | 0.745 | 0.800 | +0.055 | [-0.018, +0.145] | within noise (5 queries differ) |
| final MRR | 0.674 | 0.711 | +0.036 | [-0.036, +0.121] | within noise (8 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.633 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.429 | 0.429 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.571 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.690 | -0.143 | [-0.333, -0.012] | worse (3 queries differ) |
| final hit@1 | 0.714 | 0.429 | -0.286 | [-0.571, +0.000] | within noise (2 queries differ) |
| final hit@8 | 0.857 | 0.714 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |
| final MRR | 0.762 | 0.548 | -0.214 | [-0.405, -0.048] | worse (3 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |
| chunk hit@40 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |
| chunk MRR | 0.000 | 0.750 | +0.750 | [+0.500, +1.000] | better (4 queries differ) |
| final hit@1 | 0.000 | 0.750 | +0.750 | [+0.250, +1.000] | better (3 queries differ) |
| final hit@8 | 0.000 | 0.750 | +0.750 | [+0.250, +1.000] | better (3 queries differ) |
| final MRR | 0.000 | 0.750 | +0.750 | [+0.250, +1.000] | better (3 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### derived=off vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.836 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk hit@40 | 0.855 | 0.873 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk MRR | 0.675 | 0.682 | +0.008 | [+0.000, +0.019] | better (5 queries differ) |
| final hit@1 | 0.618 | 0.600 | -0.018 | [-0.055, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.745 | 0.745 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.674 | 0.665 | -0.009 | [-0.027, +0.000] | within noise (1 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.631 | -0.002 | [-0.007, +0.000] | within noise (1 queries differ) |
| final hit@1 | 0.429 | 0.429 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.571 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 1.000 | +0.200 | [+0.000, +0.600] | within noise (1 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.733 | +0.011 | [+0.000, +0.033] | within noise (1 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.762 | 0.762 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 1.000 | +0.250 | [+0.000, +0.750] | within noise (1 queries differ) |
| chunk MRR | 0.500 | 0.508 | +0.008 | [+0.000, +0.023] | within noise (1 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### chunk_target=800 vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.873 | +0.055 | [+0.000, +0.127] | within noise (3 queries differ) |
| chunk hit@40 | 0.855 | 0.927 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk MRR | 0.675 | 0.699 | +0.024 | [-0.033, +0.084] | within noise (12 queries differ) |
| final hit@1 | 0.618 | 0.618 | +0.000 | [-0.055, +0.055] | within noise (2 queries differ) |
| final hit@8 | 0.745 | 0.764 | +0.018 | [-0.036, +0.091] | within noise (3 queries differ) |
| final MRR | 0.674 | 0.683 | +0.009 | [-0.045, +0.064] | within noise (3 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.633 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.429 | 0.429 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.571 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.738 | -0.095 | [-0.286, +0.000] | within noise (1 queries differ) |
| final hit@1 | 0.714 | 0.571 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.857 | 0.714 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |
| final MRR | 0.762 | 0.619 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (3 queries differ) |
| chunk hit@40 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (3 queries differ) |
| chunk MRR | 0.000 | 0.500 | +0.500 | [+0.500, +0.500] | better (3 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.333 | +0.333 | [+0.000, +1.000] | within noise (1 queries differ) |
| final MRR | 0.000 | 0.167 | +0.167 | [+0.000, +0.500] | within noise (1 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 1.000 | +0.250 | [+0.000, +0.750] | within noise (1 queries differ) |
| chunk MRR | 0.500 | 0.569 | +0.069 | [-0.181, +0.375] | within noise (3 queries differ) |
| final hit@1 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.500 | 0.500 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### chunk_target=3200 vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.873 | +0.055 | [+0.000, +0.127] | within noise (3 queries differ) |
| chunk hit@40 | 0.855 | 0.909 | +0.055 | [+0.000, +0.127] | within noise (3 queries differ) |
| chunk MRR | 0.675 | 0.732 | +0.058 | [+0.018, +0.103] | better (7 queries differ) |
| final hit@1 | 0.618 | 0.655 | +0.036 | [+0.000, +0.091] | within noise (2 queries differ) |
| final hit@8 | 0.745 | 0.800 | +0.055 | [+0.000, +0.127] | within noise (3 queries differ) |
| final MRR | 0.674 | 0.720 | +0.045 | [+0.000, +0.100] | within noise (3 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.633 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.429 | 0.429 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.571 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.762 | 0.762 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: boundary_fact (n=3)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (3 queries differ) |
| chunk hit@40 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (3 queries differ) |
| chunk MRR | 0.000 | 0.500 | +0.500 | [+0.500, +0.500] | better (3 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.333 | +0.333 | [+0.000, +1.000] | within noise (1 queries differ) |
| final MRR | 0.000 | 0.167 | +0.167 | [+0.000, +0.500] | within noise (1 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.500 | 0.750 | +0.250 | [+0.000, +0.500] | within noise (2 queries differ) |
| final hit@1 | 0.500 | 0.750 | +0.250 | [+0.000, +0.750] | within noise (1 queries differ) |
| final hit@8 | 0.500 | 0.750 | +0.250 | [+0.000, +0.750] | within noise (1 queries differ) |
| final MRR | 0.500 | 0.750 | +0.250 | [+0.000, +0.750] | within noise (1 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

