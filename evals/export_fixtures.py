#!/usr/bin/env python3
"""Turn a capture database into evals/corpus/<page-stem>.json fixtures.

    python3 evals/export_fixtures.py "$OPEN_MEMORY_STATE_DIR"          # write fixtures
    python3 evals/export_fixtures.py "$OPEN_MEMORY_STATE_DIR" --list   # coverage only, write nothing

Reads <state>/memory.sqlite3 (read-only), matches every captured snapshot back to
evals/pages/<stem>.html by the last path segment of its URL, and writes one fixture per page
with provenance "real_capture_invented_content".

What is rewritten, and why
  * app_id / title / url / source_type / observed_ms come from evals/pages/<stem>.facts.json
    ("logical"). The pages are opened in Safari from file://, but fixtures must look like the
    app they imitate (chatgpt.com in Chrome, Terminal.app, ...) and the gold set needs the fixed
    observation times. The raw AX node tree is kept exactly as captured.
  * Nodes outside the page's AXWebArea are browser chrome (toolbar, tab strip, favourites).
    Their text could contain your real tab titles or bookmarks, so anything not on a short
    allowlist of generic labels is replaced with "[redacted]" (the address field is replaced
    by the logical URL). Review the printed summary before committing.
Nothing here starts capture, asks for Accessibility permission, or touches the default state dir.
"""
import argparse
import datetime
import json
import os
import sqlite3
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME_ALLOW = {
    "back", "forward", "reload", "share", "sidebar", "show sidebar", "hide sidebar", "tab overview",
    "new tab", "address and search bar", "search", "close tab", "close", "page menu", "downloads",
    "show tab overview", "tab strip", "reader", "translate", "extensions", "customize chrome",
    "address and search bar", "tabs", "toolbar", "navigation", "tab group", "start page",
}


def walk(obj, fn):
    if isinstance(obj, dict):
        return {k: walk(v, fn) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(v, fn) for v in obj]
    if isinstance(obj, str):
        return fn(obj)
    return obj


def in_web_area(node):
    return any(a.get("role") == "AXWebArea" for a in node.get("ancestor_path", [])) or node.get("role") == "AXWebArea"


def sanitize(nodes, captured_title, logical):
    """Return (nodes, report) with browser chrome text redacted and identity fields rewritten."""
    redacted, kept_chrome = 0, []
    out = []
    for node in nodes:
        if not in_web_area(node):
            text = (node.get("value") or node.get("name") or "").strip()
            low = text.lower()
            if node.get("role") == "AXTextField" and ("address" in (node.get("name") or "").lower() or "://" in text):
                node = dict(node)
                node["value"] = logical.get("url") or ""
            elif low in CHROME_ALLOW or low == (captured_title or "").lower():
                kept_chrome.append(text)
            else:
                node = dict(node)
                for field in ("value", "name"):
                    if node.get(field):
                        node[field] = "[redacted]"
                redacted += 1
        out.append(node)

    def rewrite(s):
        if captured_title and logical.get("title"):
            s = s.replace(captured_title, logical["title"])
        return s

    return walk(out, rewrite), {"redacted_chrome_nodes": redacted, "kept_chrome_labels": sorted(set(kept_chrome))}


def ms(iso):
    dt = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    return int(dt.timestamp() * 1000)


def stem_of(url):
    if not url:
        return None
    last = os.path.basename(urllib.parse.urlparse(url).path)
    return urllib.parse.unquote(last[:-5] if last.endswith(".html") else last) or None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("state_dir", help="the temporary OPEN_MEMORY_STATE_DIR used for capture")
    ap.add_argument("--pages", default=os.path.join(HERE, "pages"))
    ap.add_argument("--out", default=os.path.join(HERE, "corpus"))
    ap.add_argument("--list", action="store_true", help="report which pages were captured; write nothing")
    args = ap.parse_args()

    default_state = os.path.expanduser("~/Library/Application Support/Open Memory/local-memory")
    if os.path.realpath(args.state_dir) == os.path.realpath(default_state):
        sys.exit("refusing to read the default state directory; capture into a temp dir")
    db_path = os.path.join(args.state_dir, "memory.sqlite3")
    if not os.path.isfile(db_path):
        sys.exit("no memory.sqlite3 in %s" % args.state_dir)
    db = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)

    facts = {}
    for name in os.listdir(args.pages):
        if name.endswith(".facts.json"):
            with open(os.path.join(args.pages, name), encoding="utf-8") as f:
                data = json.load(f)
            facts[data["stem"]] = data

    best = {}  # stem -> (node_count, snapshot row, nodes)
    unmatched = 0
    for sid, app_id, title, url, source_type, limitations, focus_role, focus_name, first_seen in db.execute(
            "SELECT id,app_id,title,url,source_type,limitations,focus_role,focus_name,first_seen_ms FROM snapshots ORDER BY id"):
        stem = stem_of(url)
        if stem not in facts:
            unmatched += 1
            continue
        versions = [r[0] for r in db.execute("SELECT ax_nodes_json FROM raw_versions WHERE snapshot_id=? ORDER BY observed_ms", (sid,))]
        versions.append(db.execute("SELECT ax_nodes_json FROM snapshots WHERE id=?", (sid,)).fetchone()[0])
        for raw in versions:
            nodes = json.loads(raw)
            if stem not in best or len(nodes) > best[stem][0]:
                best[stem] = (len(nodes), dict(sid=sid, app_id=app_id, title=title, url=url, source_type=source_type,
                                               limitations=limitations, focus_role=focus_role, focus_name=focus_name), nodes)

    missing = sorted(set(facts) - set(best))
    print("captured %d of %d pages (%d snapshots in the database did not match a page)" % (len(best), len(facts), unmatched))
    for stem in missing:
        print("  missing:", stem)
    if args.list:
        return
    os.makedirs(args.out, exist_ok=True)
    for stem, (count, row, nodes) in sorted(best.items()):
        logical = facts[stem]["logical"]
        clean_nodes, report = sanitize(nodes, row["title"], logical)
        fixture = {
            "provenance": "real_capture_invented_content",
            "app_id": logical["app_id"],
            "title": logical["title"],
            "url": logical["url"],
            "source_type": logical["source_type"],
            "observed_ms": ms(facts[stem]["observed_at"]),
            "also_observed_ms": [ms(t) for t in facts[stem].get("also_observed_at", [])],
            "focus_role": "",
            "focus_name": "",
            "limitations": json.loads(row["limitations"] or "[]"),
            "notes": ("Real Accessibility capture of evals/pages/%s.html in %s (%d nodes). app_id, title, url, "
                      "source_type and observed_ms were rewritten from the page's facts.json to simulate %s; "
                      "browser-chrome text outside the AXWebArea was redacted (%d nodes)."
                      % (stem, row["app_id"], count, logical["app_id"], report["redacted_chrome_nodes"])),
            "captured_with": {"app_id": row["app_id"], "source_type": row["source_type"], "limitations": json.loads(row["limitations"] or "[]")},
            "roots": clean_nodes,
        }
        path = os.path.join(args.out, stem + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(fixture, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("wrote %s  (%d nodes; %d chrome nodes redacted; kept chrome labels: %s)"
              % (os.path.relpath(path), count, report["redacted_chrome_nodes"], ", ".join(report["kept_chrome_labels"]) or "-"))
    print("\nReview the diff of evals/corpus before committing: git diff --stat evals/corpus")


if __name__ == "__main__":
    main()
