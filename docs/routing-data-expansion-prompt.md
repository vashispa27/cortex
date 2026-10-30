# Prompt: more varied routing training data, then a calendar in the context

Repo: `/Users/abhinavvashisht/workspace/cortex`. Two jobs, in order:

1. Add about 1,100 new **training** examples aimed at the cases the fine-tuned model gets wrong.
2. Then add a list of the coming days to the context the model sees, so it copies dates instead of
   counting them.

## Background

Cortex sends every user message to a small local model. The model answers with one `decide` tool call:
an action (create, change or cancel a reminder, save a fact, answer from memory) or a follow-up question
when something is missing. The rules are `DECIDE_SYSTEM_PROMPT` and `DECIDE_TOOL` in
`apps/desktop/src/lib/decide.ts`; every expected answer must follow them exactly.

The data is `evals/routing/train.jsonl` (700) and `test.jsonl` (300), both written by
`evals/routing/author.py`: messages and labels are written by hand, and code works out the contexts
and exact times from short annotations (`+ 35`, `weekday 3 12:30`, `date 29 09:25`, `daily 21:25`,
`daily 10:20 6`, `monthly -1 18:40`, ...). `check.py` checks that train and test don't overlap.
`validate-router.cjs` runs every expected answer through the app's own validation.

Gemma 4 E4B fine-tuned on the 700 scores 71% on the test set, but it makes 70 wrong writes (it creates
or changes something it shouldn't, or with wrong details). The training data has too little variety: for
each kind of follow-up question there is only one scenario of about 19 near-identical messages, so the
model learned those messages, not the rule.

## Job 1: more varied training data

### Where the model fails (from the test results)

Use these as the target. Don't look at, copy or paraphrase `test.jsonl` messages. Seed from the
`train.jsonl` rows of the same kind instead.

| Kind | Score | What goes wrong | New rows |
|---|---|---|---|
| `follow_up` | 35% | It invents what's missing instead of asking: a made-up subject ("A 7:35am reminder tomorrow" becomes "Check balcony seedlings"), a made-up time (8:00, 7:15), picks one of two matching reminders, or guesses what "that" / "it" means. | 360 (60 per reason) |
| `answer_follow_up` | 43% | Same, while finishing a pending draft: the reply is still incomplete and it writes anyway, or it combines the draft and the reply wrongly. | 150 |
| `new_reminder_once` | 63% | "a Saturday 10:20am reminder" becomes every Saturday. Weekday dates and "in N minutes" are counted wrong (job 2 helps with weekdays). | 200 |
| `new_reminder_repeating` | 70% | "last day of every month" becomes 31, 28 or 23 instead of `-1`. "nightly at 9:25pm" becomes once. "every daily reminder" with no time gets an invented time instead of a question. | 120 |
| `manage_reminder` | 79% | "move it to Thursday noon" on a one-off reminder becomes every Thursday; changes to the wrong reminder. | 100 |
| `save_fact` | 87% | Swaps subject and attribute (`"subject":"Role","attribute":"Esther"`). | 80 |
| `new_task` | 75% | Mixes up a task (Cortex writes something, `create_task`) and a reminder (`create_reminder`). | 60 |
| `plain_question` | 100% | Fine. Add a few so the model doesn't start over-asking: questions that mention reminders or times but don't ask to change anything. | 30 |

The six follow-up reasons, 60 new rows each: no time, hour without am/pm, no subject, several reminders
fit, no reminder fits, unclear reference ("this", "that", "it" with nothing earlier in the chat).

Include contrast pairs wherever they teach the rule. Put both sides in train, in the same new scenario,
for example:
- "remind me at 2pm" (ask what about) and "remind me at 2pm to call the bank" (create).
- "a Saturday reminder to collect the donation" (once) and "every Saturday remind me to..." (weekly).
- "remind me about that tonight at 8", once with nothing earlier in the chat (ask) and once with a
  `recent_turns` that says what "that" is (create).
- "pause my gym reminder" with one gym reminder (pause it) and with two (ask which).

For the date cases, spread `now` across every weekday and time of day, including:
- the named weekday being today, with its time still ahead or already passed;
- month ends, and "on the 29th" when the 29th of this month has passed or doesn't exist;
- minutes that cross an hour or midnight.

### Variety is the point

- **Many small scenarios.** At most 8 rows per scenario, at least 10 different scenarios per follow-up
  reason, and every scenario new (not a name used in train or test). A scenario is a theme with its
  own people, tasks and places, for example `school-pickup-follow-ups` or `landlord-repair-follow-ups`.
- **Real messages.** Would a normal person type this? Mix short and long, casual and polite, lowercase,
  small typos, "pls", "tmrw", "in 20 mins", messages that give the time first or bury it in a sentence.
  English only, no Hinglish.
- **No templates.** Don't write one sentence and swap the names, numbers or task. Each row is written
  on its own.
- **Bigger pools.** Existing rows draw background reminders from only 8 titles and facts from only 8
  names. New rows use a much larger pool of background reminder titles, people and attributes, including
  near-misses: a "Gym" and a "Gym bag" reminder, two people with similar names.
- **Code computes the answers.** Write each message with its annotation (content, timing spec,
  subject/attribute/value, follow-up reason) and let `author.py`'s helpers produce the exact times,
  ids and context. Never type a date or time by hand in an expected answer. Add a helper if one is
  missing, and test it.

### Rules

- **`test.jsonl` must not change at all.** `author.py` derives each row's clock and background from its
  position, so add the new rows after every existing row (or in a separate file the generator appends),
  and confirm with `shasum` that `test.jsonl` is byte-identical before and after. Existing train rows
  stay as they are.
- New rows go to train only.
- `check.py` must pass: no new row may match or nearly match a test row (same message with names,
  numbers or task swapped counts as a near-copy). Extend it to cover the new rows if it doesn't already.
- `validate-router.cjs` must pass with 0 errors on all rows.
- Every expected answer must follow `DECIDE_SYSTEM_PROMPT`, including what a clarify carries
  (`message` / known `timing` parts) and what counts as a follow-up.
- Don't change `decide.ts`, the grader (`apps/desktop/evals/decision/routing-grade.ts`) or the eval in
  this job.

### Before moving on

Run `node evals/routing/to-mlx.cjs` and check it still writes `evals/routing/mlx/train.jsonl` and
`valid.jsonl`, holding out whole scenarios (now including some of the new ones). Pick 30 random new
rows across all kinds and read them yourself: the message, the context and the expected answer. Fix
anything a careful person would label differently.

## Job 2: calendar in the context

Of the fine-tuned model's 29 wrong times, about 13 are wrong weekday dates ("Wednesday 12:30pm" set to
the 4th instead of the 31st). The model has to count from today's weekday; a small model does that badly
but copies well.

