# Prompt: generate routing training and test data for Cortex

Repo: `/Users/abhinavvashisht/workspace/cortex`. Cortex is a personal memory app for macOS. We are going
to fine-tune a small local model to do Cortex's **intent routing**. Your only job is to write the data:
pairs of *situation + user message → the correct JSON*. Do not train, run models, score anything or
change any code.

## What routing is

Every message the user types goes through one routing step that outputs one JSON (the arguments of the
`decide` tool). It decides whether the message is:

- a **plain question** to answer from memory → `{"action":"answer"}`;
- an **action**: create, change, snooze, pause, resume, cancel or list reminders and scheduled tasks,
  or save/update a fact;
- something that needs a **follow-up question** because information is missing or unclear →
  `{"action":"clarify","question":"...", ...known fields}`.

Read `apps/desktop/src/lib/decide.ts` before writing anything:

- `DECIDE_SYSTEM_PROMPT`: the rules. **Every expected JSON must follow these rules exactly.**
- `DECIDE_TOOL`: the JSON schema. Expected outputs use exactly these field names and shapes.
- `buildContext()`: what the model sees as the situation.
- `checkTiming()` and `resolveDecision()`: what code accepts.

`apps/desktop/evals/decision/cases.ts` has 44 older hand-written cases. Do not copy or reword them;
they stay a separate test.

## Output

Two files, one JSON object per line:

- `evals/routing/train.jsonl` (about 700 pairs)
- `evals/routing/test.jsonl` (about 300 pairs)

Each line:

```json
{
  "id": "r-0001",
  "kind": "new_reminder_once",
  "scenario": "pay-bill-relative-time",
  "situation": {
    "now": "2026-11-03T14:07+05:30",
    "weekday": "Tuesday",
    "timezone": "Asia/Kolkata",
    "schedules": [{"id": "s-rent", "title": "Pay rent", "status": "active", "timing": {"type": "monthly", "day": 1, "time": "09:00"}, "timezone": "Asia/Kolkata", "next": "2026-12-01T09:00"}],
    "facts": [{"subject": "Rajesh", "attribute": "phone"}],
    "recent_turns": [],
    "pending_draft": null
  },
  "message": "remind me in 45 mins to pay the electricity bill",
  "expected": {"action": "create_reminder", "message": "Pay the electricity bill", "timing": {"type": "once", "local_at": "2026-11-03T14:52"}}
}
```

- `situation` has the same fields `buildContext()` produces (`prompt_version` not needed).
  `pending_draft` is `null` unless Cortex asked a follow-up question in the previous turn. Then it is
  what Cortex knew so far plus `user_text` (what the user typed before), for example
  `{"message": "Email Priya", "user_text": "remind me to email priya tomorrow"}`.
- `expected` is the exact `decide` arguments, nothing else.
- `kind` is one of the kinds in the table below. `scenario` is a short name for the underlying
  situation the message comes from (used to keep train and test apart; see "No overlap").

## Timezone and times

- Timezone is always `Asia/Kolkata`.
- Vary `now` widely: different dates across several months, every weekday, morning, afternoon,
  evening and late night, and days near the end of a month.
- Compute every time in `expected` correctly from `now`:
  - "in 45 mins" is `now` + 45 minutes;
  - "Friday" is the next Friday, or today if today is Friday and the time is still ahead;
  - "tomorrow" is the next calendar day;
  - "the 5th" is the next 5th that is still ahead;
  - "last day of every month" is `day: -1`.
- Times are 24-hour `HH:MM`, dates `YYYY-MM-DDTHH:MM`.
- Interval reminders ("every 2 hours"): add `window_start`/`window_end` only if the user gave the
  hours. Without hours, use no window and set `start_local` to `now` + one interval (rounded up to the
  minute), exactly as `checkTiming()` does.

## Kinds and amounts

