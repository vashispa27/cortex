# Fix 5: context prefix and sender labels (notes)

Two parts, measured separately on the 124-question set (122 plus two new Slack speaker questions, q123 and
q124, whose answer text includes the sender and so could not exist before the cleaner change).

## Cleaner: Slack-style sender buttons (adopted)
Slack exposes the sender as an `AXButton` followed by the message time as an `AXLink` in the same container.
The cleaner dropped the button as an action control, so the body had times but no names. `clean()` now
keeps the pair as `Name (9:12 AM):` (the same shape the X-chat rule already produced) and drops the
duplicate time nodes (`sender_label`, `displayed_time_attached`). Result: q123 and q124 (sender in the
answer) are found at chunk and final rank 1. Against the Fix 4 report on the original 122 questions the
change is neutral (final hit@8 96 -> 96, hit@1 71 -> 70, MRR 0.823 -> 0.820, chunk MRR +0.006, all within
noise). `cleaner::VERSION` is NOT bumped (see "Decision for the user").

## Prefix on embedded text (implemented, off by default)
`prefix.rs` builds `prefix + chunk` for the embedder and BM25 (title; or title | app | domain | capture date,
plus `Speaker:` for chunks cut mid-message). Stored chunks, spans, snippets and evidence are untouched, the
query is embedded as is, and the prefix format is part of the index version (`:prefix-context-v1`), so a
database indexed with a prefix demands `--rebuild-index` exactly like a model change. Nothing leaves the
machine.

| variant | final hit@1 | final hit@8 | final MRR | chunk MRR | q089 chunk rank | near-dup slots |
|---|---|---|---|---|---|---|
| none (default) | 72 | 98 | 0.8235 | 0.816 | 13 | 4.02% |
| title | 71 | 96 | 0.8088 | 0.799 | 9 | 4.06% |
| title + app + domain + date + speaker | 72 | 96 | 0.8137 | 0.819 | 9 | 4.06% |

The prefix lifts the macros table chunk (q089) from chunk rank 13 to 9, but not enough to show it by itself,
and elsewhere it moves queries both ways: the paired difference for the context prefix is final hit@8 -2
(CI [-0.05, 0.00]), hit@1 0, MRR -0.010: within noise, and not a gain. Paraphrase final hit@1 is unchanged
(0.50). With `chunks_per_result=1` (no Fix 2) the macros question stays unanswered under every variant, so
the prefix does not replace Fix 2 on this corpus. Same-page crowding is unchanged.

Decision: `Prefix::DEFAULT = None`. The code and the `--param prefix=none|title|context` knob stay so it can
be re-measured on real data or a larger gold set; enabling it would be a one-line change plus a
`--rebuild-index` on the user's data.

## Decision for the user
* The sender-label rule changes the stored text of newly captured Slack-like windows. Existing snapshots keep
  the old text until `rewind capture --apply-cleaning` is run. A `cleaner::VERSION` bump (3 -> 4) would
  make `open_runtime` demand that run on first start; I did not bump it because that forces a migration on
  the user's own database. Bump it if you want existing data re-cleaned.
