# Baseline analysis (real Safari Accessibility captures of the 24 invented pages, 61 questions)

Numbers come from `baseline.json` / `baseline.md`, `ablations/` and `ablations.md` in this directory, run
with default parameters (hybrid, RRF k=60, prefetch 80, fused 40, final 8; filters, rerank bonus and
derived points on). The corpus is `real_capture_invented_content`: each page was opened in Safari and
captured by the real helper; only app id, title, URL and observation time were rewritten from the page's
`facts.json` and unrecognised browser-chrome text was redacted (`CAPTURE.md`). Two baseline runs, and the
ablation set run twice, were identical apart from timing. Counts are queries; with 55 answerable questions
a swing of 2–3 queries is noise. The earlier run on hand-authored trees is kept in `hand-authored/`; its
numbers are within a few queries of these (final hit@8 75% vs 78%).

## Findings about capture itself

* The AX helper reads only text that is on screen. The first capture lost 8 planted answers on four pages
  that scrolled past the window (the eval refused to run: the gold-vs-cleaned-body check failed loudly).
  Those pages now use a compact layout so they fit. In real use, anything below the fold of a long chat or
  article is never stored; that is a capture limit, not a retrieval one, and it is not in these numbers.
* Real trees yield 71 chunks over 23 snapshots (hand-authored: 83). Cleaning kept 66/66 planted facts.

## Headline

| | chunk level (Qdrant list) | final 8 results (`ask`) |
|---|---|---|
| hit@1 | 32/55 (58%) | 36/55 (65%) |
| hit@8 | 45/55 (82%) | 43/55 (78%) |
| hit@40 | 47/55 (85%) | – |
| MRR | 0.689 (nDCG@10 0.722) | 0.714 |

* dev final hit@8 20/29 (69%), test 23/26 (88%): the gap is the size of the noise.
* In 4/55 questions (7%) the answer was in the chunk list but not in what `ask` shows, because the collapse
  keeps one chunk per snapshot (q008 q012 q017 q054).
* Cost: ingest 0.9 s, query p50 8 ms / p95 11 ms (debug build), 176 MB index on disk.

## Where it is weakest, by question type

| type | final hit@8 | note |
|---|---|---|
| filter_trap | 0/4 | every trap got an app filter; 2 returned nothing, 2 returned the wrong app |
| boundary_fact | 0/3 | all three answers are split across chunks |
| absent | 0/6 abstain | 6/6 returned results (counts the time-scoped absent question) |
| paraphrase | 5/7 | hit@1 only 3/7 |
| non_english | 3/4 | the English query on the Hindi page fails |
| near_duplicate_version | 4/5 | chunk hit@1 only 1/5; stale version often first |
| time_scoped | 6/7 | all 7 reach the chunk list |
| keyword, speaker, multi_snapshot, ambiguous_entity, domain_scoped, app_scoped | 5/5, 4/4, 4/4, 4/4, 4/4, 4/4 | strong, mostly BM25 and the `x.com` speaker labels |

## Hypotheses

| # | verdict | evidence |
|---|---|---|
| 1 absent facts still return 8 results | **held** | 6/6 absent questions returned results (`bm25_only` abstains on 3/6 only because no query term matches). Top fused score: absent mean 0.025 vs answerable 0.033 (min 0.029); AUROC 0.79 (chunk) / 0.94 (final) on 6 vs 53 queries, so a threshold looks feasible but is calibrated on 6 points. No threshold implemented. |
| 2 ordinary words become app filters, no fallback | **held** | 4/4 filter_trap questions got an `app` clause; `edge` and `messages` returned zero results, `terminal` and `notes` returned the wrong app's pages; 0/4 answered, 4/4 with `filters=off`. Probes: "the slack of the rope" and "chrome plating process" are also filtered. `messages` maps to `com.apple.iChat`, not the Messages app id. |
| 3 facts straddle the 1,600-byte boundary | **held for planted cases, rare naturally** | 3/3 planted straddles are never retrieved whole; 3/50 (6%) of gold answers are split, 0/47 of the others. Chunk target 800 or 3200 puts all three in one chunk (chunk hit@8 0→3/3) but only by moving the boundary (no overlap), and only 1/3 then reaches the text `ask` shows. |
| 4 chunks embedded without title/app/speaker lose meaning | **plausible, not isolated** | 27/71 chunks (38%) are under 100 bytes and 25/71 (35%) share no word with their page title; Slack sender names never reach the body (q015, q043). Isolating it needs a fix (prepend context), so only structural evidence. |
| 5 derived points compete; entity regex makes junk | **competition yes, harm small; junk yes** | derived points hold 184/504 (37%) of top-10 chunk slots but only 1/61 queries has one at rank 1; `derived=off`: final hit@8 43→43, hit@1 36→35, chunk MRR +0.006 (CI touches 0). 140 entity points for 71 chunks; 8 are calendar words, many are verbs or question words ("Add", "What", "Please"), and some contain newlines ("Home\nExplore"). |
| 6 keyword rerank bonus: help or hurt | **no evidence it helps** | `rerank_bonus=off`: final hit@1 36→38, MRR 0.714→0.729, hit@8 43→43, all CIs include 0. |
| 7 near-duplicates crowd the top 8 | **held, modest at this corpus size** | 12/388 final slots (3%) near-identical (Jaccard ≥0.8), 27/388 (7%) at ≥0.5; 12/61 queries have at least one. Dedup keys on the whole body, so one edited line makes a new snapshot: the budget edits share 10/14 chunks, the garden scroll pair 8/14. Stale text ranks above the right text in 2/8 questions that carry a stale answer. |
| 8 Model2Vec underperforms BM25 on paraphrase | **not supported, not refuted** | paraphrase final hit@8: dense_only 5/7, bm25_only 6/7, hybrid 5/7; overall final MRR 0.674 / 0.729 / 0.714. One query apart, within noise. Dense alone is worse at chunk MRR (0.660 vs 0.712 BM25, 0.689 hybrid). |
| 9 byte-based size shortens non-English chunks | **held** | Hindi chunks average 1,190 bytes but 472 characters (about 2.5 bytes per character); the longest Hindi chunk is 594 characters against 1,593 for English. The English query on the Hindi page found nothing (q058). |
| 10 date handling is narrow; observation check runs after the cut | **held** | `time_bounds` produced no window for 6 of 9 phrasings ("last week", "this morning", "two days ago", "last month", "on October 14", "last Friday"). The per-snapshot observation check runs after Qdrant's top-40: it dropped hits in q020 and q023; q023 (nothing observed that day) still returned 4 results from other pages. Filters are net useful for dated questions: with `filters=off` time_scoped chunk MRR falls 0.83→0.68 (CI excludes 0). |