- In `buildContext()` (`apps/desktop/src/lib/decide.ts`), add `upcoming_days`: today plus the next 7
  days in the user's timezone, each as `"Wed 2027-03-31"`, with today marked
  (`"Wed 2027-03-31 (today)"`). Use the same timezone handling as `now` and `weekday`.
- Add one line to `DECIDE_SYSTEM_PROMPT` saying the date for a named weekday comes from
  `upcoming_days`. Bump `DECIDE_PROMPT_VERSION`.
- Add tests in `apps/desktop/src/lib/decide.test.ts`: the right 8 days across a month end, a year end and
  a timezone where the local date differs from the UTC date.
- The eval (`routing.eval.ts` through `contextOf`) and the training converter (`to-mlx.cjs`) both
  build the context with `buildContext()`, so they pick this up without changes. Check that, rerun
  `to-mlx.cjs`, and confirm `upcoming_days` appears in the generated files.
- Don't change the data labels for this; they are already right.
- Run the desktop app's unit tests (`npm test` in `apps/desktop`) and type check; both must pass.

## Rules for both jobs

- Never touch real Cortex memory, schedules or settings.
- Don't train or run a model; the user does that.
- Don't commit or push.

## Report back

- New row counts per kind and per follow-up reason, and the number of new scenarios.
- `check.py` and `validate-router.cjs` output, and proof that `test.jsonl` is unchanged.
- New `to-mlx.cjs` counts (train / valid).
- 2 example new rows per kind (message, key context, expected answer).
- The `upcoming_days` change, the test results, and one generated training example showing it.
- Anything you couldn't do or aren't sure about.
