# Fix summary: from the 122-question baseline to the final pipeline

Every row is a full eval run of the commit that introduced the fix (`evals/reports/fixes/NN-*.json`, with a `.md`
and a paired comparison against the previous step). Intervals are paired-bootstrap 95% CIs of the per-question
difference against step 0 (`evals/tools/fixes_summary.py`; the table below is its output). Steps 5-8 include two
speaker questions added with Fix 5 (q123, q124), so their denominators are 102 instead of 100; the paired columns use
the common questions only. Thresholds (abstention, version margin, time support) were chosen on `dev` and are
reported on `test` in the abstention column and in each fix's notes. Latency is a debug build on a loaded laptop:
read the jump from 9 to ~30 ms at step 3 (embedding three results to measure similarity, plus a term scan) as real
and the later wobble as noise.

| step | final hit@1 | final hit@8 | final MRR | Δ hit@1 vs step 0 [95% CI] | Δ hit@8 | Δ MRR | test: absent abstained · answerable wrongly abstained | near-dup slots | index | latency p50/p95 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 baseline (122 q) | 56/100 | 76/100 | 0.652 | – | – | – | 1/10 · 0/48 | 4.5% | 176 MB | 9 / 13 ms |
| 1 app-word filter | 66/100 | 86/100 | 0.752 | +0.100 [+0.050, +0.160] | +0.100 [+0.050, +0.160] | +0.100 [+0.050, +0.160] | 1/10 · 0/48 | 4.0% | 176 MB | 10 / 15 ms |
| 2 multi-chunk results | 69/100 | 91/100 | 0.792 | +0.130 [+0.070, +0.200] | +0.150 [+0.080, +0.220] | +0.140 [+0.075, +0.210] | 1/10 · 0/48 | 4.0% | 176 MB | 10 / 14 ms |
| 3 abstention | 69/100 | 91/100 | 0.792 | +0.130 [+0.070, +0.200] | +0.150 [+0.080, +0.220] | +0.140 [+0.075, +0.210] | 2/10 · 1/48 | 4.1% | 176 MB | 37 / 64 ms |
| 4 chunk boundaries/size | 71/100 | 96/100 | 0.823 | +0.150 [+0.080, +0.220] | +0.200 [+0.130, +0.280] | +0.171 [+0.102, +0.246] | 2/10 · 1/48 | 4.2% | 176 MB | 26 / 39 ms |
| 5 sender labels (prefix off) | 72/102 | 98/102 | 0.824 | +0.140 [+0.070, +0.220] | +0.200 [+0.130, +0.280] | +0.168 [+0.098, +0.245] | 2/10 · 1/49 | 4.0% | 176 MB | 32 / 91 ms |
| 6 date phrases + obs prefilter | 77/102 | 98/102 | 0.852 | +0.190 [+0.120, +0.270] | +0.200 [+0.130, +0.280] | +0.198 [+0.126, +0.273] | 3/10 · 1/49 | 3.1% | 176 MB | 27 / 40 ms |
| 7 version ordering | 82/102 | 98/102 | 0.877 | +0.250 [+0.170, +0.340] | +0.200 [+0.130, +0.280] | +0.228 [+0.157, +0.302] | 3/10 · 1/49 | 3.1% | 176 MB | 70 / 107 ms |
| 8 entity labels | 82/102 | 98/102 | 0.877 | +0.250 [+0.170, +0.340] | +0.200 [+0.130, +0.280] | +0.228 [+0.157, +0.302] | 3/10 · 1/49 | 3.1% | 176 MB | 62 / 92 ms |

Per affected type, final hit@8 (answerable questions of that type):