| kind | Share | What |
|---|---|---|
| `new_reminder_once` | 18% | One-off reminders: "in 20 mins", "in an hour", "tomorrow 9am", "Friday at 6pm", "on the 12th at 10am", "tonight at 9", "next Monday morning at 8". |
| `new_reminder_repeating` | 10% | Daily, weekdays, specific weekdays, weekly, monthly (incl. last day), every N hours/minutes with and without hours given. |
| `new_task` | 4% | Scheduled things Cortex writes for the user (`create_task`): "every morning at 8 give me a summary of tech news", "every Friday 6pm summarise my week". Set `requires_live_sources: true` when it needs fresh web/news data. |
| `manage_reminder` | 14% | Change time/day/text, snooze, pause, resume, cancel an existing reminder from `schedules`. The message must clearly match exactly one schedule. |
| `list_reminders` | 3% | "what reminders do I have", "show my reminders for tomorrow". |
| `save_fact` | 10% | Stable details about the user or others: phone, email, birthday, address, company, role, anniversary. Include `update_fact` when `facts` already has that subject+attribute. |
| `follow_up` | 16% | A follow-up question is needed. See below. |
| `answer_follow_up` | 7% | The user answers Cortex's earlier question (`pending_draft` set, last turns in `recent_turns`). Expected is the completed action, or another question if still unclear. |
| `plain_question` | 18% | Questions about things the user saw, read or talked about ("what did Priya say about the launch", "find that article about rust async", "who messaged me about the invoice"), including questions that mention reminders or times without asking to change them ("when is my rent reminder", "did I set something for tomorrow"). Also transient statements that are not facts ("my phone is dead", "I'm tired"). |

### Follow-up questions (`follow_up`)

Cover each reason with realistic messages, spread roughly evenly:

- **No time:** "remind me to call mom", "every weekday remind me to take my meds".
- **Hour without am/pm:** "remind me at 5 to leave", "call with Roop tomorrow at 7".
- **No subject:** "remind me at 2pm", "set a reminder for tomorrow 9am".
- **Several reminders fit:** "pause my workout reminder" when there are two workout reminders.
- **No reminder fits:** "cancel the dentist reminder" when there is none.
- **Unclear reference:** "remind me about this tonight at 8" with no earlier chat saying what "this" is.

Each `question` is one short, natural question that asks only for what is missing ("What time should
I remind you?", "Is that 5am or 5pm?", "What should I remind you about at 2pm?", "Which one: Morning
run or Evening gym?"). Repeat known fields (`message`, `timing` parts) in the clarify JSON, as the rules
say. When `recent_turns` makes "this" clear, it is not a follow-up; create the reminder.

## Make the messages real

- Every message must be something a real person would type to a personal assistant on their Mac.
  Ask yourself for each one: "would a normal person type this?"
- **Write each message individually. Do not build messages by filling a template with a script** (for
  example "remind me in {N} mins to {task}" with swapped values). Vary the wording, sentence order,
  length and the things being reminded or saved: work, family, health, bills, travel, errands,
  friends, study.
- Use a wide range of names, tasks, places and numbers. Don't reuse the same small set.
- About 30% messy, as people really type: lowercase, no punctuation, common typos, short forms
  ("tmrw", "mins", "pls", "2moro", "@ 5pm"), and occasionally a longer two-sentence message.
- English only. No Hinglish or other languages.
- Situations vary too: different sets of existing reminders (0 to 8, realistic titles, some paused)
  and facts, and some pairs with `recent_turns` that matter.

**Do not include:**

- trick or contrived messages ("remind me but don't save it", "only if the market drops", quoted or
  reported speech, hypotheticals about the app);
- impossible inputs ("the 32nd", "at 25:00", "every 2 weeks on the 15th");
- two actions in one message;
- other timezones, daylight-saving changes or calendar trivia;
- passwords, PINs, card numbers or other secrets.

## Consistency

The same kind of message in the same kind of situation must always have the same kind of expected
JSON. For example, "remind me at 10am" and "remind me at 2pm" (no subject either time) must both be a
follow-up question asking what to remind about, never one created and one asked. Before finishing,
go through each kind and check this.

## No overlap between train and test

The test set must measure whether the model learned routing, not whether it remembers the training
data. So:

1. Give every pair a `scenario`, a short name for the underlying situation and intent (for example
   `snooze-medicine-reminder`, `save-colleague-email`, `ask-about-launch-thread`). Pairs that are
   rewordings of each other or differ only in a name, time or number share one scenario.
2. Assign whole scenarios to one side: about 70% of scenarios to train, 30% to test, with each
   `kind` split about 70/30 as well. A scenario never appears in both files.
3. No message may appear in both files, even after lowercasing and removing punctuation.
4. No test message may be a near-copy of a training message: the same sentence with only names,
   numbers, times or the task swapped counts as a near-copy. Check this with a script (for example
   normalise numbers, times and names, then compare; also flag pairs with high word overlap) and
   rewrite or move anything it flags.
5. No duplicate messages within a file either.

## Report back

- Count of pairs per `kind`, for train and test.
- Count of scenarios, for train and test.
- The overlap check results: exact matches between files (must be 0), near-copies flagged (must be
  0 after fixing), duplicates within a file (must be 0).
- 10 random pairs from each file, so the user can eyeball them.

Report only what the files and checks show. Don't commit. Don't modify anything outside
`evals/routing/` (you may add your overlap-check script there).
