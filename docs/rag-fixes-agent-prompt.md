# Task: fix the measured RAG weaknesses in open-memory, one at a time, with eval proof

You are working in `/Users/abhinavvashisht/workspace/goldfish-implementation` (Rust workspace, macOS-only crate `crates/open-memory`). An eval harness and a baseline already exist. Your job is to fix the retrieval and chunking weaknesses the baseline found, **one fix per commit**, and prove each fix with the eval.

Read first, in this order: `evals/README.md`, `evals/reports/baseline-analysis.md`, `evals/reports/baseline.md`, `evals/reports/ablations.md`, then the code: `crates/open-memory/src/main.rs` (`retrieve`, `answer`, `query_filter`, `time_bounds`, `index_pending`, `summarize`, `put_derived`, `snippet`), `crates/open-memory/src/cleaner.rs` (`clean`, `chunks`), and the eval code and gold set under `evals/`.

## Ground rules

- **One fix at a time.** After each fix: rebuild, run `cargo test --workspace`, run the eval, write the report to `evals/reports/fixes/NN-<name>.json` (and its `.md`), diff it against the previous report with `evals/tools/compare.py` (paired bootstrap), and commit. One commit per fix, message stating the measured delta. Never batch fixes; the whole point is attribution.
- **Keep the baseline files untouched.** `evals/reports/baseline.*` stays as the reference. Compare every step to it and to the previous step.
- **Don't tune to the test split.** Any threshold or constant you calibrate (for example the abstention cutoff) is chosen on `dev` and reported on `test`. Say so in the report.
- **Gold-set discipline.** For each fix, first add or confirm the gold questions that expose the problem, see them fail, then fix. Do not edit or delete existing gold questions to make numbers look better. If a question is wrong, fix it in a separate commit with an explanation. Grow the set (see Fix 0) before judging anything marginal.
- **No regressions without a reason.** If a fix lowers any per-type final hit@8 or overall metrics by more than noise, stop and explain, then either adjust or revert it. Within-noise changes (61 questions: 2–3 queries) must be called noise, not wins.
- **Un-ignore known-weakness tests.** The crate has `#[ignore = "known weakness: ..."]` tests for the boundary fact and the filter traps. When a fix makes one pass, remove the `ignore` in the same commit.
- **Safety.** Do not enable live capture, request Accessibility permission, or touch the user's real state directory (`~/Library/Application Support/Open Memory/local-memory`). Use the eval's temp dirs. No real personal data in the repo. No network or LLM calls in the eval path. Ask before adding any dependency.
- **Keep `ask` working.** `evals/tools/ask_regression.sh` compares `ask` output between binaries. Fixes change output on purpose, so use it to review the diff, not to demand byte equality, and describe each visible change in the commit message.
- Match the surrounding code style. No unrelated refactors.

## Fix 0: grow the gold set first (before changing any behavior)

61 questions is too few: 6 absent questions cannot calibrate a threshold, and per-type rows are decided by one query. Before Fix 1, extend `evals/gold/gold.jsonl` to at least 120 questions, written from planted facts (not from looking at retrieval output), keeping the dev/test split about 50/50 and keeping existing ids stable. Priorities:

- `absent`: at least 20, including near-miss absents (same topic or entity as a real page, but the asked fact is not there) and time-scoped absents ("what did I do on 2026-10-01" with nothing observed).
- `filter_trap`: at least 10, using `edge`, `notes`, `messages`, `terminal`, `chrome`, `slack`, `safari` as ordinary words, plus cases where the app word is a real scope ("in Slack, what did...") and must still filter.
- `time_scoped`: phrasings the current parser misses ("last week", "this morning", "two days ago", "last Friday", "on October 14", "last month") and a few it handles.
- `near_duplicate_version` and `boundary_fact`: a few more each.
- Add this scenario explicitly: a ChatGPT thread about daily macros whose final table chunk (`Protein 137 g | Fat 35 g | Carbs 185 g`) does **not** contain the word "macros" (the word is only in an earlier chunk and in the page title), queried the next day with "what were my macros yesterday?". This is the "answer chunk lacks the query word, and the final stage keeps a different chunk from the same snapshot" case. Add the invented page (`evals/pages/`, with `facts.json`) and its fixture. If real capture is needed, write the HTML and update `evals/CAPTURE.md` for the user to run the capture; until then use a hand-authored fixture marked `provenance: hand_authored` and tell the user it needs a real capture.

Re-run the baseline on the larger set with unchanged code and save it as `evals/reports/fixes/00-baseline-120.json` (and `.md`). From here on, compare to this.

## Fix 1: app-word filter (biggest measured gain)

Problem: `query_filter` turns any occurrence of `chrome`, `safari`, `firefox`, `slack`, `terminal`, `notes`, `messages`, `edge` into a hard `app` filter, with no fallback. Baseline: 0/4 `filter_trap` answered (two queries returned nothing, two returned the wrong app); `filters=off` fixes all four and lifts overall final hit@8 from 43 to 47 with a bootstrap interval above zero. Also `messages` maps to `com.apple.iChat`, which may not be the Messages app id.

