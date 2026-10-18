# Handover: what is done in rewind retrieval, and what is left to improve

Read this first if you are picking up work on `crates/rewind` (Rust, macOS only, branch `main`). It says where things
stand, how to measure a change in two commands, and lists the remaining improvements in priority order with the
evidence behind each one. "Measured" means a number from our evals; "hypothesis" means we have not tested it.

## Product direction (from the owner)
Rewind customers ask about their *lives*: "did I miss a meeting", "did I miss a message", "what was the post about
books yesterday". They do not ask what command they typed or what code they read. So capture should favour messages,
mail, calendar, posts and documents, and skip terminals and code editors. When a trade-off is unclear, optimise for
those questions.

## Where things stand (all on `main`)
| area | state | commit / file |
|---|---|---|
| App blocklist | Terminals and code editors are never saved; list is a JSON file in the state dir, editable via `rewind blocklist ...` (live reload), `blocklist purge --yes` removes already-saved ones. Coding-agent apps (OpenCode, Codex) are listed but off. AI chat apps are never blocked. | `030e730`, `18b2ddb`, `crates/rewind/src/blocklist.rs` |
| Ingest-time dedup | Unchanged trees skipped, near-identical captures merged. Shared chunk points exist behind a flag (off). | `c8ab98d`, `dedup.rs`, `evals/reports/real/dedup.md` |
| Raw trees | Deleted 7 days after a snapshot was last seen (live DB only; eval fixtures are unaffected). | `06ee2a6`, `rawtrees.rs` |
| Retrieval tuning | Keyword rerank bonus off by default (hit@1 +14 real, +7 invented); at most 2 results per page; BM25 weighting and dense-rerank tested and rejected (no setting beats hybrid on both corpora); version-compare latency fixed. | `eaee3a4`, `7ea1b09`, `107ec22`, `605f7b0`, `evals/reports/tuning/*.md` |
| Eval infra | One command, frozen inputs, scratch space inside the repo, tracked history. | `c373fe7`, `evals/RUNNING.md` |

Current numbers (after `605f7b0`; release build, best-of-5 latency): invented hit@1 89/102, hit@8 98/102, MRR 0.912, p50 about 2.3 ms;
real hit@1 58/99, hit@8 75/99, MRR 0.648, p50 about 16 ms. At the start of this work the real corpus was 36/99 and 55/99.
Run `python3 evals/history.py` for the full trend.

## How to work (read before changing anything)
* Measure with one command: `evals/run_all.sh --note "what I changed"` (add `invented`, `real` or `bench`). It verifies the frozen
  inputs, builds, runs both corpora with 5 latency repeats, prints the numbers next to the previous run and appends a row to
  `evals/history/runs.csv`. Details: `evals/RUNNING.md`. Compare two runs with bootstrap intervals: `python3 evals/tools/compare.py OLD NEW`.
* **Two corpora, always both.** *Invented* = 36 clean captured pages with 124 questions (it overstated the fixes: 76 → 96% hit@8, against
  55 → 75% on real). *Real* = 1,385 of the owner's own snapshots with 125 questions, local only in `evals/private/` (git-ignored). Never put
  real text, names or URLs into a commit, a committed report or a code comment; counts and rates are fine.
* **Inputs are frozen** (`evals/frozen.json`). If you add gold questions or recapture data, edit, then
  `python3 evals/freeze.py update <invented|real>` and commit `frozen.json`. History rows on a different dataset are marked not comparable.
* One change per commit, message with the measured delta on both corpora and which differences are noise. Pick constants on the `dev`
  split and report `test`. Do not edit existing gold questions to improve numbers. With 99 real questions, 3 to 4 questions is noise.
* Ask the owner before: adding a dependency, changing the embedding model, sending any data off the machine (no network or LLM calls in the
  eval path), starting live capture, or touching `~/Library/Application Support/Rewind`.
* Environment traps: release builds of this crate take from seconds to about 15 minutes; the Mac may sleep or swap during long runs (the harness
  uses best-of-repeats latency for that reason); another agent may be editing `main` at the same time, so commit only your own paths.

## Remaining improvements, highest value first

### 1. Treat messages as messages (measured gap, hypothesis on the fix)
Why: "did I miss a message / what did X say" is a core question, and chat apps are the weakest content. WhatsApp, Instagram DMs and LinkedIn
messaging arrive as tiny blobs or conversation lists; every snapshot of those apps is marked `uncertain` by the cleaner. Real data: 13% of
snapshots are under 200 bytes, `short_snapshot` found 1/3, `mixed_language` (Hinglish chats) 1/3, while the real `speaker` questions (X direct messages and LinkedIn conversation lists, which already expose sender names) score 7/7.
Do: extend the Fix 5 precedent (`speaker_time` and sender labels in `cleaner.rs`) so that each message becomes a record with sender, time and
conversation, for WhatsApp, Instagram DMs and LinkedIn messaging. Chunk per message window and keep the speaker in the stored text.
Measure: `speaker`, `short_snapshot`, `mixed_language` types on real; add real questions of the form "what did <person> say about <thing>" (see item 5).
Watch: cleaner version bump and reprocess path (`cleaner::VERSION`, `capture --apply-cleaning`); do not break invented `speaker` (6/6).

