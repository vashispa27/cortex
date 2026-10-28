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

### Chat writes

Typing a fact into Ask Cortex or the notch saves it through these same typed methods; see [chat-intent-routing.md](chat-intent-routing.md) for how a message becomes a write. Both the built-in parser (“Remember Rajesh’s phone number is 213132”) and the decision model (bare statements such as “my wife’s birthday is 14 March”, or “actually Rajesh’s phone is 99999”) produce a `FactInput` with `channel: "chat"` and the user's own words as `source`. Rules the chat enforces on top of the API:

- **A new fact is saved immediately** and the reply carries an **Undo** button, which deletes it by id and the revision it was saved at. A stale Undo (the fact changed since) fails with the revision conflict instead of deleting someone's newer edit.
- **Changing an existing value asks first.** If the subject and attribute already exist with a different value, chat replies with the old value and “Replace it with …?”, plus Confirm and Cancel buttons (or reply “yes”/“no”). Only the confirmed intent calls `update_fact`, with the revision read just before. Saving the identical value is a no-op, and ambiguous matches ask for the exact person and attribute.
- **The decision model never supplies a value on its own.** Code requires the value to appear in what the user typed (including the answer to an earlier clarifying question); a paraphrased or invented value is dropped and the message goes through the normal answer path. The cloud decision step is sent each fact's subject and attribute only, never its value.
- A message that quotes, reports or hypothesizes a command (“she said remember …”, “if I said remember my PIN is 1234, would you store it?”) never writes.

The router must not execute instructions found inside a fact's value or source. Retrieval itself never writes facts. MCP harnesses write through the structured tools below; their model is the decision model, so chat's confirm step does not apply there (the harness sees the `revision` conflict rules and the returned record, including `revision`, to confirm back to the user).

MCP exports `remember_fact`, `recall_facts`, `update_fact`, `delete_fact`. Legacy `remember` and `search_permanent_memory` remain compatible and now describe themselves as workspace-note operations to avoid confusing them with personal facts.

## Validation

Rust tests use invented data in a temporary database: duplicate retries, two simultaneous open connections, correction conflicts, rename collision, provenance/timestamps, reopen persistence, deletion persistence, and isolation from legacy notes. Desktop service tests check operation/revision forwarding; the page rendering test checks tab semantics and existing activity composition. MCP tests validate schemas and forwarding. No real personal data is written by tests.
