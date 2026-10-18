# Capturing the corpus pages on your Mac

The 36 pages in `evals/pages/` are invented. 24 of them already have real captures; the 12 added with the
larger gold set (`chatgpt-macros-table-01`, `email-quote-roofing-v1/v2`, `email-gym-membership-01`,
`article-marathon-training-01`, `article-climbing-slack-01`, `article-chrome-plating-01`,
`article-safari-kenya-01`, `article-airport-terminal-01`, `article-speaker-notes-01`,
`article-error-messages-01`, `article-kitchen-reno-01`) still hold **hand-authored** AX trees
(`"provenance": "hand_authored"`) built from the same page definitions. `article-hindi-dal-01` should also be
re-captured: its page is now compact because the first capture lost the paragraphs below the fold.
This procedure replaces them with **real Accessibility captures** of the same pages
(`"provenance": "real_capture_invented_content"`). It needs Accessibility permission and a few
minutes. Nothing here uses your normal state directory.

## 1. Build and prepare

```bash
cargo build -p rewind
```

Open a **new Safari window with a single tab** and hide the Favorites bar (View → Hide Favorites
Bar). Close other windows you do not want on screen: capture reads whatever app is in front.
The export script redacts browser-chrome text, but a clean window is the real safeguard.

## 2. Start capture into a throwaway state directory

Terminal tab 1:

```bash
export REWIND_STATE_DIR="$(mktemp -d)"
export REWIND_MODEL_DIR="$(ls -d ~/.cache/huggingface/hub/models--minishlab--potion-base-32M/snapshots/* | head -1)"  # optional; skips a 130 MB download
echo "$REWIND_STATE_DIR"        # keep this path for step 4
target/debug/rewind capture --print
```

The first run asks for Accessibility access for the helper at
`$REWIND_STATE_DIR/rewind-ax-helper`. Grant it in System Settings → Privacy & Security →
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

When every page has printed `new #N` (36 pages, 35 `new` plus 1 `navigation_only`), press Ctrl-C in tab 1.

Only text that is **on screen** is captured. Keep the Safari window large (full screen is best) and do not
resize it mid-run; long pages use a compact layout so they fit. The export step in 5 fails loudly if a gold
answer is missing, which is how a clipped page shows up.

## 4. Export fixtures

```bash
python3 evals/export_fixtures.py "$REWIND_STATE_DIR" --list    # which pages were captured
python3 evals/export_fixtures.py "$REWIND_STATE_DIR"           # writes evals/corpus/<stem>.json
git diff --stat evals/corpus                                        # review before committing
```

The script matches snapshots to pages by the file name in the URL, rewrites
`app_id/title/url/source_type/observed_ms` from `evals/pages/<stem>.facts.json` (so a Safari page can
stand in for Terminal.app, `chatgpt.com`, and so on), keeps the raw AX nodes, and redacts any
browser-chrome text it does not recognise as a generic label.

## 5. Check and clean up

```bash
cargo run -p rewind -- eval --out evals/reports/check.json
rm -rf "$REWIND_STATE_DIR"
```

`eval` fails loudly if a real capture changed the cleaned text so that a gold `answer_text` no longer
matches; fix the gold file or the page, not the matcher. Re-run the baseline afterwards
(`evals/README.md`); numbers from hand-authored and real trees are not comparable.

`python3 evals/tools/build_corpus.py` regenerates the HTML pages and the hand-authored fixtures
from `evals/tools/pages_spec.py`; it never overwrites a real capture unless `--overwrite-real` is given.