### 2. Treat feeds as posts (hypothesis)
Why: Instagram, LinkedIn and X feeds are about 38% of the real corpus and are exactly the "post about books yesterday" case, but are stored as
one long page with navigation noise ("Also from Meta", suggested accounts). Chunk per post, keep author and time, drop the surrounding chrome.
Measure: real questions about posts (a few exist under `long_document` and `paraphrase`); size and chunk count of feed snapshots; near-duplicate share.
Risk: feeds re-render constantly, so test with ingest-time dedup on.

### 3. Better query understanding (hypothesis, partly measured)
Now it is regexes: `time_bounds` handles days, weeks, months and dates but not times of day ("this morning", "last night"); people are not a filter;
"missed" has no meaning. Real time-scoped questions score 7/9. A small parser first (times of day, "from <person>", "in <app>"); an LLM-based
rewriter only after asking the owner (network, cost, privacy). Keep the regex path as the fallback. Measure on `time_scoped`, `speaker`, `app_scoped`.
Note: the whole real corpus is one afternoon, so multi-day behaviour is untested until item 5 is done.

### 4. Abstention that works on real data (measured)
Fix 3's rule only catches the 5 time-scoped absent questions: 0 of 21 content-absent real questions abstain (AUROC answerable vs absent 0.59 real vs 0.67
invented), because the unseen-term rule needs query terms missing from the whole index and a 1,385-snapshot index has almost every term.
Try: share of query content terms found in the top results, margin between the best and the 8th score, dense-similarity floors. Calibrate on real `dev`,
report on `test`, and always report the cost (answerable questions wrongly abstained, now 4/99).

### 5. Eval coverage for the real use case (measured gap, do early)
The eval cannot see the target questions: the real corpus is five hours on one day, with three Gmail snapshots and no calendar. Capture a few real
days, export with `evals/tools/export_real.py` (reads the live DB read-only), re-clean through `ingest-fixtures --dump-bodies`, and write questions with
`evals/tools/gold_author.py`: missed meetings, messages, posts, mail, multi-day time windows, "who said what". Then `freeze.py update real`.
Also review ambiguous existing real questions (same fact on two sites; relevance-by-text accepts one answer only).

### 6. Answer quality, not just retrieval
Retrieval hit@8 is not what users feel; correct answers are. There is a branch/worktree for this at `../rewind-answer-eval` (branch `evals-answer-quality`,
prompt `docs/rag-answer-quality-agent-prompt.md`); check its state before duplicating work. Needs the owner's consent for any LLM call.

### 7. Embedding model (hypothesis; needs a dependency decision)
Model2Vec `potion-base-32M` adds only +3 hit@1 and +1 hit@8 over BM25-only on the dev sets; dense-only is 10 points worse than hybrid on real data (hit@8).
A stronger small embedder may help paraphrase (real `paraphrase` 12/19). Evaluate on the real set first; ask before adding any dependency.

### 8. Privacy defaults for the blocklist (cheap)
Add password managers, Keychain Access and banking/payment domains to the default list (`blocklist.rs`), and add domain/window matching, which the spec
asks for (`rewind-end-to-end-spec.md`, exclusions section). The AX helper still reads a blocked window before the app id is known; consider a
frontmost-app check before the read (needs helper changes; ask first).

### 9. Storage still on the table
See `evals/reports/scale/analysis.md`: the vector store keeps closed write-ahead-log files (77% of the Qdrant directory at 10k pages), points cost about
3.3 KB each, SQLite dominated by raw trees (now purged after 7 days). Remaining ideas: WAL truncation/retention config, shared chunk points (flag exists, off),
`VACUUM` after purges. Extrapolation to 216,000 snapshots is in that report.

### 10. Capture limits that cap recall (outside retrieval)
The AX helper reads only on-screen text, so anything below the fold of a long chat or page is never stored; scroll-aware capture would raise recall for long
pages. The 8 KB cap on terminal text areas no longer matters (terminals are blocked).

## Not done, so you do not assume otherwise
Scale points at +100k pages, +10k with hard distractors and real +10k were never run (the machine could not do them in reasonable time); the latency
isolation run was cut short. The desktop UI for the blocklist does not exist; the JSON file and CLI are the API. `apps/desktop/src-tauri/target` is a 4.7 GB build
cache that can be deleted. Four older prompts in `docs/` (`rag-eval`, `rag-fixes`, `rag-answer-quality`, `rag-realism-scale`) are history, not tasks.

## Suggested order
5 (see the target questions) → 1 and 2 (the content you want people to ask about) → 4 (abstention) → 3 (query understanding) → 8 → 6 → 7 → 9 and 10.
After each step run `evals/run_all.sh`, and write what you learned into `evals/reports/tuning/` (aggregates only).
