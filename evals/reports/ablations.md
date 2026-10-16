# Paired comparison against `base`

Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.

### mode=dense_only vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.796 | -0.019 | [-0.074, +0.037] | within noise (3 queries differ) |
| chunk hit@40 | 0.852 | 0.852 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.669 | 0.624 | -0.044 | [-0.106, +0.010] | within noise (12 queries differ) |
| final hit@1 | 0.611 | 0.611 | +0.000 | [-0.056, +0.056] | within noise (2 queries differ) |
| final hit@8 | 0.741 | 0.741 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.668 | 0.665 | -0.003 | [-0.031, +0.025] | within noise (3 queries differ) |

#### type: paraphrase (n=7)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.857 | 0.857 | +0.000 | [-0.429, +0.429] | within noise (2 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.633 | 0.547 | -0.087 | [-0.396, +0.160] | within noise (3 queries differ) |
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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.806 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.667 | 0.667 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 5/5.

### mode=bm25_only vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.833 | +0.019 | [+0.000, +0.056] | within noise (1 queries differ) |
| chunk hit@40 | 0.852 | 0.833 | -0.019 | [-0.056, +0.000] | within noise (1 queries differ) |
| chunk MRR | 0.669 | 0.686 | +0.017 | [-0.031, +0.065] | within noise (13 queries differ) |
| final hit@1 | 0.611 | 0.648 | +0.037 | [+0.000, +0.093] | within noise (2 queries differ) |
| final hit@8 | 0.741 | 0.759 | +0.019 | [-0.037, +0.074] | within noise (3 queries differ) |
| final MRR | 0.668 | 0.693 | +0.025 | [-0.022, +0.083] | within noise (4 queries differ) |

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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.917 | +0.111 | [+0.000, +0.278] | within noise (2 queries differ) |
| final hit@1 | 0.667 | 0.667 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 2/5.

### rerank_bonus=off vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.815 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 0.852 | 0.852 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.669 | 0.669 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.611 | 0.667 | +0.056 | [-0.037, +0.148] | within noise (7 queries differ) |
| final hit@8 | 0.741 | 0.741 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.668 | 0.701 | +0.032 | [-0.020, +0.090] | within noise (8 queries differ) |

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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.806 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.667 | 0.833 | +0.167 | [+0.000, +0.500] | within noise (1 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.722 | 0.833 | +0.111 | [+0.000, +0.333] | within noise (1 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 5/5.

### filters=off vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.889 | +0.074 | [+0.019, +0.148] | better (4 queries differ) |
| chunk hit@40 | 0.852 | 0.926 | +0.074 | [+0.019, +0.148] | better (4 queries differ) |
| chunk MRR | 0.669 | 0.702 | +0.034 | [-0.032, +0.108] | within noise (11 queries differ) |
| final hit@1 | 0.611 | 0.630 | +0.019 | [-0.074, +0.111] | within noise (7 queries differ) |
| final hit@8 | 0.741 | 0.796 | +0.056 | [-0.019, +0.130] | within noise (5 queries differ) |
| final MRR | 0.668 | 0.705 | +0.037 | [-0.037, +0.120] | within noise (8 queries differ) |

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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.639 | -0.167 | [-0.375, -0.014] | worse (3 queries differ) |
| final hit@1 | 0.667 | 0.333 | -0.333 | [-0.667, +0.000] | within noise (2 queries differ) |
| final hit@8 | 0.833 | 0.667 | -0.167 | [-0.500, +0.000] | within noise (1 queries differ) |
| final MRR | 0.722 | 0.472 | -0.250 | [-0.472, -0.056] | worse (3 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 5/5.

### derived=off vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.833 | +0.019 | [+0.000, +0.056] | within noise (1 queries differ) |
| chunk hit@40 | 0.852 | 0.870 | +0.019 | [+0.000, +0.056] | within noise (1 queries differ) |
| chunk MRR | 0.669 | 0.677 | +0.008 | [+0.000, +0.020] | better (5 queries differ) |
| final hit@1 | 0.611 | 0.593 | -0.019 | [-0.056, +0.000] | within noise (1 queries differ) |
| final hit@8 | 0.741 | 0.741 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.668 | 0.659 | -0.009 | [-0.028, +0.000] | within noise (1 queries differ) |

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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.806 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.667 | 0.667 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 5/5.

### chunk_target=800 vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.870 | +0.056 | [+0.000, +0.130] | within noise (3 queries differ) |
| chunk hit@40 | 0.852 | 0.926 | +0.074 | [+0.019, +0.148] | better (4 queries differ) |
| chunk MRR | 0.669 | 0.706 | +0.037 | [-0.017, +0.092] | within noise (11 queries differ) |
| final hit@1 | 0.611 | 0.630 | +0.019 | [+0.000, +0.056] | within noise (1 queries differ) |
| final hit@8 | 0.741 | 0.778 | +0.037 | [+0.000, +0.093] | within noise (2 queries differ) |
| final MRR | 0.668 | 0.696 | +0.028 | [+0.000, +0.074] | within noise (2 queries differ) |

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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.806 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.667 | 0.667 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 5/5.

### chunk_target=3200 vs base

#### all answerable queries (n=54)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 0.815 | 0.870 | +0.056 | [+0.000, +0.130] | within noise (3 queries differ) |
| chunk hit@40 | 0.852 | 0.907 | +0.056 | [+0.000, +0.130] | within noise (3 queries differ) |
| chunk MRR | 0.669 | 0.727 | +0.059 | [+0.019, +0.105] | better (7 queries differ) |
| final hit@1 | 0.611 | 0.648 | +0.037 | [+0.000, +0.093] | within noise (2 queries differ) |
| final hit@8 | 0.741 | 0.796 | +0.056 | [+0.000, +0.130] | within noise (3 queries differ) |
| final MRR | 0.668 | 0.715 | +0.046 | [+0.000, +0.111] | within noise (3 queries differ) |

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

#### type: time_scoped (n=6)

| metric | base | variant | diff | 95% CI | verdict |
|---|---|---|---|---|---|
| chunk hit@8 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk hit@40 | 1.000 | 1.000 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| chunk MRR | 0.806 | 0.806 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@1 | 0.667 | 0.667 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final hit@8 | 0.833 | 0.833 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |
| final MRR | 0.722 | 0.722 | +0.000 | [+0.000, +0.000] | within noise (0 queries differ) |

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

Absent questions that still returned results: base 5/5, variant 5/5.

