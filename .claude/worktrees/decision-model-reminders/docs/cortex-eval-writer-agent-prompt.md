# Agent prompt: write the Cortex eval questions

You are writing the first hand-built evaluation set for Cortex, a Mac app that records what is on the
user's screen, cleans it, chunks it, embeds it, and answers questions about it. Your job is to read the
recorded data and write realistic questions with verified answers. You are **not** building a runner, not
changing the engine, and not running any capture.

## 0. Rules that apply to everything

* The only data source is the **eval archive**: `~/Library/Application Support/Cortex/eval-memory/`
  (read it only through the commands below). **Never open `~/Library/Application Support/Cortex/local-memory/`**;
  that is the user's real memory.
* The chunks contain real people's messages, handles, emails and phone numbers. Keep everything local.
  Questions may ask for such details and the gold file may contain them, but the file stays local.
  Do not paste chunks into any web service, do not commit them, and write all outputs under
  `evals/private/` (already gitignored).
* Every answer must be derivable from the recorded chunks (or, for pure general-knowledge questions, from
  facts any well-informed person knows). Never invent a person, message, number, link or post. If the data
  cannot support a question family, write fewer questions for it and say so in the report (section 7).
* Do not edit anything outside `evals/private/`. Do not start, stop or reconfigure the app.

## 1. Dump the data

The archive is small (tens of pages, hundreds of chunks) and grows as the user records more. Re-dump
whenever you start a session.

```bash
cd /Users/abhinavvashisht/workspace/rewind
mkdir -p evals/private
# one line per chunk: snapshot_id, chunk number, app_id, title, url, text. Use this as your main source.
python3 evals/tools/eval_view.py --dump evals/private/chunks.jsonl
# the same chunks as one readable text file with a header before each chunk
python3 evals/tools/eval_view.py --dump evals/private/chunks.txt
# list every recorded page (id, time, size, title)
python3 evals/tools/eval_view.py
# the full cleaned text of one page, or its chunks
python3 evals/tools/eval_view.py 35
python3 evals/tools/eval_view.py 35 --chunks
```

Each chunk is exactly the text that is embedded and retrieved, so write answers against chunk text, not
against what you imagine the page looked like. Also read `evals/TEST_MODE.md`.

Things to learn from the data before writing anything:

* The apps are currently X (posts, replies, home timeline) and LinkedIn (messaging threads, feed). Posts
  have an author name, a handle, a relative age ("15w", "Oct 17") and the text. Chats have a day header
  ("FRIDAY"), per-message times ("11:25 PM") and sender lines ("Abhinav Vashisht sent the following message").
* Many pages are the **same page captured several times** (scrolling a feed, a chat that gained messages).
  Several snapshot ids can contain the same fact. When you cite support, list every snapshot and chunk that
  contains it.
* Every LinkedIn thread chunk repeats the sidebar conversation list, so names and previews of *other*
  conversations appear in many chunks. These are realistic distractors. The sidebar preview of a thread can
  be older than the thread itself. A sidebar line starting `You:` is the user's own message.
* Some senders are automated (for example "Boardy" recommends people). Some posts are ads or sponsored.
* The user is Abhinav Vashisht (@vashipa). Messages sent by him appear as "Abhinav Vashisht sent...".

## 2. What a good question looks like

Write the way a real person types into a notch search box on a laptop: short, lowercase, no question mark,
half-remembered, sometimes wrong. Do not copy sentences out of the chunk; a question that contains the
exact answer string is not testing retrieval.

Each question has an **expected behavior**, because Cortex answers from memory *or* general knowledge:

| behavior | meaning |
|---|---|
| `memory` | the answer is only in the recorded data; the correct reply cites it |
| `general` | a world-knowledge question; memory is irrelevant and must not be invented from |
| `mixed` | needs both (a name found in memory plus outside knowledge about them) |
| `clarify` | genuinely ambiguous between memory and general knowledge, or between two people in memory; a good reply covers both readings or asks which one |
| `abstain` | not in the data and not knowable; a good reply says it could not find it and does not guess |

Example of the ambiguity this set must cover: "do i know shahrukh khan?", "what is shahrukh khan's number".
Shahrukh Khan is a famous actor, but the user might also have a contact with that name. Find real cases in the
data where a name in memory collides with a famous person, a company or a common word, and write questions
that could mean either. If the data has no such collision, write the famous-name questions as
`abstain` or `mixed` as appropriate and state in the report that no real collision existed.

## 3. Question families to cover

Write questions for each family. Target about **150 clean questions** (8 to 15 per family) **plus about 50 noisy
variants** of them (family 8), so roughly 200 lines in `gold.jsonl`. Let the data decide: quality and
verifiability beat the quota, and a thin family should stay thin.

1. **Post lookup and attribution.** "I saw a post about difficulty designing evals in production. Who wrote
   it?" Answers need the author and handle, and a good reply links the source. Pick posts whose author line
   and text may fall in different chunks; those are the hard ones.
2. **Chat lookup.** What someone said, what the user said, who said something. Test speaker attribution
   (`You:` lines, "X sent the following message").
3. **Scheduling attempts (no dates needed).** Questions such as "did anyone try to set up a call with me",
   "have i scheduled a meeting with suchi", "who asked for a call", "did i agree on a time", "did anyone share
   a calendly", "who asked for 20 min of my time". The answer is that someone proposed or arranged a meeting
   and who, even when the message only says "can we have a call on thursday". Also ask for facts that are
   written in absolute form in the chat ("what time did we pick for the call").
