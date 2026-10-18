# Plan: collecting data to make the assistant sound like the user

Goal: build a corpus of text the user really wrote, labelled by where and how it was written, and only start a (paid) fine-tune for sentence autocomplete once the corpus is provably big and clean enough.

This builds on spec section 8.4 ("Learning writing style") and test scenario 16.3 #6 ("visible but authored by someone else is not a style example") in `goldfish-end-to-end-spec.md`. Nothing here is implemented yet; `docs/implementation-status.md` lists style learning as not implemented.

## What exists today

- The macOS capture (`crates/platform-mac/native/Capture.swift`) takes accessibility-tree snapshots. Text-bearing nodes (`AXTextArea`, `AXTextView`, `AXTextField`, `AXStaticText`) are all emitted with the same `role/name/value` shape. Nothing marks a node as "editable and focused", so today a message you typed and a message you received look the same.
- `RawWindow` carries `focus_role`, `focus_name`, `focus_path`, but not the focused field's value, and no editable/focused flag per node.
- `crates/capture/src/lib.rs` already redacts, skips secure fields, applies app/domain exclusions, and keeps recognisable post and conversation URLs (X status, X messages, ChatGPT conversations, LinkedIn activity). That gives us `domain` and a coarse surface type for free.
- `crates/capture/src/edit.rs` is the path that writes assistant text back into the user's fields, so it is the natural place to record "this text came from us".

The central gap: the pipeline cannot currently tell authorship. Everything below hangs on fixing that first.

## How the four requirements map to work

### 1. Where the data comes from (source labels)

Every candidate sample gets labels. Labels are metadata for balancing and conditioning, not gates.

- `app_id`, `domain`, and `surface_kind` derived from app and URL: `x_post`, `x_reply`, `x_dm`, `linkedin_post`, `linkedin_comment`, `linkedin_dm`, `email_compose`, `chat_message` (Slack, WhatsApp, iMessage), `doc_edit`, `note`, `ai_prompt` (ChatGPT, Claude), `code_comment`, `other`.
- `channel`: public broadcast, public reply, private 1:1, private group, self (notes, docs).
- `register`: casual, neutral, formal. Start rule-based from `surface_kind` plus recipient (a DM to a friend is casual, an email to a recruiter is formal), then refine with a small classifier or LLM labeller run offline. Store the label and how it was derived.
- `recipient_hash`: salted hash of the person or thread, never the name, so we can later learn per-recipient tone without storing identities in the training set.
- `language`, `length_chars`, `authored_ms`, `timezone`.

The fine-tune can use these as control prefixes (for example `<x_post|casual>`) so one model serves several registers, and the mix report (below) shows which registers are thin.

### 2. Make sure we wrote it (authorship)

Treat authorship as evidence with tiers, store the evidence, and only train on high tiers.

Tier A, train on this: text observed in a non-secure, editable, focused field, and it grew by typing across several snapshots (small incremental deltas, not one big jump). Strongest form is a draft-to-sent pair: the field then empties or shrinks and the same text shows up as a sent message in the thread (matched by hash or near-match). Take the sent version as the sample, because it is the finished text.

Tier B, review queue, not auto-trained: text in an editable field with no confirmed send, such as an abandoned draft or a note.

Tier C, train only after the user confirms their identity per app: text in a static node whose sender matches a configured own identity (own X handle, own LinkedIn name, "You" in a chat bubble, "me" in Gmail). Lower confidence because the match can be wrong. Requires a small "my identities" setting.

Always reject:

- text read in a feed, thread, or email body from anyone else
- quoted or forwarded blocks inside a message you did send
- signatures, boilerplate footers, auto-generated headers
- pasted text: a large single-snapshot jump in field length with no incremental growth. Optional later: count-only keystroke events (counts, never content) to confirm typing. Do not build a keylogger.
- anything in secure fields, excluded apps/domains, or private browsing (already handled upstream)

Implementation needs: Swift capture must emit `editable`, `focused`, and `secure` per node and the focused field's value; the pipeline must diff consecutive snapshots of the same `window_session_id` and `focus_path`.

Quality bar: sample 100 eligible items by hand every time the extractor changes. Authorship precision must be at least 98 percent, or the extractor does not ship. A small in-app "was this you?" review list makes this cheap and also yields labelled data for tuning the heuristics.

### 3. Do not collect text we generated ourselves

Interpretation: "we" is Goldfish. Assistant-written text must never be mistaken for the user's own writing, otherwise the model learns its own output and drifts. If you meant something else (for example "do not collect text I am currently drafting"), say so and I will adjust this section.

