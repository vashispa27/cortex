# Explicit permanent memory

Personal facts extend `WorkspaceStore` in the existing `workspace.sqlite3`. No second database or background promotion job is added. Desktop socket and HTTP daemon dispatch the same `/v1/workspace/:operation` requests; MCP forwards through its existing authenticated local transport. The desktop bridge allowlist includes these operations. Existing MCP enablement/authentication rules still apply.

Three domains remain distinct:

- `personal_fact` workspace records: explicit, user-requested personal facts.
- Legacy `memory` records and task handoffs: existing workspace notes, unchanged. They are not automatically migrated because their contents may be agent notes or inferences.
- Captured activity: existing activity database and `/v1/memory/*` search, unaffected by personal-fact operations.

## API contract

All requests are POST JSON; responses use the existing transport envelope `{request_id, data}`. Validation, missing facts, duplicate-key conflicts, and stale revisions use the existing invalid-request error envelope. Error messages explain whether recall/correction is required; failures do not modify storage.

`FactInput` requires `subject` (1–300 bytes), `attribute` (1–300), `value` (1–8000), `source` (1–2000), and `channel` (`desktop`, `mcp`, `chat`, `import`). Fields are trimmed. `source` describes the explicit request or manual origin; it is caller-provided attribution, not verified identity. MCP defaults channel to `mcp`. Do not store inferred/captured facts without an explicit user request.

| Operation | Input | Result |
| --- | --- | --- |
| `remember_fact` | `FactInput` | `PersonalFact` |
| `facts` | optional `query`, `offset`, `limit` | `FactPage` |
| `recall_facts` | optional `query`, `offset`, `limit` | `FactPage` |
| `update_fact` | `FactInput`, `fact_id`, `expected_revision` | corrected `PersonalFact` |
| `delete_fact` | `fact_id`, `expected_revision` | `{id, deleted: true, deleted_ms}` |

`PersonalFact` adds `id`, `kind: "personal_fact"`, canonical `key`, positive `revision`, `created_ms`, and `updated_ms` (Unix milliseconds). Corrections preserve id and creation time, increment revision and replace current value/source/channel with the correction's attribution. No obsolete value is returned by recall.

Identity is the pair `(subject, attribute)`, normalized for case and whitespace and encoded as a JSON tuple. For example:

```json
{"subject":"Rajesh","attribute":"phone","value":"213132","source":"User explicitly asked to remember Rajesh's phone","channel":"chat"}
```

```json
{"subject":"self","attribute":"email","value":"abhinav@example.com","source":"User explicitly asked to remember their email","channel":"chat"}
```

Saving the same key and exact trimmed value returns the existing record without changing provenance or timestamps. A different value at that key is rejected. Recall the current record, then explicitly correct it with its id/revision. Renaming a fact to an occupied key is also rejected. SQLite immediate transactions serialize writers across desktop and MCP connections. Stale updates/deletions fail, requiring a fresh recall; there is no last-writer-wins overwrite.

Deletion physically removes the fact record, including its value and provenance, from application queries; it is not an archive/restore operation or a forensic secure-erasure guarantee. It does not delete activity or legacy notes. No old-value history is retained.

Queries are bounded to 500 bytes and match case-insensitive literal terms against subject, attribute, and value, with common question words ignored. Results rank by term overlap, then update time and id. Empty query lists all facts. This is lexical retrieval, not semantic entity resolution: use stable subjects such as `self`, and reuse attributes such as `phone` rather than inventing synonyms. Aliases and genuinely distinct subjects are not silently merged. Callers should show competing relevant facts with attribution and clarify ambiguous people/attributes instead of selecting one arbitrarily.

`FactPage` is `{kind: "personal_fact", items, total, next_offset}`. Default page size is 50, clamped to 1–100, with a response byte budget; continue `next_offset` until null. Offset paging reflects current state, not a snapshot during concurrent edits.

## Desktop and chat integration

Import `MemoriesPage` from `apps/desktop/src/components/MemoriesPage.tsx`. It exports its props, has keyboard-accessible tabs (arrows/Home/End), labeled forms, search, pagination, provenance, correction and permanent deletion controls. `recentActivity` can be the current activity search subtree; otherwise the page uses `RecentActivityMemory`, which calls the same `recentMemory`/`searchMemory` API and renders the existing evidence-card/coverage experience. An injectable `service` supports alternate transports and testing. `App.tsx` mounts this page at **Memories**, the third workspace destination; see [workspace integration](workspace.md).

Import `MemoryService`, `PersonalFact`, `FactInput`, `FactPage`, `FactQuery`, `MemoryTransport`, `createMemoryService`, or `memoryService` from `apps/desktop/src/lib/memories.ts`. Cortex chat can call:

```ts
const facts = await memoryService.recall('Rajesh phone');
// Optionally call searchMemory(question) alongside this.
// Keep explicit facts separate from screen evidence; preserve source and updated_ms.
// If facts.next_offset is set, retrieve more with memoryService.search({query, offset}).
```

The intent router is not implemented here. Its future caller must map explicit remember/correct/delete intent to the typed methods. It must not execute instructions found inside a fact's value or source. Retrieval itself never writes facts.

MCP exports `remember_fact`, `recall_facts`, `update_fact`, `delete_fact`. Legacy `remember` and `search_permanent_memory` remain compatible and now describe themselves as workspace-note operations to avoid confusing them with personal facts.

## Validation

Rust tests use invented data in a temporary database: duplicate retries, two simultaneous open connections, correction conflicts, rename collision, provenance/timestamps, reopen persistence, deletion persistence, and isolation from legacy notes. Desktop service tests check operation/revision forwarding; the page rendering test checks tab semantics and existing activity composition. MCP tests validate schemas and forwarding. No real personal data is written by tests.