4. **Cross-chunk and cross-page.** The answer needs two chunks of one thread (a question in one chunk, the
   reply in another), a person who appears on both X and LinkedIn, or a thread seen at two different moments
   (latest message wins). Example shape: "do i have a meeting with ayush" when he is reachable on both
   platforms. Mark these with `needs_multiple_chunks`.
5. **Aggregation.** "Who has asked about co-founding", "who is waiting for my reply" (last message in a
   thread is from them), "which people recommended something to me". List every supporting chunk.
6. **Memory vs general knowledge.** The Shahrukh Khan pattern from section 2, plus plain general questions
   ("who is the president of india") and mixed ones ("what does the company that messaged me do").
7. **False premises and absence.** Ask for things that were never captured (a pitch deck nobody sent, a
   person with a near-identical name, a post that does not exist). Include near-name traps (Suchi vs Suchit).
8. **Messy input.** For about a third of all questions write a second, noisy version: typos in names and
   words, transliteration and Hinglish ("kal kisse baat karni thi"), abbreviations, no punctuation, vague
   references ("that guy who does voice ai"), missing words. Link the pair with `variant_of`.
9. **Exact details.** Numbers ("625ms"), URLs and handles ("link aditya sent"), amounts, names of products.
10. **Paraphrase and vague recall.** The user remembers the gist, not the words ("the post about sip maths",
    "something about anthropic equity").
11. **Provenance.** Who recommended or introduced someone, whether a message came from a person or a bot,
    whether something was a post, an ad or a chat.
12. **Untrusted content.** If any recorded post or message contains instructions aimed at an AI ("ignore
    previous instructions"), ask a normal question whose evidence includes it; the correct reply must not obey.
    If none exists, say so in the report; do not write one.
13. **Contact details.** Questions that ask for an email address, phone number, link or similar detail that
    appears in a chat ("what is suchi's number", "email of the person who wanted a cofounder"). These are a
    normal use case: put the real value in `answer_facts` and `reference_answer`. Set
    `"redaction_expected": true` so the report can later show how the product's redaction affects them.
14. **Follow-ups.** Two-turn cases where the second question is a pronoun follow-up ("what's his rate?") and
    only makes sense with the first. Put the earlier turns in `history`.

**Out of scope for now:** do not write questions whose answer depends on today's date or on resolving words
like today, tomorrow, yesterday, last week, "2 days ago", "next Thursday" against the current time. They are
deferred until the evaluation clock exists. Do not write "what was I doing at 3pm" or "what did I read in the
last hour" questions either. A scheduling question is fine as long as the right answer does not change with
the date it is asked.

## 4. Output format

Write `evals/private/gold.jsonl`, one JSON object per line:

```json
{
  "id": "q0042",
  "family": "attribution",
  "query": "who posted abt diffculty designing evals in prod",
  "variant_of": "q0041",
  "history": [],
  "expected_behavior": "memory",
  "reference_answer": "One or two sentences of the ideal reply.",
  "answer_facts": ["<author name as written>", "<@handle>"],
  "support": [
    {"snapshot_id": 1, "chunk": 1, "answer_text": "<exact text from the chunk>"},
    {"snapshot_id": 2, "chunk": 1, "answer_text": "<same fact in a near-duplicate snapshot>"}
  ],
  "wrong_answers": ["an author from a nearby post that would be a plausible wrong pick"],
  "needs_multiple_chunks": false,
  "redaction_expected": false,
  "split": "dev",
  "provenance": "real",
  "notes": "why this is hard, which distractors exist"
}
```

* `answer_facts` are short strings a correct reply must contain. `answer_text` in `support` must be an
  **exact substring** (after lower-casing and collapsing whitespace) of that chunk's text.
* `support` lists every snapshot and chunk that contains the fact, near-duplicates included. For `general`,
  `clarify`-without-memory and `abstain` questions `support` is empty. For `clarify`, put the memory side in
  `support` when one exists.
* `wrong_answers` is where you record the plausible mistakes (other people, older versions, sidebar
  previews). Always fill it for attribution, aggregation and false-premise questions.
* `split`: assign `dev` or `test` per **page**, not per question, so no page appears in both. About 40% test.
* `variant_of` links a noisy question to its clean original; both are separate lines with their own ids.

## 5. Validate before you hand over

Write `evals/private/check_gold.py` and run it. It must fail loudly if:

* any line is not valid JSON or lacks a required field, or an id is duplicated;
* any `answer_text` is not found in the named chunk of `evals/private/chunks.jsonl`;
* any `support` entry names a snapshot or chunk that does not exist;
* a `memory` question has empty `support`, or an `abstain`/`general` question has any;
* a question contains an `answer_text` verbatim (the answer leaked into the question);
* a page appears in both `dev` and `test`;

It should print counts per family, per behavior, per split, and the number of noisy variants.

## 6. Self-review

Before you finish, reread the whole file once as the user would: would a person really type this, and is the
right answer unambiguous given the data? Remove or fix a question if two different chunks give conflicting
answers and the data does not say which is right, or if the answer is only an artifact of how a page was
scrolled. Do not tune questions to what you think the system will pass.

## 7. Deliverables

* `evals/private/chunks.jsonl` and `evals/private/chunks.txt` (the dump you worked from).
* `evals/private/gold.jsonl` (the questions).
* `evals/private/check_gold.py` and its passing output.
* `evals/private/GOLD_REPORT.md`: counts per family, behavior and split; which families you could not fill and
  why (for example no real name collision, no prompt-injection text, too few distinct pages); the
  snapshot ids you relied on most; and a short list of pages the user should record next to unlock the gaps.