- Log every insertion made through `edit.rs`: `request_id`, field, hash of inserted text, time.
- Any later sample whose text matches an inserted draft (exact hash, or high n-gram overlap) is labelled `assistant_origin` and excluded from the SFT set.
- If the user then edited the draft, keep the original and the edited final as a separate preference dataset (before/after), not as plain style text. The spec already treats edited output as feedback, and merely leaving text on screen is weak evidence.
- Treat the ChatGPT and Claude response areas as other-authored. User prompts in those apps are real user text but a distinct register (`ai_prompt`), off by default for autocomplete training.
- Also dedupe near-identical samples (templates, repeated replies like "sounds good") so a few phrases do not dominate.

### 4. Do not fine-tune until there is enough data (cost gate)

Add a `style-status` report and make training refuse to start unless every gate passes.

Gate 0, cheapest first. Before any training, use the same corpus for retrieval: put 5 to 20 of the user's best matching samples into the prompt (few-shot) for the same register and recipient. This works from the first few hundred samples and costs nothing extra. If a blind comparison says it is good enough, delay fine-tuning.

Gate 1, quantity (rules of thumb, not guarantees; tune after the pilot): at least 2,000 eligible samples and about 200k tokens for a pilot LoRA; about 10,000 samples and 1M or more tokens before a serious run. Also at least 30 days of spread, so one busy week does not dominate.

Gate 2, mix: each register you want autocomplete to cover has at least 300 samples, and no single source is above about 50 percent of the corpus.

Gate 3, quality: authorship precision audit passed (at least 98 percent), duplicate ratio under 15 percent, no assistant-origin items, redaction pass clean.

Gate 4, evaluation: a held-out set of at least 200 samples (30 or more per register), split by time and thread so it is never trained on. Measure the baseline first: the base model plus few-shot retrieval. Fine-tune only if the baseline leaves a clear gap. Metrics: next-sentence acceptance proxy (top-1 token match and edit distance to the real continuation), perplexity on held-out text, and a blind pairwise "which sounds like me" judgement by the user on 30 pairs.

Gate 5, cost: the training command prints dataset size, token count, epochs, and estimated price before it does anything, and needs explicit confirmation. Do the pilot locally first (MLX LoRA on a 1B to 3B model on this Mac), which costs only time, and pay for a hosted fine-tune only after the local pilot shows lift.

Autocomplete note: it is a different job from drafting. Autocomplete wants a small, fast local model trained on prefix-to-continuation pairs cut from the user's final sentences. Drafting a whole reply is better served by retrieval plus a strong general model. The same corpus feeds both.

## Data model

One table or JSONL, `style_samples`, kept local and separate from the memory snapshots:

`id`, `text`, `text_hash`, `source` (`app_id`, `domain`, `surface_kind`, `channel`), `register`, `register_method`, `recipient_hash`, `language`, `authored_ms`, `authorship` (`tier`, `evidence`, `confidence`), `origin` (`typed`, `pasted`, `assistant`, `unknown`), `status` (`candidate`, `eligible`, `rejected`, `reviewed_yes`, `reviewed_no`), `reject_reason`, `redaction_version`, `snapshot_ids`.

Privacy rules: samples pass the existing redaction first; third-party text is never stored here; the corpus stays on-device and is uploaded only for a fine-tune the user confirms; per-source opt-out and a "forget this sample or source" delete are required.

## Phases

1. Schema and labels: define `style_samples`, the taxonomy, and the `surface_kind` mapper from app and URL. Unit tests on URL and app mapping.
2. Capture changes: Swift emits `editable`, `focused`, `secure` per node plus the focused field's value; extend `RawNode`/`RawWindow` in `crates/capture`. Tests for secure and paste cases.
3. Candidate extractor (new crate, for example `crates/style`): snapshot-diff over a window session to produce Tier A and B candidates, draft-to-sent matching, quote/signature stripping, assistant-origin matching against the `edit.rs` insertion log.
4. Review and audit: a "was this you?" list in the desktop app, and the precision audit script under `evals/style/`.
5. Readiness: `style-status` command with all gates above, plus the held-out split and the few-shot baseline eval.
6. Local LoRA pilot with MLX on the corpus, compare against the baseline using the Gate 4 metrics.
7. Hosted fine-tune only if the pilot beats the baseline and Gate 5 is confirmed.

Phases 1 to 5 are cheap and also pay off immediately through style retrieval. Phases 6 and 7 are the only ones that cost money.

## Open questions

- Confirm the reading of requirement 3 above (assistant-generated text excluded).
- Which surfaces matter most to start: X, LinkedIn, Gmail, WhatsApp, iMessage? Each needs its own "sent message" and own-identity rule.
- Is keystroke counting (no content) acceptable for paste detection, or should it stay snapshot-only?
- Local-only fine-tune, or is a hosted run acceptable once the gates pass?
- Windows capture (`crates/platform-win`) is out of scope until the macOS path works.
