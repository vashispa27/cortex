# Do the invented-corpus results transfer to real captures?

Aggregates only: no snapshot text, names or URLs from the real data appear in this file (they stay in the
git-ignored `evals/private/`). Same harness, same code, two corpora: the 36 invented fixtures with the 122
invented questions, and 1,385 snapshots exported from the author's own database with 125 questions written
for them (`evals/private/gold.jsonl`: 99 answerable, 26 absent, dev/test split by a stable hash of the id).
Every code version below was built from its commit with one patch (the extra question types registered in
`GOLD_TYPES`) and run on both corpora, so the columns are comparable. Real-data counts are out of 99 answerable
questions: a difference of 3–4 questions is noise (paired bootstrap intervals are given where they matter).

## How different the real data is

| | invented | real |
|---|---|---|
| snapshots / sightings | 35 searchable / 36 | 1,385 / 3,532 (2.55 sightings per snapshot) |
| apps | Safari, Chrome, Mail, Notes, Messages, Slack, Terminal | Chrome 60% (feeds, shopping, search, video, reddit), coding assistants 30% (OpenCode, Claude, Codex), terminal 4% (Warp), chat 4% (WhatsApp) |
| body size median / p90 / max | 658 B / 2.4 KB / 5.4 KB | 2.8 KB / 12 KB / 33 KB |
| chunks (per snapshot) | 87 (2.5) | 5,289 (3.8); 41% of snapshots are one chunk; 13% of bodies are under 200 bytes |
| snapshots with a near-identical (Jaccard ≥ 0.8) sibling in the same app | 4 of 35 | 1,053 of 1,385 (76%) |
| chunks whose normalised text also occurs in another chunk | – (small) | 3,103 of 5,289 (59%); only 2,907 distinct texts |
| time span | 8 days | one afternoon (5 h 9 min, one calendar day) |
| cleaner quality | all main_content | 133 `uncertain` (all Warp and WhatsApp), no `navigation_only` kept |

Real pages are re-captured every few seconds while open (a shopping page appears 15 times 3.5 s apart), coding
assistants and terminals contain the system's own earlier output, and about a third of the corpus is
infinite-scroll feeds. None of that exists in the invented set.

## Headline: fixes 1–7 transfer unevenly

| code version | commit | invented hit@1 | invented hit@8 | invented MRR | real hit@1 | real hit@8 | real MRR | real: answer in top-40 chunks but not in final 8 | real: absent still answered |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 6391653 | 56/100 | 76/100 | 0.652 | 36/99 | 55/99 | 0.437 | 22/99 | 24/26 |
| Fix 1 app filter | 98c5f39 | 66/100 | 86/100 | 0.752 | 38/99 | 58/99 | 0.462 | 23/99 | 24/26 |
| Fix 2 multi-chunk | ac72e68 | 69/100 | 91/100 | 0.792 | 42/99 | 66/99 | 0.516 | 14/99 | 24/26 |
| Fix 3 abstention | 3f2e0a9 | 69/100 | 91/100 | 0.792 | 42/99 | 65/99 | 0.514 | 15/99 | 24/26 |
| Fix 4 chunking | 2f66f80 | 71/100 | 96/100 | 0.823 | 42/99 | 67/99 | 0.521 | 17/99 | 24/26 |
| Fix 5 context | c4fdb07 | 70/100 | 96/100 | 0.820 | 42/99 | 67/99 | 0.521 | 17/99 | 24/26 |
| Fix 6 dates | 11dc4ad | 75/100 | 96/100 | 0.849 | 42/99 | 67/99 | 0.521 | 17/99 | 21/26 |
| Fix 7 versions | cce16e6 | 81/100 | 96/100 | 0.879 | 43/99 | 72/99 | 0.541 | 13/99 | 21/26 |
| latest (derived cleanup) | a075fe0 | 81/100 | 96/100 | 0.879 | 43/99 | 72/99 | 0.541 | 13/99 | 21/26 |

* Invented hit@8 went 76 → 96 (+20 points); real went 55 → 72 of 99 (+17 questions, +17 points), but **hit@1 only
  36 → 43** (invented 56 → 81). Almost all of the real gain is Fix 2 (+8 questions: more than one chunk per
  result) and Fix 7 (+5 questions at hit@8); Fixes 3, 4, 5, 6 moved real hit@8 by at most 2 questions.
* The gap between "answer is in the top-40 chunk list" and "answer is in the final 8" is 22/99 at baseline and 13/99 now on
  real data, against 8/100 → 3/100 on invented: the final stage loses far more answers on real data.
