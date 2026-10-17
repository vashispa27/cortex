
### Invented gold set

| point | snapshots | chunks | vector pts | final hit@1 | final hit@8 | MRR | chunk hit@40 | absent answered | wrongly abstained | extras in final slots | rank-1 is extra | p50 / p95 / p99 ms | ingest s | snap/s | index MB (apparent / allocated) | MB per 1k vector pts | peak RSS MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inv-base | 36 | 87 | 369 | 82/102 | 98/102 | 0.877 | 101/102 | 12/22 | 2/102 | 0% | 0/112 | 8.3884 / 25.9058 / 44.3763 (best-of: 7.9238 / 22.8131) | 1 | 45.0839 | 178 / 14 | 38.7 | 351 |
| inv-hard | 456 | 1083 | 1759 | 28/102 | 59/102 | 0.367 | 92/102 | 18/22 | 6/102 | 89% | 81/114 | 22.4407 / 75.1792 / 106.2853 (best-of: 21.8444 / 73.9989) | 11 | 40.4369 | 204 / 76 | 43.3 | 381 |
| inv-real | 1376 | 5118 | 6415 | 72/102 | 87/102 | 0.775 | 97/102 | 16/22 | 3/102 | 64% | 17/115 | 97.8206 / 263.07 / 326.401 (best-of: 92.3488 / 241.6661) | 56 | 56.3491 | 663 / 520 | 81.1 | 370 |
| inv-1k | 1328 | 7026 | 8572 | 52/102 | 74/102 | 0.576 | 85/102 | 18/22 | 4/102 | 81% | 54/116 | 163.5784 / 418.5855 / 851.0338 (best-of: 156.7923 / 349.1556) | 42 | 38.6861 | 378 / 258 | 30.1 | 360 |
| inv-10k | 13343 | 70084 | 73069 | 45/102 | 62/102 | 0.488 | 73/102 | 18/22 | 3/102 | 88% | 64/117 | 296.4715 / 1128.4233 / 1939.9228 (best-of: 271.5626 / 904.987) | 775 | 21.5086 | 2427 / 2356 | 32.2 | 823 |

Per type, final hit@8 (answerable) and absent questions still answered (inv):

| type | inv-base | inv-hard | inv-real | inv-1k | inv-10k |
|---|---|---|---|---|---|
| absent | 12/21 answered | 17/21 answered | 16/21 answered | 17/21 answered | 17/21 answered |
| ambiguous_entity | 4/4 | 1/4 | 4/4 | 4/4 | 3/4 |
| app_scoped | 4/4 | 2/4 | 4/4 | 3/4 | 2/4 |
| boundary_fact | 5/5 | 2/5 | 4/5 | 0/5 | 0/5 |
| domain_scoped | 5/5 | 3/5 | 5/5 | 4/5 | 3/5 |
| filter_trap | 15/15 | 11/15 | 14/15 | 13/15 | 9/15 |
| keyword | 8/8 | 4/8 | 6/8 | 4/8 | 5/8 |
| multi_snapshot | 7/7 | 5/7 | 6/7 | 4/7 | 3/7 |
| near_duplicate_version | 8/8 | 6/8 | 8/8 | 5/8 | 6/8 |
| non_english | 5/6 | 4/6 | 5/6 | 5/6 | 5/6 |
| paraphrase | 10/12 | 3/12 | 7/12 | 6/12 | 6/12 |
| speaker | 8/8 | 5/8 | 7/8 | 7/8 | 6/8 |
| time_scoped | 19/20 | 13/20 | 17/20 | 19/20 | 14/20 |
