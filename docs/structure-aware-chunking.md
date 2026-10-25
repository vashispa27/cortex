# Structure-aware chunking (v1: LinkedIn and X)

Off by default. `CORTEX_SEGMENTS=1` turns it on for ingest; an index that already holds items keeps it on without
the flag. With the flag off, nothing in this document runs and every existing path, test and eval is unchanged.

## What it does

For pages on `linkedin.com`, `x.com` and `twitter.com`, one capture's Accessibility nodes are split into typed
**items** before any cleaning, with deterministic rules and no model call (`crates/cortex/src/segment.rs`):

| kind | what | example |
|---|---|---|
| `noise` | page furniture; dropped | navigation, filter tabs, footers, ads, toasts, status lines, the browser's toolbar and tab strip |
| `message` | one message, or one sender's run, with sender and displayed time | `Suchi . · FRIDAY 10:08 PM · Hey Abhinav…` |
| `preview` | one row of a conversation list | `Aakarsh Yadav · 3:23 PM · You: Hey Aakarsh, sure.` |
| `post` | a feed post, reply, quote or single post | `Aviral Bhatnagar @aviralbhat Oct 17 · Deep tech's risk capital…` |
| `profile` | the card of the person at the other end of a thread, or a profile page | `Aakarsh Yadav · AI Investments \| InfoEdge` |
| `other` | live text no rule claimed that is long enough to be content | an article body |

A page on another site, or a supported page where no item other than `other` is recognised, goes through today's
path (cleaner, page chunks) unchanged.

### Items, not pages

* Identity: `sha256(app, site, kind, container, author [+ handle], displayed time, normalised text)`. The container is
  the thread id for messages (`/messaging/thread/<id>`, `/i/chat/<id>`), the first URL path segment for posts
  (`home`, a username) and `feed` for LinkedIn. **Relative ages** (`22 hours ago`, `21h`, `3w`) change while the item
  stays the same, so they are left out of the identity (they are still stored and shown). Absolute times and day
  headers (`Oct 17`, `FRIDAY 10:08 PM`) are part of it.
* A capture adds a *sighting* of every item it contains (`item_sightings`). An item seen before is not stored,
  chunked or embedded again. Scrolling a feed adds only the new posts; an unchanged open chat adds nothing.
* The snapshot row is still written (raw tree, cleaned body, observations); for a segmented page it has no page
  chunks. The near-identical-page merge (`dedup` layer 3) is skipped for segmented pages: items are the finer layer.
* A chunk belongs to the snapshot that first held its items (`chunks.snapshot_id`) and is resolved by retrieval to
  **every snapshot that held all of its items** (`items::chunk_snapshots`). One of them (a snapshot that is already
  a result, else the most recent) speaks for the chunk; the others are printed as "Other captured versions of this
  page", which is how the gold checks and citations keep working. The vector point's payload carries the union of
  snapshots that held any of its items, so date filters find it; it is refreshed on the next indexing pass
  (`chunks.payload_dirty`).

### Chunks

* A post is one chunk, split only past the chunk target (1,600 characters) with its header on every part.
* Messages of one thread are grouped in order up to the target, never across threads, and every message keeps its
  `<sender> (<time>):` line. Previews of one list are grouped; a profile is one chunk. Only **new** items are
  chunked, so a chunk is a run of items that first appeared together.
* Every chunk has a deterministic header built from the page's own strings, never inferred:
  `X post · Aviral Bhatnagar (@aviralbhat) · Oct 17`, `LinkedIn post · Sparsh Bhardwaj · 1m · <headline>`,
  `LinkedIn chat with Suchi . · Suchi ., FRIDAY 10:08 PM` (one message) or `… · FRIDAY 10:08 PM to FRIDAY 11:28 PM`,
  `LinkedIn conversation list`. The header is embedded and BM25-indexed with the text (`header\nbody`), and the answer
  prompt shows it as a `Context:` line above the passage. Missing fields are left out.