Do:
- Apply an app filter only when the question names the app in a scoping phrase (for example "in Slack", "on Safari", "from my Notes app", "my Slack messages", "in Chrome"), not on a bare word. Prefer a small, tested phrase grammar over a single word list. Keep ordinary-word uses ("edge case", "terminal velocity", "my notes about X", "chrome plating") unfiltered.
- Fall back: if the filtered search returns zero results, or the top filtered score is clearly worse than the unfiltered one, retry without the app filter (document the rule you choose).
- Verify the bundle ids the filter uses against what the helper actually reports (check the corpus fixtures). Fix wrong ids.
- Keep the date and domain filters as they are (the baseline shows they help dated questions).
- Add unit tests for the phrase grammar covering true scopes and traps.

Success: all `filter_trap` questions answered, no loss on `app_scoped`, overall final hit@8 up by about the measured 4 questions or more.

## Fix 2: the final stage keeps one chunk per snapshot

Problem: after retrieval, results collapse to one per body (`evidence_key`), keeping the best-scoring chunk. In 4/55 baseline questions (q008 q012 q017 q054) the answer chunk was in the chunk list but not in what `ask` shows. This is also the "macros table" scenario: the best-scoring chunk (which has the query word) is not the one holding the answer.

Do:
- Let a result carry up to N (start with 3) of its snapshot's top chunks, ordered by score or document order, and show/send all of them: in `ask` output, in the snippet logic, and in `llm_answer` context. Keep the snapshot-level result count at `final_k`.
- Make `snippet()` choose lines from the retrieved chunks first, then fall back to the whole body.
- Cap total evidence size so the LLM context does not balloon, and say what the cap is.
- The eval's final-level hit test uses the retrieved chunk(s) plus the printed snippet; update the harness definition to match, and note this in `evals/README.md` so the baseline comparison stays fair (re-score the baseline under the new definition if needed, and say so).

Success: the four lost questions and the new macros case resolve, no rise in near-duplicate crowding.

## Fix 3: abstention

Problem: 6/6 absent questions still returned results; there is no threshold. Baseline top-score AUROC for answerable vs absent was 0.79 (chunk) and 0.94 (final) on only 6 absent points.

Do, using the enlarged absent set from Fix 0:
- Choose an abstention rule on `dev` only. Candidates: a minimum fused/final score; a minimum gap to the best answerable-looking score; requiring at least one query content term in a retrieved chunk (lexical support). Compare at least two, pick one, and justify with a precision/coverage curve on `dev`.
- When abstaining, `ask` prints a clear message ("No matching captured evidence for this question") instead of 8 weak results. Optionally show the closest sources only behind an explicit wording that they are weak matches (decide and document).
- Report on `test`: share of absent questions that correctly abstain, and the share of answerable questions wrongly abstained on (the cost). Both must be reported together. Note that RRF scores are not calibrated across queries, so say how you handled that.
- Time-scoped absents (nothing observed that day) must abstain too.
- Make the threshold a `--param` in the eval so it can be swept.

Success: most absent questions abstain on `test` while wrongly abstaining on at most a small number of answerable ones; state the exact counts.

## Fix 4: chunk boundaries and size

Problem: 3/3 planted straddle facts are split across chunks (no overlap, hard cut near 1,600 bytes). Naturally rare (3/50 gold answers). Chunk size is in bytes: Hindi chunks average about 472 characters against 1,593 for English, and the English query on the Hindi page failed.

Do:
- Add a small overlap (try 0, 10% and 20% of the target) and/or boundaries aware of headings, "label: value" lines, list items with their header, and table rows, so a fact keeps its label. Pick by eval, not by taste.
- Size chunks by characters (or a token estimate) instead of bytes, with the byte limit kept only as a safety cap. Keep `start_byte`/`end_byte` correct and on UTF-8 boundaries.
- Keep chunk ids and spans stable per snapshot, and keep `--rebuild-index` working (a migration or reindex step may be needed; the stored chunks table and Qdrant must stay consistent; follow the existing `cleaner::VERSION` / stale-capture mechanism and document any version bump).
- Check the effect of overlap on near-duplicate crowding and index size.
- Look at the non-English miss (q058): determine whether the cause is chunk size, the monolingual embedder, or the query language, and write down what you found even if you cannot fix it here.

Success: boundary questions retrieved whole, Hindi chunks comparable in characters, no overall loss, and crowding/index size reported.

## Fix 5: context prefix on embedded text

Problem: 27/71 chunks (38%) are under 100 bytes, 25/71 (35%) share no word with their page title, and Slack sender names never reach the body. A table chunk like `Protein 137 g | Fat 35 g | Carbs 185 g` has nothing that matches "macros".