## Ablations (details in `ablations.md`, paired bootstrap 95% CI)

| variant | final hit@1 | final hit@8 | final MRR | chunk MRR |
|---|---|---|---|---|
| base (hybrid) | 36 | 43 | 0.714 | 0.689 |
| dense_only | 34 | 41 | 0.674 | 0.660 |
| bm25_only | 37 | 44 | 0.729 | 0.712 |
| rerank_bonus off | 38 | 43 | 0.729 | 0.689 |
| filters off | 39 | 47 | 0.771 | 0.727 |
| derived off | 35 | 43 | 0.705 | 0.695 |
| chunk_target 800 | 34 | 42 | 0.686 | 0.692 |
| chunk_target 3200 | 36 | 44 | 0.723 | 0.735 |

Intervals that exclude zero: `filters=off` (filter_trap 0→4/4, overall final hit@8 43→47 [+0.02, +0.15],
time_scoped chunk MRR worse), `chunk_target` 800/3200 (boundary_fact chunk hit@8 0→3/3; 3200 also chunk MRR
+0.046). Every other overall final-level difference, and everything for `mode`, `rerank_bonus` and
`derived`, is within noise. A larger chunk target looks better mainly because most pages are shorter than one
chunk, so it removes the planted straddles; it is not evidence that 3,200 bytes suits real long pages.

## Suggested order of fixes (by measured impact, then by trust)

1. **App-word filter** (soft or phrase-based, with a fallback when it returns nothing): the one clear gain,
   +4 questions and the only overall final-level change whose interval excludes zero. Keep the date and
   domain filters (they help dated questions).
2. **Final stage keeps one chunk per snapshot**: 4 questions have the answer in the chunk list but lose it
   (7%); pass more than one chunk per snapshot or choose the answer-bearing chunk.
3. **Abstention**: 6/6 absent questions answered. No hit-rate effect, large trust effect; calibrate a score
   threshold on `dev`, report on `test`, and grow the absent set first (6 is too few).
4. **Chunk boundaries**: overlap or heading/label-aware boundaries; 3 planted cases (the natural rate is
   0/47 here, so verify on real pages before spending effort).
5. **Context in the embedded text** (title, app, speaker) and **sender retention for Slack/Messages in the
   cleaner**: not measurable until built; 35–38% of chunks are context-poor.
6. **Date parsing and the post-cut observation check**: 6 of 9 common phrasings ignored; small effect here
   but silent when it bites.
7. **Dedup by chunk or edit distance** instead of whole body: 57–71% of chunks in edited/scrolled pages
   are stored twice; stale ranks above new in 2 questions.
8. **Derived points / rerank bonus**: both within noise; revisit after 1–3 with a larger gold set.
9. **Non-English sizing** (characters, not bytes) and a multilingual embedding.
10. **Capture of off-screen text** (scroll-aware capture) is outside retrieval but caps recall for long pages.

Next: grow the gold set beyond 61 questions so per-type rows are not decided by one query, and capture a few
real (non-invented) trees only with the owner's approval.
