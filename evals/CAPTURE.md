# Capturing the corpus pages on your Mac

The 24 pages in `evals/pages/` are invented. Until you capture them, `evals/corpus/*.json` holds
**hand-authored** AX trees (`"provenance": "hand_authored"`) built from the same page definitions.
This procedure replaces them with **real Accessibility captures** of the same pages
(`"provenance": "real_capture_invented_content"`). It needs Accessibility permission and a few
minutes. Nothing here uses your normal state directory.

## 1. Build and prepare

```bash
cargo build -p open-memory
```

Open a **new Safari window with a single tab** and hide the Favorites bar (View → Hide Favorites
Bar). Close other windows you do not want on screen: capture reads whatever app is in front.
The export script redacts browser-chrome text, but a clean window is the real safeguard.

## 2. Start capture into a throwaway state directory

Terminal tab 1:

```bash
export OPEN_MEMORY_STATE_DIR="$(mktemp -d)"
export OPEN_MEMORY_MODEL_DIR="$(ls -d ~/.cache/huggingface/hub/models--minishlab--potion-base-32M/snapshots/* | head -1)"  # optional; skips a 130 MB download
echo "$OPEN_MEMORY_STATE_DIR"        # keep this path for step 4
target/debug/open-memory capture --print
```

The first run asks for Accessibility access for the helper at
`$OPEN_MEMORY_STATE_DIR/open-memory-ax-helper`. Grant it in System Settings → Privacy & Security →
Accessibility and leave the command running. Wait for `Model2Vec and Qdrant Edge ready`.

## 3. Show each page once

Terminal tab 2 (opens each page in Safari for 9 s; do not touch other windows meanwhile):

```bash
evals/tools/open_pages.sh
```

Manual alternative per page: `open -a Safari evals/pages/<stem>.html`, then wait for tab 1 to print
`new #N ... <page title>` before moving to the next one. A line starting `seen #N` means the same
text was already stored. `navigation_only` is expected for `nav-only-newtab-01` (it imitates a new
tab page and must not become searchable).

When every page has printed `new #N` (24 pages, 23 `new` plus 1 `navigation_only`), press Ctrl-C in tab 1.

## 4. Export fixtures

```bash
python3 evals/export_fixtures.py "$OPEN_MEMORY_STATE_DIR" --list    # which pages were captured
python3 evals/export_fixtures.py "$OPEN_MEMORY_STATE_DIR"           # writes evals/corpus/<stem>.json
git diff --stat evals/corpus                                        # review before committing
```

The script matches snapshots to pages by the file name in the URL, rewrites
`app_id/title/url/source_type/observed_ms` from `evals/pages/<stem>.facts.json` (so a Safari page can
stand in for Terminal.app, `chatgpt.com`, and so on), keeps the raw AX nodes, and redacts any
browser-chrome text it does not recognise as a generic label.

## 5. Check and clean up

```bash
cargo run -p open-memory -- eval --out evals/reports/check.json
rm -rf "$OPEN_MEMORY_STATE_DIR"
```

`eval` fails loudly if a real capture changed the cleaned text so that a gold `answer_text` no longer
matches; fix the gold file or the page, not the matcher. Re-run the baseline afterwards
(`evals/README.md`); numbers from hand-authored and real trees are not comparable.

`python3 evals/tools/build_corpus.py` regenerates the HTML pages and the hand-authored fixtures
from `evals/tools/pages_spec.py`; it never overwrites a real capture unless `--overwrite-real` is given.
