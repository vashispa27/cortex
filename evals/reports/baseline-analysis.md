# Baseline analysis (hand-authored AX fixtures, 24 pages, 61 questions)

Numbers come from `baseline.json` / `baseline.md` and `ablations/` + `ablations.md` in this directory,
produced at commit `9eb3aca` with default parameters (hybrid, RRF k=60, prefetch 80, fused 40, final 8,
filters, rerank bonus and derived points on). Two runs, and the ablation set run twice, were identical
apart from timing. Counts are queries; with 55 answerable questions a swing of 2–3 queries is noise.
The fixtures are synthesized from the page definitions until `CAPTURE.md` is run, so treat absolute
numbers as provisional; the comparisons between variants are what the harness is for.

## Headline

| | chunk level (Qdrant list) | final 8 results (`ask`) |
|---|---|---|
| hit@1 | 31/55 (56%) | 34/55 (62%) |
| hit@8 | 45/55 (82%) | 41/55 (75%) |
| hit@40 | 47/55 (85%) | – |
| MRR | 0.675 (nDCG@10 0.708) | 0.674 |

* dev final hit@8 20/29 (69%), test 21/26 (81%): the split gap is the size of the noise.
* In 6/55 questions (11%) the answer was in the chunk list but not in what `ask` shows, because the
  collapse keeps one chunk per snapshot and the snippet picks other lines (q008 q012 q017 q028 q054 q059).
* Cost: ingest of 24 fixtures 0.8 s, query p50 9 ms / p95 13 ms (debug build), 175 MB index on disk.

## Where it is weakest, by question type

| type | final hit@8 | note |
|---|---|---|
| filter_trap | 0/4 | every trap got an app filter; 2 returned nothing, 2 returned the wrong app |
| boundary_fact | 0/3 | all three answers are split across chunks |
| absent | 0/6 abstain | 6/6 returned 8 results (counts the time-scoped absent question) |
| non_english | 2/4 | English query on the Hindi page fails; two Hindi answers lost at the final stage |
| paraphrase | 5/7 | hit@1 only 3/7 |
| app_scoped | 3/4 | hit@1 2/4 (stale "standup moved" snapshot ranks first) |
| near_duplicate_version | 4/5 | stale version ranked above the newer one in 2/8 questions with a stale answer |
| time_scoped | 6/7 | all 7 reach the chunk list; filters help (see ablation) |
| keyword, speaker, multi_snapshot, ambiguous_entity, domain_scoped | 5/5, 4/4, 4/4, 4/4, 4/4 | strong, mostly via BM25 and `x.com` speaker labels |

## Hypotheses

| # | verdict | evidence |
|---|---|---|
| 1 absent facts still return 8 results | **held** | 6/6 absent questions returned results (`bm25_only` abstains on 3/6 only because no query term matches). Top fused score: absent mean 0.025 vs answerable 0.033; AUROC 0.77 (chunk) / 0.93 (final) on 6 vs 53 queries, so a score threshold looks feasible but is calibrated on 6 points. No threshold implemented. |
| 2 ordinary words become app filters, no fallback | **held** | 4/4 filter_trap questions got an `app` clause; `edge` and `messages` returned zero results, `terminal` and `notes` returned the wrong app's pages; 0/4 answered, 3/4 with `filters=off` (CI [+0.25, +1.0]). Probes: "the slack of the rope" and "chrome plating process" are also filtered. `messages` maps to `com.apple.iChat`, which is not the Messages app id. |
| 3 facts straddle the 1,600-byte boundary | **held for planted cases, rare naturally** | 3/3 planted straddles are never retrieved whole; 3/50 (6%) of all gold answers are split, 0/47 of the others. Chunk target 800 or 3200 fixes these three but only by moving the boundary (no overlap), so some other string splits instead. |
| 4 chunks embedded without title/app/speaker lose meaning | **plausible, not isolated** | 31/83 chunks (37%) are under 100 bytes and 29/83 (35%) share no word with their page title; Slack sender names never reach the body (q015, q043 depend on luck). Isolating the effect needs a fix (prepend context), so only structural evidence here. |
| 5 derived points compete; entity regex makes junk | **competition yes, harm small; junk yes** | derived points hold 170/507 (34%) of top-10 chunk slots but only 2/61 queries have one at rank 1; `derived=off` changes final hit@8 by 0 (41→41), hit@1 by −1, chunk MRR +0.008 (CI just above 0). 138 entity points for 83 chunks; 15 contain newlines ("Home\nExplore", "December\n\nRisks"), 8 are calendar words, and many are verbs or question words ("Add", "What", "Please"). |
| 6 keyword rerank bonus: help or hurt | **no evidence it helps** | `rerank_bonus=off`: final hit@1 34→37, MRR 0.674→0.706, hit@8 41→41, all CIs include 0 (7 queries change). |
| 7 near-duplicates crowd the top 8 | **held, modest at this corpus size** | 15/388 final slots (4%) near-identical (Jaccard ≥0.8), 27/388 (7%) at ≥0.5; 15/61 queries have at least one. Dedup keys on the whole body, so one edited line makes a new snapshot: the budget edits share 16/20 chunks, the garden scroll pair 8/14. Stale text is ranked above the right text in 2/8 questions that carry a stale answer. |
| 8 Model2Vec underperforms BM25 on paraphrase | **not supported, not refuted** | paraphrase final hit@8: dense_only 5/7, bm25_only 6/7, hybrid 5/7; overall final MRR 0.671 / 0.699 / 0.674. One query apart, within noise. Dense alone is worse at chunk MRR (0.631 vs 0.691 BM25, 0.675 hybrid). |
| 9 byte-based size shortens non-English chunks | **held** | Hindi chunks average 1,065 bytes but 418 characters (about 2.5 bytes per character); the longest Hindi chunk is 606 characters against 1,593 for English. The same 1,600-byte target holds roughly a third of the text. English query on the Hindi page found nothing (q058). |
| 10 date handling is narrow; observation check runs after the cut | **held** | `time_bounds` produced no window for 6 of 9 phrasings ("last week", "this morning", "two days ago", "last month", "on October 14", "last Friday"). The per-snapshot observation check runs after Qdrant's top-40: it dropped hits in q020 and q023; q023 (nothing observed on that day) still returned 4 results from other pages. Filters are net useful for dated questions: with `filters=off` time_scoped final MRR falls 0.76→0.55 (CI excludes 0). |