| step | filter_trap | paraphrase | boundary_fact | time_scoped | near_duplicate_version | non_english | speaker |
|---|---|---|---|---|---|---|---|
| 0 baseline (122 q) | 6/15 | 8/12 | 0/5 | 17/20 | 7/8 | 5/6 | 6/6 |
| 1 app-word filter | 15/15 | 8/12 | 0/5 | 17/20 | 7/8 | 5/6 | 6/6 |
| 2 multi-chunk results | 15/15 | 10/12 | 0/5 | 19/20 | 8/8 | 5/6 | 6/6 |
| 3 abstention | 15/15 | 10/12 | 0/5 | 19/20 | 8/8 | 5/6 | 6/6 |
| 4 chunk boundaries/size | 15/15 | 10/12 | 5/5 | 19/20 | 8/8 | 5/6 | 6/6 |
| 5 sender labels (prefix off) | 15/15 | 10/12 | 5/5 | 19/20 | 8/8 | 5/6 | 8/8 |
| 6 date phrases + obs prefilter | 15/15 | 10/12 | 5/5 | 19/20 | 8/8 | 5/6 | 8/8 |
| 7 version ordering | 15/15 | 10/12 | 5/5 | 19/20 | 8/8 | 5/6 | 8/8 |
| 8 entity labels | 15/15 | 10/12 | 5/5 | 19/20 | 8/8 | 5/6 | 8/8 |

## Which gains are real, which are noise

Real (interval excludes zero against the previous step, mechanism understood):
* **Fix 1, app-word filter:** final hit@8 76 -> 86 of 100. All 15 filter-trap questions answered (6/15 before);
  nothing else moved. Caveat: the traps and the phrase grammar were written by the same hand, so some of the gain is
  fit to those examples; the grammar is unit-tested on 30+ further phrases.
* **Fix 2, several chunks per result:** hit@8 86 -> 91 (CI [+1, +10]); the macros-table scenario and three of the four
  "answer in the chunk list, wrong chunk shown" questions now resolve.
* **Fix 4, character-sized, label-aware chunks:** hit@8 91 -> 96 (CI [+1, +10]); boundary_fact 0/5 -> 5/5. Overlap alone
  was not needed once boundaries were label-aware.
* **Fix 6, date phrases:** final hit@1 72 -> 77 (CI [+1, +10]) and chunk MRR up; all 14 new dated questions carry a window.

Borderline: **Fix 7, version ordering:** hit@1 77 -> 82, stale-above-answer 5/16 -> 1/16, but the interval touches zero.

Within noise or not adopted:
* **Fix 3, abstention:** hit rates unchanged. On test, absent questions abstained 1/10 -> 2/10 (3/10 after Fix 6) at the
  cost of 1 of 49 answerable questions wrongly abstained; the dev numbers were 5/12 -> 7/12 at 1/53. 12 of 22 absent
  questions are near-misses (the topic is in the corpus, the fact is not) and no cheap signal separates them from
  paraphrases: a 0.28 similarity cutoff abstained on 2/10 test absents but wrongly on 6/48 answerable ones.
* **Fix 5, context prefix:** implemented and measured, **off by default** (macros chunk rank 13 -> 9 but final hit@8
  98 -> 96, within noise). The Slack sender-label cleaner change is adopted (neutral on old questions; q123/q124 found).
* **Fix 7 collapse:** `dedup_jaccard` changes nothing here (no mergeable pair exists); safe by unit test, unproven by eval.
* Entity-label cleanup: identical metrics. `rerank_bonus=off` (+0.069 hit@1, CI includes 0): bonus kept.

## Remaining risks
* 12 of the 36 pages are hand-authored AX trees until captured (`evals/CAPTURE.md`); `article-hindi-dal-01` needs a
  recapture (its first capture lost the paragraphs below the fold; the page is compact now). Numbers on real captures of
  those pages may move.
* 124 questions: per-type rows are decided by a handful of queries; the corpus is engineered to expose weaknesses.
* Abstention remains weak on near-miss questions and has a small measured cost; the dated-question rule cost one hit on test.
* Cleaner and chunker changes apply to newly captured snapshots only; existing data is unchanged until the user runs
  `open-memory capture --apply-cleaning`. `cleaner::VERSION` was deliberately not bumped (it would force that on first start).
