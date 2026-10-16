# Abstention rule selection (dev only)

dev: 12 absent, 52 answerable. Constraint: wrongly abstained <= 5% of dev answerable.

### Single signal: score_norm

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| score_norm < 0.36 | 1/12 | 0/52 | 0 |
| score_norm < 0.50 | 1/12 | 0/52 | 0 |
| score_norm < 0.76 | 1/12 | 1/52 | 0 |
| score_norm < 0.78 | 2/12 | 2/52 | 1 |
| score_norm < 0.87 | 2/12 | 2/52 | 1 |
| score_norm < 0.91 | 2/12 | 4/52 | 3 |
| score_norm < 0.94 | 2/12 | 4/52 | 3 |
| score_norm < 0.95 | 3/12 | 5/52 | 4 |
| score_norm < 0.96 | 3/12 | 6/52 | 5 |
| score_norm < 0.97 | 3/12 | 8/52 | 7 |
| score_norm < 0.98 | 4/12 | 8/52 | 7 |
| score_norm < 0.99 | 5/12 | 12/52 | 11 |
| score_norm < 1.00 | 8/12 | 26/52 | 22 |

### Single signal: support

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| support < 0.17 | 2/12 | 2/52 | 1 |
| support < 0.25 | 2/12 | 2/52 | 1 |
| support < 0.33 | 2/12 | 4/52 | 2 |
| support < 0.50 | 6/12 | 7/52 | 4 |
| support < 0.57 | 6/12 | 11/52 | 8 |
| support < 0.60 | 6/12 | 12/52 | 9 |
| support < 0.67 | 8/12 | 17/52 | 14 |
| support < 0.73 | 8/12 | 18/52 | 15 |
| support < 0.75 | 8/12 | 18/52 | 15 |
| support < 0.80 | 9/12 | 23/52 | 19 |
| support < 1.00 | 9/12 | 26/52 | 22 |

### Single signal: dense_sim

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| dense_sim < 0.12 | 0/12 | 1/52 | 0 |
| dense_sim < 0.14 | 0/12 | 2/52 | 1 |
| dense_sim < 0.15 | 0/12 | 3/52 | 2 |
| dense_sim < 0.18 | 1/12 | 3/52 | 2 |
| dense_sim < 0.20 | 2/12 | 3/52 | 2 |
| dense_sim < 0.22 | 2/12 | 3/52 | 2 |
| dense_sim < 0.24 | 3/12 | 3/52 | 2 |
| dense_sim < 0.26 | 4/12 | 5/52 | 4 |
| dense_sim < 0.28 | 5/12 | 5/52 | 4 |
| dense_sim < 0.30 | 5/12 | 7/52 | 5 |
| dense_sim < 0.31 | 6/12 | 8/52 | 6 |
| dense_sim < 0.32 | 6/12 | 8/52 | 6 |
| dense_sim < 0.33 | 6/12 | 9/52 | 7 |
| dense_sim < 0.35 | 6/12 | 11/52 | 8 |
| dense_sim < 0.36 | 6/12 | 11/52 | 8 |
| dense_sim < 0.37 | 6/12 | 13/52 | 10 |
| dense_sim < 0.38 | 6/12 | 14/52 | 11 |
| dense_sim < 0.39 | 6/12 | 15/52 | 12 |
| dense_sim < 0.41 | 6/12 | 16/52 | 13 |
| dense_sim < 0.42 | 6/12 | 19/52 | 16 |
| dense_sim < 0.44 | 7/12 | 20/52 | 17 |
| dense_sim < 0.46 | 8/12 | 21/52 | 18 |
| dense_sim < 0.47 | 8/12 | 23/52 | 20 |
| dense_sim < 0.48 | 10/12 | 24/52 | 21 |
| dense_sim < 0.50 | 11/12 | 26/52 | 23 |
| dense_sim < 0.51 | 11/12 | 29/52 | 25 |
| dense_sim < 0.52 | 11/12 | 31/52 | 27 |
| dense_sim < 0.53 | 11/12 | 32/52 | 28 |
| dense_sim < 0.54 | 11/12 | 34/52 | 29 |
| dense_sim < 0.55 | 11/12 | 34/52 | 29 |
| dense_sim < 0.56 | 11/12 | 39/52 | 33 |
| dense_sim < 0.57 | 11/12 | 40/52 | 34 |
| dense_sim < 0.59 | 12/12 | 41/52 | 35 |
| dense_sim < 0.60 | 12/12 | 43/52 | 37 |
| dense_sim < 0.63 | 12/12 | 44/52 | 38 |
| dense_sim < 0.64 | 12/12 | 44/52 | 38 |
| dense_sim < 0.68 | 12/12 | 47/52 | 41 |
| dense_sim < 0.73 | 12/12 | 48/52 | 42 |
| dense_sim < 0.75 | 12/12 | 50/52 | 44 |
| dense_sim < 0.96 | 12/12 | 51/52 | 45 |
| dense_sim < 0.97 | 12/12 | 52/52 | 46 |