## Ablations (details in `ablations.md`, paired bootstrap 95% CI)

Only three rows exclude zero: `filters=off` helps filter_trap (0→3/4) and hurts time_scoped; `chunk_target`
800/3200 fix the planted boundary cases. Everything else (mode, rerank bonus, derived) is within noise.

| variant | final hit@1 | final hit@8 | final MRR | chunk MRR |
|---|---|---|---|---|
| base (hybrid) | 34 | 41 | 0.674 | 0.675 |
| dense_only | 34 | 41 | 0.671 | 0.631 |
| bm25_only | 36 | 42 | 0.699 | 0.691 |
| rerank_bonus off | 37 | 41 | 0.706 | 0.675 |
| filters off | 35 | 44 | 0.711 | 0.708 |
| derived off | 33 | 41 | 0.665 | 0.682 |
| chunk_target 800 | 34 | 42 | 0.683 | 0.699 |
| chunk_target 3200 | 36 | 44 | 0.720 | 0.732 |

`filters=off` raises overall hit@8 by 3 because the 4 trap questions come back while some dated questions
fall; the right fix keeps the date and domain filters and fixes only the app-word rule. A larger chunk
target looks better here mainly because most pages are shorter than one chunk, so it removes the planted
straddles; it is not evidence that 3,200 bytes is a good target for real long pages.

## Suggested order of fixes (by measured impact, then by trust)

1. **App-word filter** (soft or phrase-based, with a fallback when it returns nothing): +3–4 questions
   (filter_trap 0→3/4), the only clear gain among the single-parameter ablations; keep date/domain filters.
2. **Final stage keeps one chunk per snapshot**: 6 questions have the answer in the chunk list but lose it
   (11%); pass more than one chunk per snapshot or choose by answer-bearing chunk.
3. **Abstention**: 6/6 absent questions answered. No hit-rate effect, large trust effect; calibrate a score
   threshold on `dev`, report on `test`, and grow the absent set first (6 is too few).
4. **Chunk boundaries**: overlap or heading/label-aware boundaries; 3 planted cases (the natural rate is 0/47
   here, so verify on real pages before spending effort).
5. **Context in the embedded text** (title, app, speaker) and **Slack/Messages sender retention in the
   cleaner**: not measurable until built; 35–37% of chunks are context-poor.
6. **Date parsing and the post-cut observation check**: 6 of 9 common phrasings ignored; small effect on
   this corpus but silent when it bites.
7. **Dedup by chunk or edit distance** instead of whole body: 57–80% of chunks in edited/scrolled pages
   are stored twice; stale-above-new in 2 questions.
8. **Derived points / rerank bonus**: both within noise; revisit after 1–3 with a larger gold set
   (derived-off and bonus-off each moved 1–3 queries).
9. **Non-English sizing** (characters not bytes) and a multilingual embedding: 2/4 on a Hindi page.

Before acting on any of these: capture the real AX trees (`../CAPTURE.md`), re-run, and grow the gold set
beyond 61 questions so the per-type rows are not decided by one query.
