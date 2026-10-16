# Fix 6: date phrases and the observation check (notes)

## Phrases (timewin.rs; local timezone, weeks start Monday, conservative)
| phrase | window |
|---|---|
| today, yesterday, the day before yesterday, N days ago | that calendar day |
| YYYY-MM-DD, `on <Month> <d>` / `on <d> <Month>` (year optional) | that day; a date after today is ignored (it names content) |
| last week / this week / N weeks ago | Monday..Sunday of that week; "this week" ends with today |
| last month / this month / `in <Month> [year]` | that calendar month; "this month" ends with today; future months and a bare "in May" are ignored |
| last `<weekday>` | the most recent such day strictly before today |
| this morning / this afternoon / this evening, tonight | 00-12 / 12-18 / 18-24 today |
Not parsed on purpose: bare weekdays ("due on Thursday"), month-days without "on", "last night", "recently", "last weekend".
`last week` on Saturday 2026-10-17 is Mon 2026-10-05 to Sun 2026-10-11. Unit tests cover every phrase, Monday/Sunday,
year and leap-day boundaries, and (in a child process with `TZ=America/New_York`) the 25- and 23-hour DST days.

## Observation check
Chunk points are restricted in Qdrant to snapshots that have an observation inside the window (`snapshot_id` match-any,
plus derived points, which are still checked after the query). Hits dropped by the post-cut check: 6 -> 0 on this gold
set (`--param obs_prefilter=off` restores the old order). Final results are identical with it on or off here, because
the corpus is too small for the top 40 to be starved; it removes the failure mode rather than a measured loss.

## Results (124 questions)
New windows parse for all 14 newly added dated questions. time_scoped final hit@8 19/20 (was 19/20: the same count
with 10 more of them now actually windowed); final hit@1 overall 72 -> 77 (paired CI vs Fix 5 [+0.01, +0.08]);
final hit@8 98 vs 99 (within noise). The one lost hit is q096 (see below).

## Abstention tie-in (re-selected on dev)
A dated question abstains when none of its content terms appears in the results (`abstain_time_support` 0.1).
Dev: dated absents have support 0.0, dated answerables 0.25 or more, so the rule catches 3 more dev absents
(abstained 4/12 -> 7/12) at no dev cost. Test: 2/10 -> 3/10 absent abstained, and 1 answerable (q096, "what did the
landlord text two days ago": the page never says "landlord") wrongly abstained and would have hit. Words that name the
source kind ("email", "text", "chat", "page") no longer count as content terms, which removed one more wrong abstention
(q100). So on test the rule gains 1 absent and loses 1 hit: a wash, reported rather than tuned away.