### Single signal: chunk_sim

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| chunk_sim < 0.18 | 1/12 | 1/52 | 1 |
| chunk_sim < 0.21 | 1/12 | 2/52 | 1 |
| chunk_sim < 0.23 | 3/12 | 2/52 | 1 |
| chunk_sim < 0.24 | 3/12 | 3/52 | 2 |
| chunk_sim < 0.29 | 3/12 | 3/52 | 2 |
| chunk_sim < 0.30 | 3/12 | 5/52 | 3 |
| chunk_sim < 0.31 | 3/12 | 5/52 | 3 |
| chunk_sim < 0.32 | 3/12 | 6/52 | 4 |
| chunk_sim < 0.34 | 4/12 | 9/52 | 6 |
| chunk_sim < 0.35 | 4/12 | 11/52 | 8 |
| chunk_sim < 0.36 | 4/12 | 11/52 | 8 |
| chunk_sim < 0.37 | 5/12 | 13/52 | 10 |
| chunk_sim < 0.38 | 5/12 | 13/52 | 10 |
| chunk_sim < 0.40 | 5/12 | 15/52 | 12 |
| chunk_sim < 0.41 | 5/12 | 16/52 | 13 |
| chunk_sim < 0.42 | 5/12 | 18/52 | 15 |
| chunk_sim < 0.43 | 6/12 | 20/52 | 17 |
| chunk_sim < 0.44 | 6/12 | 22/52 | 19 |
| chunk_sim < 0.45 | 6/12 | 23/52 | 20 |
| chunk_sim < 0.46 | 6/12 | 25/52 | 21 |
| chunk_sim < 0.47 | 9/12 | 25/52 | 21 |
| chunk_sim < 0.48 | 9/12 | 26/52 | 22 |
| chunk_sim < 0.49 | 9/12 | 27/52 | 23 |
| chunk_sim < 0.50 | 10/12 | 31/52 | 27 |
| chunk_sim < 0.51 | 10/12 | 33/52 | 29 |
| chunk_sim < 0.53 | 10/12 | 34/52 | 30 |
| chunk_sim < 0.55 | 10/12 | 34/52 | 30 |
| chunk_sim < 0.56 | 11/12 | 35/52 | 31 |
| chunk_sim < 0.57 | 11/12 | 37/52 | 32 |
| chunk_sim < 0.59 | 11/12 | 39/52 | 34 |
| chunk_sim < 0.60 | 11/12 | 41/52 | 36 |
| chunk_sim < 0.63 | 11/12 | 41/52 | 36 |
| chunk_sim < 0.65 | 11/12 | 43/52 | 38 |
| chunk_sim < 0.67 | 11/12 | 45/52 | 40 |
| chunk_sim < 0.68 | 12/12 | 46/52 | 41 |
| chunk_sim < 0.69 | 12/12 | 49/52 | 43 |
| chunk_sim < 0.76 | 12/12 | 50/52 | 44 |
| chunk_sim < 0.96 | 12/12 | 50/52 | 44 |
| chunk_sim < 0.97 | 12/12 | 52/52 | 46 |

### Single signal: chunk_support

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| chunk_support < 0.25 | 1/12 | 1/52 | 0 |
| chunk_support < 0.33 | 1/12 | 3/52 | 2 |
| chunk_support < 0.50 | 3/12 | 5/52 | 3 |
| chunk_support < 0.57 | 3/12 | 7/52 | 5 |
| chunk_support < 0.60 | 3/12 | 8/52 | 6 |
| chunk_support < 0.67 | 5/12 | 14/52 | 12 |
| chunk_support < 0.73 | 5/12 | 15/52 | 13 |
| chunk_support < 0.75 | 5/12 | 15/52 | 13 |
| chunk_support < 0.80 | 6/12 | 20/52 | 17 |
| chunk_support < 0.83 | 6/12 | 23/52 | 20 |
| chunk_support < 1.00 | 6/12 | 24/52 | 21 |

### Single signal: unseen_inv

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| unseen_inv < 0.33 | 0/12 | 2/52 | 1 |
| unseen_inv < 0.50 | 3/12 | 3/52 | 1 |
| unseen_inv < 0.57 | 3/12 | 5/52 | 3 |
| unseen_inv < 0.67 | 5/12 | 10/52 | 8 |
| unseen_inv < 0.73 | 5/12 | 11/52 | 9 |
| unseen_inv < 0.75 | 5/12 | 11/52 | 9 |
| unseen_inv < 0.80 | 6/12 | 14/52 | 12 |
| unseen_inv < 1.00 | 6/12 | 17/52 | 15 |

### Single signal: ident

| threshold | absent abstained | answerable wrongly abstained | of which would have hit |
|---|---|---|---|
| ident < 1.00 | 1/12 | 0/52 | 0 |

## Chosen on dev

Rule: abstain when ident < 1.00 or time_support < 0.33 or unseen >= 0.33 and chunk_sim < 0.23

dev: absent abstained 5/12, answerable wrongly abstained 1/52 (0 would have hit)

test (not used for selection): absent abstained 2/10, answerable wrongly abstained 1/48 (0 would have hit)
