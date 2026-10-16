# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### mode=dense_only vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.818 | +0.000 | [-0.055, +0.055] | within noise (2 queries differ) |
| chunk hit@40 | 0.855 | 0.873 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk MRR | 0.689 | 0.660 | -0.029 | [-0.089, +0.026] | within noise (11 queries differ) |
| final hit@1 | 0.655 | 0.618 | -0.036 | [-0.109, +0.036] | within noise (4 queries differ) |
| final hit@8 | 0.782 | 0.745 | -0.036 | [-0.091, +0.000] | within noise (2 queries differ) |
| final MRR | 0.714 | 0.674 | -0.039 | [-0.100, +0.009] | within noise (5 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [-0.429, +0.429] | within noise (2 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.621 | 0.546 | -0.076 | [-0.398, +0.171] | within noise (2 queries differ) |
| final hit@1 | 0.429 | 0.429 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.548 | -0.024 | [-0.071, +0.000] | within noise (1 queries differ) |

#### type: keyword (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 1.000 | 0.850 | -0.150 | [-0.450, +0.000] | within noise (1 queries differ) |
| final hit@1 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: near_duplicate_version (n=5)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.522 | 0.622 | +0.100 | [+0.000, +0.300] | within noise (1 queries differ) |
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
| final MRR | 0.786 | 0.786 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| chunk MRR | 0.750 | 0.632 | -0.118 | [-0.375, +0.020] | within noise (2 queries differ) |
| final hit@1 | 0.750 | 0.500 | -0.250 | [-0.750, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.750 | 0.500 | -0.250 | [-0.750, +0.000] | within noise (1 queries differ) |
| final MRR | 0.750 | 0.500 | -0.250 | [-0.750, +0.000] | within noise (1 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### mode=bm25_only vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.836 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk hit@40 | 0.855 | 0.836 | -0.018 | [-0.055, +0.000] | within noise (1 queries differ) |
| chunk MRR | 0.689 | 0.712 | +0.023 | [-0.017, +0.066] | within noise (12 queries differ) |
| final hit@1 | 0.655 | 0.673 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| final hit@8 | 0.782 | 0.800 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| final MRR | 0.714 | 0.729 | +0.015 | [-0.009, +0.055] | within noise (2 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 0.857 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |
| chunk MRR | 0.621 | 0.671 | +0.050 | [-0.186, +0.279] | within noise (5 queries differ) |
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
| chunk MRR | 0.522 | 0.575 | +0.053 | [-0.147, +0.303] | within noise (3 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.929 | +0.095 | [+0.000, +0.238] | within noise (2 queries differ) |
| final hit@1 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.786 | 0.786 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| chunk MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 3/6.

### rerank_bonus=off vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.818 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.855 | 0.855 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.689 | 0.689 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.655 | 0.691 | +0.036 | [-0.055, +0.127] | within noise (6 queries differ) |
| final hit@8 | 0.782 | 0.782 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.714 | 0.729 | +0.015 | [-0.029, +0.061] | within noise (8 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.621 | 0.621 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.429 | 0.571 | +0.143 | [+0.000, +0.429] | within noise (1 queries differ) |
| final hit@8 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.571 | 0.607 | +0.036 | [-0.107, +0.214] | within noise (2 queries differ) |

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
| chunk MRR | 0.522 | 0.522 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
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
| final MRR | 0.786 | 0.857 | +0.071 | [+0.000, +0.214] | within noise (1 queries differ) |

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
| chunk MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### filters=off vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.891 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk hit@40 | 0.855 | 0.927 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk MRR | 0.689 | 0.727 | +0.038 | [-0.031, +0.118] | within noise (10 queries differ) |
| final hit@1 | 0.655 | 0.709 | +0.055 | [-0.018, +0.127] | within noise (5 queries differ) |
| final hit@8 | 0.782 | 0.855 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| final MRR | 0.714 | 0.771 | +0.057 | [-0.006, +0.136] | within noise (6 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.621 | 0.621 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
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
| chunk MRR | 0.522 | 0.522 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.600 | 0.600 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.800 | 0.800 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.700 | 0.700 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

#### type: time_scoped (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.833 | 0.679 | -0.155 | [-0.369, -0.012] | worse (3 queries differ) |
| final hit@1 | 0.714 | 0.714 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.786 | 0.735 | -0.051 | [-0.153, +0.000] | within noise (1 queries differ) |

#### type: filter_trap (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |
| chunk hit@40 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |
| chunk MRR | 0.000 | 0.875 | +0.875 | [+0.625, +1.000] | better (4 queries differ) |
| final hit@1 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |
| final hit@8 | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |
| final MRR | 0.000 | 1.000 | +1.000 | [+1.000, +1.000] | better (4 queries differ) |

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
| chunk MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### derived=off vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.836 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk hit@40 | 0.855 | 0.873 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| chunk MRR | 0.689 | 0.695 | +0.006 | [-0.000, +0.017] | within noise (4 queries differ) |
| final hit@1 | 0.655 | 0.636 | -0.018 | [-0.055, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.782 | 0.782 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.714 | 0.705 | -0.009 | [-0.027, +0.000] | within noise (1 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.621 | 0.620 | -0.001 | [-0.004, +0.000] | within noise (1 queries differ) |
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
| chunk MRR | 0.522 | 0.533 | +0.011 | [+0.000, +0.033] | within noise (1 queries differ) |
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
| final MRR | 0.786 | 0.786 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| chunk MRR | 0.750 | 0.760 | +0.010 | [+0.000, +0.031] | within noise (1 queries differ) |
| final hit@1 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### chunk_target=800 vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.873 | +0.055 | [+0.000, +0.127] | within noise (3 queries differ) |
| chunk hit@40 | 0.855 | 0.927 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk MRR | 0.689 | 0.692 | +0.004 | [-0.047, +0.053] | within noise (9 queries differ) |
| final hit@1 | 0.655 | 0.618 | -0.036 | [-0.091, +0.000] | within noise (2 queries differ) |
| final hit@8 | 0.782 | 0.764 | -0.018 | [-0.091, +0.036] | within noise (3 queries differ) |
| final MRR | 0.714 | 0.686 | -0.027 | [-0.091, +0.018] | within noise (3 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.621 | 0.621 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
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
| chunk MRR | 0.522 | 0.522 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
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
| final MRR | 0.786 | 0.643 | -0.143 | [-0.429, +0.000] | within noise (1 queries differ) |

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
| chunk MRR | 0.750 | 0.632 | -0.118 | [-0.375, +0.022] | within noise (2 queries differ) |
| final hit@1 | 0.750 | 0.500 | -0.250 | [-0.750, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.750 | 0.500 | -0.250 | [-0.750, +0.000] | within noise (1 queries differ) |
| final MRR | 0.750 | 0.500 | -0.250 | [-0.750, +0.000] | within noise (1 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

### chunk_target=3200 vs base

#### all answerable queries (n=55)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.818 | 0.891 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk hit@40 | 0.855 | 0.927 | +0.073 | [+0.018, +0.145] | better (4 queries differ) |
| chunk MRR | 0.689 | 0.735 | +0.046 | [+0.009, +0.093] | better (6 queries differ) |
| final hit@1 | 0.655 | 0.655 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.782 | 0.800 | +0.018 | [+0.000, +0.055] | within noise (1 queries differ) |
| final MRR | 0.714 | 0.723 | +0.009 | [+0.000, +0.027] | within noise (1 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.621 | 0.621 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
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
| chunk MRR | 0.522 | 0.525 | +0.003 | [+0.000, +0.008] | within noise (1 queries differ) |
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
| final MRR | 0.786 | 0.786 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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
| chunk MRR | 0.000 | 0.667 | +0.667 | [+0.500, +1.000] | better (3 queries differ) |
| final hit@1 | 0.000 | 0.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.000 | 0.333 | +0.333 | [+0.000, +1.000] | within noise (1 queries differ) |
| final MRR | 0.000 | 0.167 | +0.167 | [+0.000, +0.500] | within noise (1 queries differ) |

#### type: non_english (n=4)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.750 | 1.000 | +0.250 | [+0.000, +0.750] | within noise (1 queries differ) |
| chunk MRR | 0.750 | 0.757 | +0.007 | [+0.000, +0.020] | within noise (1 queries differ) |
| final hit@1 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.750 | 0.750 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

Absent questions that still returned results: base 6/6, variant 6/6.

