# Agent prompt: structure-aware chunking v1 (LinkedIn and X)

You are building v1 of structure-aware ("category-aware") chunking for Cortex, a Mac app that reads the
frontmost window through the macOS Accessibility (AX) tree, cleans the text, chunks it, embeds it into a local
Qdrant Edge index and answers questions from it. Read this whole prompt before writing code.

## 1. Why this exists

Today a captured window is flattened into one cleaned text body and cut into ~1,500-character chunks in reading
order (`cleaner::chunks_cfg`). On real pages this causes measured failures:

* **Noise dominates.** On a LinkedIn messaging page about 42% of the cleaned text is page furniture: the top
  menu bar, filter tabs, a screen-reader notice, "Status is online", "Select conversation with X" (repeats the
  next line), "View X's profile", "Press return to go to conversation details" on every preview, footer links and ads.
* **Regions are mixed.** The left conversation list ("sidebar") fills the first two chunks, the open chat is the
  last chunk. The sidebar repeats every contact's name, so it outranks the chat chunk for questions about a person,
  and the chat (which held the answer, a phone number) was cut off or ranked out.
* **Scrolling re-stores everything.** Every capture whose visible text differs becomes a new snapshot that is
  chunked in full, so an unchanged open chat is stored again each time the feed scrolls. One LinkedIn thread was
  stored ~15 times. With contextual retrieval on, every one of those chunks is a paid model call.
* **Authors get separated from posts.** On X, a chunk boundary can fall between a post's author line and its text,
  so the answer model attributes the post to the wrong person.

A previous experiment (commit `8854d1c`, `categorization.rs`, now deleted in the working tree) asked a local LLM
to partition the *cleaned* text into categories. It was slow (30 s per capture), produced tiny chunks that
separated authors from posts, and could not recover structure the cleaner had already removed. **Do not revive
that approach.** v1 segments the AX tree itself, before cleaning, with deterministic rules and no model calls.

## 2. What v1 must do

For pages on `linkedin.com` and `x.com` (and `twitter.com`), split one capture's AX nodes into typed **items**:

| kind | what it is | example |
|---|---|---|
| `noise` | navigation, menus, filter tabs, toolbars, footers, ads/promoted, toasts, status lines, accessibility hints, the browser's own UI (Chrome toolbar, bookmarks bar, tab strip) | "Home · My Network · Jobs", "Ad · HSBC", "Bookmarks" toolbar |
| `message` | one message (or one sender's run of messages) in an open chat thread, with sender and displayed time | "Aakarsh Yadav · 3:11 PM · Yo Abhinav / Hit me up on WA: …" |
| `preview` | one row of a conversation list: name, displayed date, last-message preview | "Yoshitha Vatluri · Oct 19 · You: ty :)" |
| `post` | one feed post, reply or quoted post, with author name, handle (X), displayed age and text | "Aviral Bhatnagar @aviralbhat · Oct 17 · Deep tech's risk capital…" |
| `profile` | the header card of a person or company (name, headline, connection degree) | "Aakarsh Yadav · AI Investments \| InfoEdge \| Ex-Founder · 1st" |
| `other` | everything on a supported page that is real content but none of the above | a job listing, an article body |

`noise` items are dropped. Everything else is kept, typed and stored as items. **Pages that are not on these
sites, or that your rules do not recognise, go through today's path unchanged** (cleaner, page chunking). v1 must
never make an unsupported page worse.

### Items, not pages

* Each kept item gets a stable identity: `sha256(app, site, kind, container key, author, displayed time,
  normalised text)`. The container key is the thread for messages (from the URL or the thread header), the site
  section for posts.
* A capture records a sighting of every item it contains. An item seen before is **not** stored, chunked or
  embedded again; only its sighting is added. Scrolling a feed therefore adds only the new posts, and an open chat
  that did not change adds nothing.
* The snapshot row is still written (it is the observation record, keeps `ax_nodes_json` and the cleaned body for
  fallback and for the existing tooling), but retrieval works on item chunks for supported pages.
* Keep a mapping item → every snapshot it was seen in (an `item_sightings` table or equivalent). Retrieval results,
  citations (`[snapshot_id]`) and the eval harness all speak snapshot ids: a hit on an item must resolve to its
  snapshots so citations and gold support checks keep working.

### Chunking by item

* A `post` is one chunk; split only if it is longer than the chunk target, and repeat the header on every part.
* Messages of one thread are grouped in order into chunks up to the chunk target, never mixing threads, keeping the
  sender/time line with its text. A message is never split from its sender line.
* `preview` rows of one conversation list are grouped into chunks (they are short); `profile` is one chunk.
* Every chunk carries a deterministic **header** built from the item's fields, for example
  `LinkedIn chat with Aakarsh Yadav · Aakarsh Yadav, Monday 3:11 PM` or `X post · Aviral Bhatnagar (@aviralbhat) · Oct 17`.
  The header is embedded and BM25-indexed with the chunk text, and shown to the answer model as a labelled line
  above the evidence text. Header fields must be copied verbatim from the page (names, handles, displayed times);
  never infer or convert them. If a field is missing, leave it out.
* Store `kind`, `author`, `displayed_time` and `container` on the chunk row and in the Qdrant payload.

### Contextual retrieval

`contextual.rs` (LLM-written chunk context, opt-in) exists in the working tree. In v1, **item chunks never call
the context model**: the deterministic header replaces it. Batched post summaries are a later step, not v1.
Leave the context path working for unsupported pages exactly as it is today.

## 3. Start by surveying, do not guess

Before writing rules, look at what the trees actually contain. Raw trees are stored per snapshot in
`snapshots.ax_nodes_json`. Each node has `role`, `name`, `value`, `visible`, `bounds`, `excluded`, `protected`,
`children` and an `ancestor_path` (list of `{role, name}` from the window down). Container labels in
`ancestor_path` are the main signal.

Already observed on LinkedIn (verify, then extend):

| page | label in `ancestor_path` | meaning |
|---|---|---|
| messaging | `AXList "Conversation List"` | previews |
| messaging | `AXGroup "Global Navigation"`, `"Primary Navigation"`, `"LinkedIn Footer Content"`, `"advertisement"`, `"Toast message"` | noise |
| messaging | `AXHeading "<person>"` + headline link | profile card |
| messaging | lines `<name> sent the following message(s) at <time>`, a day header (`MONDAY`) | message groups |
| feed | `AXGroup "Primary content"` vs `AXGroup "Sidebar"` | main vs side |
| feed | `AXHeading "Feed post"` | one per post |
| feed | `Ad · <brand>`, `Promoted`, `Profile viewers` | noise |
| any Chrome page | `AXToolbar "Bookmarks"`, tab strip, address bar | browser UI noise |

X has not been surveyed. Find how posts (`article`-like containers), authors, handles, ages, quoted posts,
"Show more", the right column (trends, "Who to follow", news), the left navigation and DMs appear.

Write `evals/tools/ax_regions.py`: for a snapshot id (or all snapshots of a site), print the region tree
(containers with role and label, node counts, the first text under each) so a person can see the structure.
Run it on every LinkedIn and X snapshot in the eval archive and record the labels you rely on, with examples, in
`docs/structure-aware-chunking.md`.

## 4. Data and safety rules

* Work only on the **eval archive** `~/Library/Application Support/Cortex/eval-memory/` (35 X and LinkedIn pages
  recorded on 2026-10-19, raw trees included) and copies you make of it. **Never open
  `~/Library/Application Support/Cortex/local-memory/`**, the user's real memory.
* The pages contain real people's messages. Keep any dump, fixture or report built from them under `evals/private/`
  (gitignored). Unit-test fixtures that are committed must be **synthetic** trees that mimic the observed structure
  with invented names and text.
* Do not change `crates/platform-mac/native/Capture.swift`. Any change to the capture helper invalidates the user's
  macOS Accessibility grant and forces a manual re-grant. v1 works on the nodes the helper already emits.
* No network calls. Respect `protected` and `excluded` nodes exactly as the cleaner does (drop them, never read
  their text).
* Other work is in progress in the same working tree (contextual retrieval, eval tooling, desktop settings). Do not
  revert or reformat files you did not need to change. Keep default behaviour byte-identical when the feature is off.

## 5. Where it plugs in

* `crates/cortex/src/main.rs`: `record_with_target` (capture → clean → chunk → store), `index_pending` (embedding),
  `retrieve_with` (search, collapse to snapshots), `evidence_text` / `evidence_snippet` (what the model sees).
* `crates/cortex/src/cleaner.rs`: today's cleaning and chunking; reuse its noise and protected-node handling.
* `crates/cortex/src/dedup.rs`: snapshot-level dedup layers; item identity is a new, finer layer.
* `crates/cortex/src/prefix.rs`: embedded text prefix and `index_version`. Add a variant/tag such as
  `segments-v1` so a mixed index demands a rebuild.
* `crates/cortex/src/schema.sql` plus the migration code in `open_db`: new tables/columns must migrate existing
  databases without data loss.
* `crates/cortex/src/answer_pipeline.rs`: how evidence and headers are shown to the model (`PROMPT_VERSION`).
* Put the segmenter in a new module, for example `crates/cortex/src/segment.rs`, with per-site rules in one place
  (a small table keyed by site and container label), plus generic noise rules (navigation, banner, footer,
  toolbar, advertisement, sponsored/promoted, toast, status lines).
* Gate it behind `CORTEX_SEGMENTS=1` (off by default). Settings UI is a later step.

## 6. Tests

* Unit tests on synthetic trees for each page type (LinkedIn messaging, LinkedIn feed, LinkedIn profile, X home
  timeline, X single-post page): expected item count per kind, authors, displayed times, that noise is dropped,
  that a message stays with its sender line, that an author stays with its post.
* Item dedup: two captures of the same thread at different scroll positions store each message once; a feed
  scrolled by two posts adds exactly the new posts; an unchanged chat plus a changed feed adds no message items.
* Fallback: an unsupported page (and a supported page with no recognised regions) yields exactly today's chunks.
* With the flag off, `cargo test -p cortex` and every existing eval produce identical results.

## 7. Evaluate on the eval archive

1. **Segmentation report** (no model): for every LinkedIn and X snapshot in the eval archive, print items per
   kind, the share of text classified `noise` and `other`, and any page that fell back. Read a sample of items by
   hand. Save it as `evals/private/segments-report.md`.
2. **Segmented archive copy:** build `~/Library/Application Support/Cortex/eval-memory-segments` by re-ingesting the
   stored raw trees of the eval archive through the new path in observation order (look at
   `evals/tools/prepare_context_archive.py` for how a derived archive is built safely from `eval-memory` without
   modifying it). Report snapshots, items, chunks and vector points before and after (this measures the scroll dedup).
3. **Retrieval eval (free, run it):** `evals/tools/run_gold.py` with `--archive` on both archives and the gold set
   `evals/private/gold-v1.jsonl` (309 questions, `support` lists snapshot ids). Report hit@1/3/8 and MRR overall and
   for the families `attribution`, `chat_lookup`, `scheduling`, `contact_details`, `aggregation`, `cross_chunk`.
   Gold support is by snapshot id: a retrieved item counts for every snapshot it was seen in.
4. **Answer eval (costs money, the user runs it):** document the exact command, for example
   `EVAL_ARCHIVE="$HOME/Library/Application Support/Cortex/eval-memory-segments" EVAL_CLOUD_MODEL=anthropic/claude-haiku-5.5 evals/run.sh`,
   and how to compare it with the baseline run `evals/private/answers/cloud-anthropic-claude-haiku-5.5_1021-1513.*`.

Targets for v1: no regression in overall hit@8; better attribution and chat_lookup; at least 30% fewer chunks on
the eval archive; zero model calls added. If a target is missed, say so and why; do not tune rules to the gold
questions.

## 8. Deliverables

* `segment.rs` (or equivalent), schema migration, item storage and dedup, item chunking with headers, retrieval and
  evidence changes, all behind `CORTEX_SEGMENTS=1`.
* `evals/tools/ax_regions.py` and `docs/structure-aware-chunking.md` (observed labels, rules, what is out of scope).
* Synthetic unit tests; all existing tests passing.
* `evals/private/segments-report.md` with the segmentation report, the chunk-count comparison and the retrieval
  results, plus the command for the answer eval.
* A short list of what v1 does not handle yet (other sites, native apps such as Slack or Messages, X DMs if not
  covered, batched post summaries) and what you would do next.