Do:
- At index time, build `text_to_embed = prefix + chunk_body`, where the prefix is built deterministically from the snapshot (no LLM, nothing sent anywhere): app label, window title, domain, capture date, and for chat chunks cut mid-message the speaker. Keep it short; test two lengths (title only vs title + app + date + speaker).
- Embed and BM25-index `text_to_embed`. Keep the stored chunk body, spans, snippets and displayed evidence as the raw chunk text. Eval hit tests keep using raw chunk text so labels stay comparable.
- Cleaner part: make Slack/Messages-style sender names reach the body where the AX tree exposes them (see the `speaker_time` handling and the baseline note on q015, q043). Bump `cleaner::VERSION` only if stored bodies change, and follow the existing reprocessing path.
- Add the prefix format version to `MODEL_VERSION` or `index_meta`, so a stale index is detected and `--rebuild-index` is demanded, as the code already does for model changes.
- Make the prefix variants eval `--param`s so they can be compared with a paired bootstrap.

Success: the macros case ranks the table chunk well without help from Fix 2; paraphrase final hit@1 improves or at least does not drop; report if the prefix raises same-page crowding.

## Fix 6: date parsing and the post-cut observation check

Problem: `time_bounds` handles only "today", "yesterday" and ISO dates; 6 of 9 common phrasings ("last week", "this morning", "two days ago", "last month", "on October 14", "last Friday") produce no window. The per-snapshot observation check runs after Qdrant's top-40 cut, dropping hits (q020, q023); a time-scoped absent question (q023) still returned 4 results from other pages.

Do:
- Extend `time_bounds` with a tested set of relative and absolute phrases (day names, "N days/weeks ago", "this/last week|month", "this morning|afternoon|evening", "on <Month> <day>", "in <Month>"), in the user's local timezone with the injectable clock the eval already uses. Be conservative: an unparsed phrase yields no filter, never a wrong one. Define "last week" and similar explicitly and document it.
- Move the observation-based check into the Qdrant filter where possible (or over-fetch before the check) so it cannot starve the result list.
- Tie into Fix 3: a time-scoped question with nothing observed in the window must abstain.
- Unit-test every phrase, including DST and week-boundary edge cases.

Success: all newly added `time_scoped` questions answered, no regressions on the dated questions that already passed.

## Fix 7: dedup by chunk or edit distance

Problem: dedup keys on the whole body, so one changed line makes a new snapshot; 57–71% of chunks in the edited/scrolled pages are stored twice. Stale text ranks above the right text in 2/8 questions that carry a stale answer. Near-duplicate chunk-level hit@1 is only 1/5.

Do:
- Collapse near-identical retrieved chunks across snapshots (exact normalized text first; then a near-duplicate rule such as word-set Jaccard above a threshold you choose on `dev`), preferring the most recent snapshot (or the one whose text matches the query terms better) and keeping a pointer to the older versions. Never merge versions that differ in amounts, dates, names or negations: the spec requires changed amounts and decisions to stay distinct. Add tests for exactly that.
- Avoid storing identical chunk text twice in the vector index if a safe approach exists (reuse chunk points across snapshots); if too invasive, only fix retrieval-time collapse and record the idea.

Success: crowding metrics down, `near_duplicate_version` chunk hit@1 up, stale-above-answer count down, no merging of genuinely different versions.

## Lower priority, do last and only if time allows

- Derived points (topic, entity, hour, day): the baseline showed they hold 37% of top-10 slots with no measured harm. Low-risk cleanups with a clear case: stop entity labels from matching calendar words, question words, verbs ("Add", "What", "Please") and strings with newlines; keep derived points out of the first-pass chunk ranking, or label them. Measure; change nothing that is not within noise-or-better.
- Keyword rerank bonus: removing it was within noise (hit@1 36→38). Decide after Fixes 1–3 with the larger gold set; remove it only if the bootstrap interval supports it.
- Embedder choice (Model2Vec vs a small transformer vs multilingual): out of scope for this task unless every fix above is done. If tried, it needs the user's approval (new dependency and model download).

## Out of scope

- Capturing text that is below the fold or off screen (a capture limit, not retrieval).
- LLM-based answer judging, contextual retrieval that sends text to a model, any cloud call.
- UI work in `apps/desktop`.

## Deliverables

1. `evals/gold/gold.jsonl` enlarged (Fix 0) with unchanged ids for existing questions; new pages, `facts.json` and fixtures as needed; updated `evals/CAPTURE.md` if the user must capture something.
2. One commit per fix, each with code, tests (un-ignored where relevant), and a report in `evals/reports/fixes/`.
3. `evals/reports/fixes/summary.md`: a table of every step (fix, final hit@1/hit@8/MRR overall and per affected type, abstention correct/wrongly-abstained counts, crowding, index size, latency) with bootstrap intervals versus the 120-question baseline, plus a plain-language list of which gains are real and which are within noise.
4. Update `evals/README.md` for any new `--param`, changed definitions and the larger gold set.
5. A short final message listing what was fixed, what was not and why, what the user must do (for example real captures of new pages, a `--rebuild-index` run on their own data, which is theirs to run and not yours), and the remaining risks.

If anything is ambiguous (for example how to define "last week", or whether a fix needs a schema or cleaner version bump), choose the conservative option, note it in the commit message, and keep going. Stop and ask the user before: enabling capture, using real captured data, adding a dependency, changing the stored data format in a way that needs migration on the user's own database, or sending any data off the machine.