* `chunks` gets `kind, author, displayed_time, container, header, payload_dirty`; the same fields except
  `payload_dirty` are in the Qdrant payload. Tables `items`, `item_sightings`, `chunk_items` are created by
  `schema.sql`; the new `chunks` columns are added by the migration loop in `open_db` (no data is touched).
* Item chunks never call the context model (`contextual.rs`); the header replaces it. Unsupported pages keep the
  context path exactly as before.
* `index_version` gets `:segments-v1`, so an index that mixes the two chunkings demands `--rebuild-index`.
  `cortex capture --apply-cleaning` refuses to run on a memory that holds items.

## Observed labels the rules rely on

Surveyed with `python3 evals/tools/ax_regions.py --site linkedin|x` over the 35 pages of the eval archive
(recorded 2026-10-19). The tool prints the container tree (role, label, node count, first text) of a snapshot.
Container labels are in `ancestor_path`; unlabelled generic groups are folded.

### LinkedIn

| where | label | meaning | rule |
|---|---|---|---|
| any page | `AXToolbar "Bookmarks"`, `AXToolbar ""`, `AXTabGroup`, anything outside an `AXWebArea` | the browser's UI | noise |
| all | `AXGroup "Global Navigation"` / `"Primary Navigation"` | top menu | noise |
| all | `AXGroup "LinkedIn Footer Content"` | footer links | noise |
| messaging | `AXGroup "advertisement"` (`Work With Us`), `"Toast message"` | ad, toast | noise |
| feed | `AXGroup "Sidebar"` (own profile card, "Profile viewers"), `"Skip navigation menu"` | left column, skip link | noise |
| feed | `AXGroup "Aside"` (LinkedIn News): one `AXLink` per story with `StaticText` children (headline, age, readers) | news the user saw | `other` items, container `aside`; promoted cards follow the ads switch |
| messaging | `AXList "Conversation List"` | previews. A row starts at `AXCheckBox "Select conversation with <name>"`, then `AXHeading <name>`, the date (twice), the preview text, then `. Press return…`, `Status is …`, `Sponsored`, `N new notification`, and ends at `AXButton "Open the options list…"` | preview (sponsored rows dropped) |
| messaging | `AXLink "<name> <headline>"` around `AXHeading "<name>"` | the person at the other end | profile |
| messaging | `StaticText "FRIDAY"` / `TODAY` / `OCT 16` | day header | prefixes the time of the messages after it |
| messaging | `StaticText "<name> sent the following message(s) at <time>"` | a message starts; followed by `View <name>'s profile`, name, `•`, the time, then the text lines | message |
| messaging | first `AXButton` after the text (`Reply to conversation with…`) | end of the thread | closes the last message |
| feed | `AXGroup "Primary content"` with `AXHeading "Feed post…"` | one per post; then `AXLink "<name> Premium Profile 1st"`, headline, age (`1m`, `21h`), `AXButton "Open control menu for post by …"`, the text, and `Switch to different account` / `Reaction button…` at the end | post |
| feed | `Promoted by`, `Promoted`, `Sponsored` | ad | post dropped (see the ads switch) |

### X

