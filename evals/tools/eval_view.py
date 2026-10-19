#!/usr/bin/env python3
"""Browse the test-mode eval archive (captures.jsonl). See evals/TEST_MODE.md.

  eval_view.py                 one line per recorded page
  eval_view.py 20              the cleaned text of snapshot 20 (what was chunked)
  eval_view.py 20 --chunks     the chunks that were embedded
  eval_view.py --dump OUT      write every chunk of every page to OUT (.txt readable, .jsonl one chunk per line)
  eval_view.py --dir PATH      another eval-memory directory
"""
import argparse, json, os

ap = argparse.ArgumentParser()
ap.add_argument("id", nargs="?", type=int)
ap.add_argument("--chunks", action="store_true")
ap.add_argument("--dump", metavar="OUT")
ap.add_argument("--dir", default=os.environ.get("REWIND_EVAL_DIR") or os.path.expanduser("~/Library/Application Support/Rewind/eval-memory"))
a = ap.parse_args()
rows = [json.loads(l) for l in open(os.path.join(a.dir, "captures.jsonl"))]
if a.dump:
    jsonl = a.dump.endswith(".jsonl")
    n = 0
    with open(a.dump, "w") as out:
        for r in rows:
            for i, c in enumerate(r["chunks"], 1):
                n += 1
                if jsonl:
                    out.write(json.dumps({"snapshot_id": r["snapshot_id"], "chunk": i, "app_id": r["app_id"], "title": r["title"], "url": r["url"], "text": c}) + "\n")
                else:
                    out.write(f"===== snapshot {r['snapshot_id']} chunk {i}/{len(r['chunks'])} | {r['app_id']} | {r['title'][:80]} =====\n{c}\n\n")
    print(f"wrote {n} chunks from {len(rows)} pages to {a.dump}")
elif a.id is None:
    for r in rows:
        print(f"{r['snapshot_id']:>4}  {r['captured_at'][11:19]}  {len(r['cleaned_body']):>6} chars  {len(r['chunks'])} chunks  {r['title'][:60]}")
else:
    r = next(r for r in rows if r["snapshot_id"] == a.id)
    print(f"# {r['title']}\n# {r['app_id']}  {r['url']}\n")
    if a.chunks:
        for i, c in enumerate(r["chunks"], 1):
            print(f"--- chunk {i} ({len(c)} chars) ---\n{c}\n")
    else:
        print(r["cleaned_body"])
