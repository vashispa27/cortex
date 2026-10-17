
### Real gold set

| point | snapshots | chunks | vector pts | final hit@1 | final hit@8 | MRR | chunk hit@40 | absent answered | wrongly abstained | extras in final slots | rank-1 is extra | p50 / p95 / p99 ms | ingest s | snap/s | index MB (apparent / allocated) | MB per 1k vector pts | peak RSS MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| real-base | 1385 | 5262 | 6434 | 43/99 | 72/99 | 0.541 | 84/99 | 21/26 | 4/99 | 0% | 0/116 | 74.6335 / 167.1835 / 202.6044 (best-of: 72.8692 / 159.6251) | 46 | 76.2702 | 672 / 538 | 83.7 | 4860 |
| real-1k | 2677 | 12201 | 14687 | 40/99 | 65/99 | 0.489 | 83/99 | 23/26 | 5/99 | 13% | 15/117 | 102.9278 / 212.6872 / 555.6405 (best-of: 100.3735 / 206.9888) | 90 | 56.7989 | 872 / 772 | 52.5 | 4697 |
| real-mut | 2043 | 7908 | 9851 | 43/99 | 66/99 | 0.521 | 84/99 | 24/26 | 4/99 | 26% | 20/119 | 87.8859 / 202.9095 / 304.1355 (best-of: 86.2082 / 184.7745) | 68 | 63.9493 | 920 / 814 | 82.6 | 3973 |

Per type, final hit@8 (answerable) and absent questions still answered (real):

| type | real-base | real-1k | real-mut |
|---|---|---|---|
| absent | 21/26 answered | 23/26 answered | 24/26 answered |
| ambiguous_entity | 1/1 | 1/1 | 1/1 |
| app_scoped | 6/6 | 5/6 | 6/6 |
| code | 3/5 | 2/5 | 3/5 |
| domain_scoped | 8/9 | 8/9 | 8/9 |
| filter_trap | 3/5 | 3/5 | 3/5 |
| keyword | 7/8 | 6/8 | 6/8 |
| long_document | 2/3 | 2/3 | 1/3 |
| mixed_language | 1/3 | 1/3 | 1/3 |
| multi_snapshot | 3/4 | 2/4 | 2/4 |
| near_duplicate_version | 2/5 | 2/5 | 2/5 |
| paraphrase | 12/19 | 10/19 | 10/19 |
| repeat_capture | 2/3 | 2/3 | 2/3 |
| short_snapshot | 1/3 | 1/3 | 1/3 |
| speaker | 7/7 | 7/7 | 7/7 |
| table | 4/4 | 4/4 | 4/4 |
| terminal_output | 3/5 | 2/5 | 2/5 |
| time_scoped | 7/9 | 7/9 | 7/9 |
