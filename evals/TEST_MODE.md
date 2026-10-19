# Test mode: a hand-built eval archive

Test mode keeps everything evals use in a **separate archive** from your real memory, so you know
exactly which pages are in it.

```
~/Library/Application Support/Rewind/
  local-memory/   real memory (SQLite + Qdrant). Never read or written in test mode.
  eval-memory/    eval archive: memory.sqlite3, qdrant-edge/, captures.jsonl, queries.jsonl
```

Override the location with `REWIND_EVAL_DIR`.

## Use

1. Settings → Capture & privacy → **Test mode** on.
2. A play button appears in the collapsed notch (right side, next to chats). Click it to start
   recording the frontmost window into the eval archive; click again to pause. It always starts paused
   when the engine restarts, and it needs Accessibility permission for Rewind Capture.
3. While test mode is on, every question (notch, Ask page, Memory search, the `search_memory` tool) is
   answered from the eval archive. The notch footer says "Test mode · eval archive".
4. Settings → Test mode → **Reset eval archive** erases the eval archive and both logs. Your real
   memory is untouched. "Delete all local memory" is refused while test mode is on.

Real capture follows its own settings and keeps writing to real memory only. The play button never
touches it.

## What gets logged

* `captures.jsonl`: one line per **new** page recorded: time, app, title, URL, `cleaned_body` (the
  cleaner's output, the text that goes on to be chunked) and `chunks` (the exact chunks that are embedded).
  A re-sighting of an unchanged page adds no line.
* `queries.jsonl`: one line per question asked in test mode: the query, which route, whether retrieval
  abstained, and the snapshot ids / apps / titles / scores it returned. Use it to write gold questions.

Both files hold the page text you chose to record, so treat them like the archive itself.

## Using it for evals

The eval archive keeps the raw Accessibility trees like the real one does, so the existing exporter can
build fixtures from it:

```bash
python3 evals/tools/export_real.py --db "$HOME/Library/Application Support/Rewind/eval-memory/memory.sqlite3" --out evals/private/corpus
```
