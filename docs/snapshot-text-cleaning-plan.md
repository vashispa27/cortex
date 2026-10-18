# Snapshot text cleaning plan

## Implementation status (16 October 2026)

Implemented in the macOS `rewind` CLI as cleaner v3. The helper now records bounded AX ancestor paths and visible bounds. SQLite stores the original AX JSON, cleaned body, quality, coverage, and per-node removal reasons. Search indexes clean message/paragraph chunks in Qdrant Edge. `capture --clean-dry-run` previews changes; `capture --apply-cleaning` backs up SQLite, reprocesses saved AX nodes, merges duplicate observations, regenerates derived records, and rebuilds Qdrant. The reviewed ChatGPT example retained the recommendation and nutrition quantities while removing sidebar and action controls. Eight old local rows lacked AX JSON and remain preserved but unindexed. Fresh live output from the revised helper still needs app-by-app inspection; generic unknown regions are deliberately marked `uncertain`.

## What is wrong today

`rewind` currently turns every visible AX node into a `role [context]: value` line in `snapshots.body`. That mixes answer text with browser tabs, navigation, feedback buttons, the prompt box, and repeated labels. The helper also flattens its output (`children: []`), so the Rust code has little information about which part of the window a node belongs to. The installed Rewind database is separate; its captured sidebar example shows why selecting the content region matters as much as stripping AX tags.

## Desired stored result

For the supplied ChatGPT example, the searchable text should resemble:

> Carbs: 185 g. Good for gym performance.
>
> Fat: 35 g. A little below your usual target.
>
> My suggestion: Add 10 ml olive oil (~80 kcal, 9 g fat) to one of your meals. That brings your day to approximately 1,687 kcal, 137 g protein, 185 g carbs and 44 g fat — very close to your usual cutting targets. No additional protein shake needed.

The source app, window title, full URL, capture times, and extraction limitations remain metadata. We should preserve speaker labels and displayed message times when AX exposes them; we should not infer either from the text above alone.

## Rules

| AX material | Treatment | Reason |
| --- | --- | --- |
| Main conversation or document text, headings, lists, numeric facts | Keep in reading order | This is the evidence users will search. |
| Sender names and displayed message times | Keep with their message when exposed | Needed for “who said what” and time questions. |
| Repeated heading and static text with the same value | Collapse once | `185 g` appears twice in the sample. |
| Text split across adjacent nodes | Join into a sentence or paragraph when the node order and region agree | “Add” and “10 ml olive oil” are one thought. |
| Sidebar, recent chat list, browser tabs, toolbar, address field | Exclude from searchable text | These describe navigation, not the open conversation. |
| Copy, rate, dictate, voice, scroll, add-files, and other action controls | Exclude by default | Their labels are UI actions. |
| Prompt placeholder and repeated `Latest response` label | Exclude | They are interface chrome. |
| Content links and meaningful controls within a document | Keep contextually | A blanket ban on all buttons or links would lose task content in some apps. |
| “ChatGPT can make mistakes” and similar app-specific boilerplate | Exclude through narrow, versioned rules | These recur on every capture. |

Do not delete text merely because it is short, contains a number, or has a common word such as “Add.” If the content region cannot be identified confidently, keep candidate content and mark its quality as uncertain rather than silently discarding it.

## Implementation sequence

1. **Keep structural context during capture.** Extend each AX node with a bounded ancestor role/name path and, where available, its visible bounds. The helper already filters protected controls before reading values; preserve that order. A text node's location in `Conversation` versus a sidebar or browser toolbar is the main signal.
2. **Add a deterministic cleaner in Rust.** Give it the AX nodes, app ID, URL, and window metadata. First classify regions (main content, navigation, toolbar, composer, unknown), then classify nodes (content, metadata, control, boilerplate). Start with a small ChatGPT rule set and a conservative generic fallback. Keep the rule set versioned and record a drop reason per node for debugging.
3. **Normalize only retained content.** Remove `AX...` prefixes and context wrappers from the searchable text. Collapse exact adjacent duplicates, join sentence fragments within one message, retain paragraph/message boundaries, and keep displayed times attached to the right speaker. Do not paraphrase or change quantities.
4. **Persist both forms where useful.** Store cleaned text in `snapshots.body` and continue storing the original structured AX nodes in `ax_nodes_json` so a future cleaner can reprocess them. Add a cleaner version and quality/coverage fields. A capture with no substantial content after cleaning should be skipped from the searchable index and reported as `navigation_only` or `content_unavailable`.
5. **Index cleaned content.** Use the clean body for BM25, dense embeddings, snippets, derived records, and evidence deduplication. The current single dense vector truncates long pages at the model's 512-token input; split long conversations by message and long documents by paragraph group, with every chunk pointing back to its snapshot ID and text span. Do not split a sentence or mix the sidebar into a chunk.
6. **Reprocess existing local captures.** Recompute clean bodies from `ax_nodes_json` in a dry run first. Show before/after text and removed-node reasons for selected snapshots. Once reviewed, update the body and cleaner version, reconcile duplicate snapshots/observations, and rebuild the Qdrant index from SQLite. Keep the original AX JSON throughout.

## Verification before switching the index

- The supplied ChatGPT capture retains every nutrition number and the olive-oil recommendation while omitting Copy, Rate response, the prompt box, browser tabs, and the sidebar.
- A sidebar-only capture produces no searchable answer text.
- A real chat with multiple speakers keeps each speaker and displayed time with the correct message.
- A regular article and a non-browser app still retain their actual content, including meaningful links or controls.
- Repeated polls with changed toolbar state reuse the same content fingerprint and add observations rather than creating new evidence.
- Search for “olive oil,” “185 g carbs,” and “who recommended it” returns the clean source text and original snapshot reference.