* Query latency is not in the table because it was measured with the machine paging. A controlled comparison on
  the invented corpus (same machine, same load, 5 repeats): **p50 1.8 ms at Fix 6, 11.5 ms at the latest commit
  (6x)**; on the real corpus the same step went from about 12 ms to 140–210 ms (loaded machine, indicative).
  Cause (from `versions.rs`): Fix 7 compares every pair of the up-to-40 candidate snapshots with full-body word
  sets, so cost scales with body size and number of candidates (not with index size). Worth caching word sets.

## Per question type, baseline → latest

| type | invented hit@8 baseline→latest | invented hit@1 | real hit@8 baseline→latest | real hit@1 |
|---|---|---|---|---|
| absent (still answered) | 20→12 of 21 | – | 24→21 of 26 | – |
| ambiguous_entity | 4→4 of 4 | 3→4 of 4 | 1→1 of 1 | 1→1 of 1 |
| app_scoped | 4→4 of 4 | 3→4 of 4 | 4→6 of 6 | 2→4 of 6 |
| boundary_fact | 0→5 of 5 | 0→2 of 5 | – | – |
| code | – | – | 2→3 of 5 | 1→0 of 5 |
| domain_scoped | 5→5 of 5 | 4→4 of 5 | 8→8 of 9 | 6→6 of 9 |
| filter_trap | 6→15 of 15 | 4→14 of 15 | 1→3 of 5 | 0→1 of 5 |
| keyword | 8→8 of 8 | 7→7 of 8 | 6→7 of 8 | 4→4 of 8 |
| long_document | – | – | 3→2 of 3 | 1→1 of 3 |
| mixed_language | – | – | 1→1 of 3 | 1→1 of 3 |
| multi_snapshot | 6→7 of 7 | 3→4 of 7 | 2→3 of 4 | 1→1 of 4 |
| near_duplicate_version | 7→8 of 8 | 5→7 of 8 | 1→2 of 5 | 1→1 of 5 |
| non_english | 5→5 of 6 | 5→5 of 6 | – | – |
| paraphrase | 8→10 of 12 | 5→7 of 12 | 7→12 of 19 | 4→7 of 19 |
| repeat_capture | – | – | 2→2 of 3 | 2→2 of 3 |
| short_snapshot | – | – | 1→1 of 3 | 1→1 of 3 |
| speaker | 6→6 of 6 | 6→6 of 6 | 7→7 of 7 | 6→6 of 7 |
| table | – | – | 3→4 of 4 | 3→4 of 4 |
| terminal_output | – | – | 1→3 of 5 | 0→0 of 5 |
| time_scoped | 17→19 of 20 | 11→17 of 20 | 5→7 of 9 | 2→3 of 9 |


(`n` per type: see the per-type lists in the private reports; real types with 3–5 questions are anecdotes.)

## Which weaknesses from `baseline-analysis.md` are bigger or smaller on real data

| # | weakness | invented | real | verdict |
|---|---|---|---|---|
| 1 | absent questions still return results | 20/21 → 12/21 | 24/26 → 21/26 | **Fix 3 does not transfer.** All 5 real abstentions are the time-scoped questions (the Fix 6 window has nothing in it); 0 of 21 content absents abstain (test split: 3/15 abstain, dev: 2/11). AUROC answerable-vs-absent on the final score is 0.59 real vs 0.67 invented. The unseen-term rule needs query terms missing from the index; a 1,385-snapshot index contains nearly every term. Cost: 4/99 answerable wrongly abstained on real (2 would have hit), 2/100 invented. |
| 2 | ordinary words become app filters | 6/15 → 15/15 | 1/5 → 3/5 | helped, but real questions scope by apps the filter has never heard of (a terminal called Warp, coding assistants); "in the terminal" means Terminal.app only. |
| 3 | boundary facts / chunk size | 0/5 → 5/5 | no planted case; chunk target 800/3200 and 15% overlap change real hit@8 by +1/−2/+1 (all within noise) | **smaller on real data**; real chunks are already near the 1,600 target (median 1,497 B). |
| 4 | context-poor chunks | not isolated | `prefix=context` +2, `prefix=title` −2 on hit@8 (noise) | not shown to matter on real data either. |
| 5 | derived points compete | 34% of top-10 slots | 4% of top-10 slots; `derived=off` +1 query (CI [0,+0.03]) | **smaller**: 1,000+ real chunks swamp the derived points. Real derived entities were junk-heavy ("Instagram Home" in 226 snapshots) before the last commit. |
| 6 | keyword rerank bonus | within noise at baseline | `rerank_bonus=off`: final hit@1 **+15 points [+6, +24]** (19 questions up, 4 down), hit@8 +5 [−2, +11]; invented hit@1 **+11 [+3, +19]** | **no longer noise**: at the latest code the bonus costs hit@1 on both corpora (CI excludes 0). Fix 7's own measurement (+0.069, CI includes 0) was on the smaller sample. |
| 7 | near-duplicates crowd the top 8 | 3% of final slots (2nd on), 21% of queries | **46% of final slots, 94% of queries** | **far bigger**, and Fix 7 barely touches it (50% → 46%) because it collapses only provably identical results. This is the main reason hit@1 stays at 43%. |
| 8 | dense vs BM25 | all modes within noise | `dense_only`: hit@8 −10 points [−18, −3]; chunk hit@40 64% vs 84%; `bm25_only`: hit@1 +6 [0,+12] | **real data penalises the Model2Vec dense leg**; BM25 alone is as good or better. |
| 9 | bytes vs characters | Hindi page | Hinglish chat fragments: 1/3 found | untested here beyond three short mixed-language snapshots. |
| 10 | dates | 17/20 → 19/20 | 5/9 → 7/9 | works; but the whole real corpus is one afternoon, so "yesterday" selects everything and no multi-day behaviour is measured. |