| where | label | meaning | rule |
|---|---|---|---|
| all | `AXGroup "Primary"` | left navigation | noise |
| all | `AXGroup "Trending"` > `Trending now` / `Today's News` cards (one `AXLink` per card with `StaticText` children: headline, "Trending now · News · 4,942 posts", sometimes a quoted post) | news and trends the user saw | `other` items, container `trending`; `Promoted by …` cards follow the ads switch |
| all | `AXGroup "Who to follow"`, `"Relevant people"`, `"Footer"` inside the right column | account suggestions, footer links | noise |
| home, status, profile | `AXGroup "Timeline: <title>"` (`Timeline: Your Home Timeline`, `Timeline: Conversation`) | the posts. Each child group is named `<author> [Verified account] @handle <age> <text start>` | one post per group |
| post | `AXLink "<author> [Verified account]"`, `AXLink "@handle"`, `AXLink "<age>"` (`22 hours ago`, `Oct 17`), text `AXStaticText`s | fields | author, handle, time, text |
| post | `AXLink "<name> reposted"` | repost header | shown as the post's byline |
| post | `AXGroup "Quote …"` containing `AXLink "<author> [Verified account] @handle <time> <text>"` | quoted post | stays in the quoting post's chunk as `Quoted post by <author> (<handle>), <time>:` plus its text, nested quotes included, so each author is named next to their own words |
| post | `AXGroup "<n> replies, <n> likes, <n> views"`, `Show more`, `Grok actions` | counts and controls | dropped |
| post | `StaticText "Ad"` | promoted | post dropped (see the ads switch) |
| status page | `AXLink "1:04 PM · Oct 19, 2026"` after the text | absolute time | time |
| chat | `AXList "Conversations"`, rows `AXLink "user avatar <name> … <age> You: <text>"` with the name, age, `You: `, text as `StaticText`s | previews | preview |
| chat | `AXGroup "Messages"`; below it nested unlabelled groups, then the bubble `AXGroup "<sender> <H:MM AM>"` (or `Attachment <sender>`, or `<sender>`); `StaticText` directly under `Messages` such as `Sat, Oct 10 at 2:40 AM` or `Friday 7:57 PM` | messages and day headers | message; an untimed bubble waits for the next timed one of the same sender |

## Promoted posts: a switch, and what it costs

The brief classifies ads and promoted posts as `noise`, and that is the default. `CORTEX_SEGMENTS_ADS=1` keeps them
as `post` items marked `ad` (header `X ad · Brand (@brand)`), and promoted trend cards as `other`. The retrieval eval
on the 309-question gold set shows what the default costs, because the set asks about ads the user scrolled past
("was that an ad or a post", "which ads showed up"): see `evals/private/segments-report.md`. This is a product
choice, not a bug in the rules; the tools to decide with the numbers are in place.

## Known limits of v1

* Other sites and native apps (Slack, Messages, Mail), X Explore/Notifications/Profile pages beyond their posts,
  LinkedIn jobs, search results, company pages, comments under posts: not segmented (they fall back to page chunks, or
  show up as `other`).
* LinkedIn profile pages (`/in/…`) are covered only by a synthetic test; the eval archive has none.
* X metrics (likes, views) are dropped. Images, videos and link cards are not text and are not captured.
* A relative age is stored as first seen; it is not updated on later sightings.
* "Active" is process-wide: a process that opens an index holding items (the eval archive) segments every capture it
  makes afterwards. Real captures and an item index should not share a process.
* Duplicates inside one capture (the same message text, author and time twice) count once.
* A chunk resolves to the snapshots that held *all* of its items. A later capture that scrolled past part of a
  multi-message chunk is not listed for it, so a date filter on that later day does not find the chunk through that
  capture (the vector point's payload is wider, so the chunk is still retrieved, then checked against the
  observations of the snapshots it resolves to).

## Commands

```bash
python3 evals/tools/ax_regions.py 18                  # one snapshot's container tree
python3 evals/tools/ax_regions.py --site x --labels   # label table over the archive
cargo build --release -p cortex
./target/release/cortex segment-report ~/Library/Application\ Support/Cortex/eval-memory > evals/private/segments-report-table.md
python3 evals/tools/prepare_segment_archive.py        # builds eval-memory-segments and prints the before/after counts
python3 evals/tools/run_gold.py --archive ~/Library/Application\ Support/Cortex/eval-memory-segments --out evals/private/retrieval_segments.json
```

The answer eval costs money and is the user's to run:

```bash
EVAL_ARCHIVE="$HOME/Library/Application Support/Cortex/eval-memory-segments" EVAL_CLOUD_MODEL=anthropic/claude-haiku-5.5 evals/run.sh
```

Compare it with the baseline `evals/private/answers/cloud-anthropic-claude-haiku-5.5_1021-1513.*`
(`python3 evals/tools/compare_runs.py <baseline run> <new run>`; the run name is printed by `evals/run.sh`).