## New failure modes that only appear on real data (anonymised; examples in `evals/private/failure-modes.md`)

1. **Re-capture crowding.** Near-identical re-captures fill half the final slots; 13–22% of answerable questions have the answer in the
   chunk list and lose it before the final 8. Needs version collapsing that tolerates changing counters, timestamps and prices.
2. **Self-reference.** Terminal and coding-assistant captures contain the system's own previous questions and answers. Terminals are
   4% of snapshots but 9% of the final slots for questions that are not about terminals; 38 of 109 such questions have a coding-tool
   snapshot among the final 8.
3. **Same entity, different sources.** A product price appears on a retailer and on the maker's site; relevance-by-text accepts
   one, a human might want both. Real answers are often multi-source.
4. **Feeds.** Over 450 snapshots are social feeds with ephemeral text; they add no answers and many near-duplicates.
5. **Tiny snapshots** (WhatsApp previews, 13% of bodies under 200 bytes) are rarely retrieved by descriptive questions (1/3 found).
6. **Terminal capture limits**: the terminal text area is capped at 8,192 bytes (8 of 60 terminal snapshots sit exactly at the cap) so
   long command history is silently cut; terminal output questions are the worst type (hit@1 0/5).
7. **Cleaner confidence**: every terminal and chat-app snapshot is `uncertain` (no main region found).

## Does the fix order still hold?

Order by measured gain on real data: Fix 2 (+8 at hit@8) > Fix 7 (+5) > Fix 1 (+3) > the rest (≤ +2 each).
What the real data adds, in order of expected value: (1) stop near-duplicate re-captures from filling the top 8 (collapse by
normalised-text identity ignoring volatile tokens, or dedupe chunks at index time: 45% of stored chunks are exact repeats of another chunk);
(2) drop or rework the keyword rerank bonus (hit@1 +15 points on real, +11 on invented); (3) make dense retrieval earn its place or
weight it down; (4) fix the Fix 7 latency; (5) a content-absent abstention rule that does not depend on unseen terms. Fix 3
should be described as "time-scoped abstention", not as general abstention, until it is re-tuned on real data.

## Ablations on real data (latest code, 99 answerable questions; invented in brackets)

| variant | final hit@1 | final hit@8 | notes |
|---|---|---|---|
| base | 42 [75] | 67 [96] | |
| rerank_bonus=off | 57 [86] | 72 [96] | hit@1 CI excludes 0 on both |
| mode=bm25_only | 48 [73] | 70 [95] | within noise |
| mode=dense_only | 38 [76] | 57 [95] | real hit@8 −10 points, CI excludes 0 |
| derived=off | 43 [75] | 68 [95] | within noise |
| filters=off | 40 [68] | 67 [95] | absent answered 26/26 (time windows are what abstain) |
| chunks_per_result=1 | 37 [72] | 61 [91] | Fix 2 is real (−6 points real, −5 invented) |
| chunk_target=800 / 3200 | 43 / 44 | 68 / 65 | noise |
| chunk_overlap=15 | 43 | 68 | noise |
| prefix=title / context | 42 / 43 | 65 / 69 | noise |
| abstain=off | 42 | 69 | the 4 wrong abstentions cost 2 hits |

## Caveats

* The real gold set was written by one person from the cleaned bodies (no retrieval output seen); questions are weighted toward
  shopping, coding-assistant and chat content. Some are ambiguous or hard on purpose (which version, which source).
* Timestamps: all real captures fall on 2026-10-16 (5 hours). Multi-day time filters and the dev/test split on real data rest on
  125 questions; per-type rows with 3–5 questions are anecdotes.
* 45 real snapshots (the author's own chat about building this harness, plus 26 captures of the invented pages) contain invented
  gold answers; they are in the real corpus here (they only act as distractors for the real questions) and are excluded
  from the haystack used with the invented gold (`evals/scale/make_real_haystack.py`).
* The real corpus was re-cleaned by the current cleaner from the stored AX trees, not taken from stored bodies.
