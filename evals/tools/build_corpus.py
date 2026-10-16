#!/usr/bin/env python3
"""Regenerate evals/pages/*.html, evals/pages/*.facts.json and the hand-authored
evals/corpus/*.json fixtures from pages_spec.py.

    python3 evals/tools/build_corpus.py [--keep-real]

Fixtures whose provenance is real_capture_invented_content are never overwritten
unless --overwrite-real is passed.
"""
import datetime
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from corpus_lib import to_ax, write_json  # noqa: E402
from templates import render_page_html  # noqa: E402
import pages_spec  # noqa: E402

EVALS = os.path.dirname(HERE)
PAGES = os.path.join(EVALS, "pages")
CORPUS = os.path.join(EVALS, "corpus")

NOTE = ("AX tree synthesized by evals/tools/corpus_lib.py from the page structure, following the "
        "emission rules in crates/platform-mac/native/Capture.swift (collectText). Role choices for "
        "<article>, <nav>, aria-labels and for non-browser apps (Terminal, Notes, Mail, Slack, "
        "Messages) are assumptions about what the real app exposes; replace with a real capture "
        "(see evals/CAPTURE.md).")


def observed_ms(iso):
    dt = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    return int(dt.timestamp() * 1000)


def main():
    overwrite_real = "--overwrite-real" in sys.argv
    os.makedirs(PAGES, exist_ok=True)
    os.makedirs(CORPUS, exist_ok=True)
    stems = set()
    for spec in pages_spec.SPECS:
        page = spec["page"]
        assert page.stem not in stems, page.stem
        stems.add(page.stem)
        nodes = to_ax(page.tree)
        flat_values = "\n".join(n["value"] for n in nodes)
        page_html = render_page_html(page)
        unescaped = html.unescape(page_html)
        for fact in spec["facts"]:
            assert fact in flat_values, "%s: fact not in AX values: %r" % (page.stem, fact)
            assert fact in unescaped, "%s: fact not in HTML: %r" % (page.stem, fact)
        with open(os.path.join(PAGES, page.stem + ".html"), "w", encoding="utf-8") as f:
            f.write(page_html)
        facts = {
            "stem": page.stem,
            "html": page.stem + ".html",
            "observed_at": spec["observed"],
            "logical": {"app_id": page.app_id, "title": page.title, "url": page.url,
                        "source_type": page.source_type},
            "expect_searchable": spec["searchable"],
            "tags": spec["tags"],
            "facts": [{"id": "f%d" % (i + 1), "text": t} for i, t in enumerate(spec["facts"])],
            "noise_strings": spec["noise"],
        }
        write_json(os.path.join(PAGES, page.stem + ".facts.json"), facts)
        fixture_path = os.path.join(CORPUS, page.stem + ".json")
        if os.path.exists(fixture_path) and not overwrite_real:
            with open(fixture_path, encoding="utf-8") as f:
                if json.load(f).get("provenance") == "real_capture_invented_content":
                    print("keep real capture:", page.stem)
                    continue
        fixture = {
            "provenance": "hand_authored",
            "app_id": page.app_id,
            "title": page.title,
            "url": page.url,
            "source_type": page.source_type,
            "observed_ms": observed_ms(spec["observed"]),
            "focus_role": "",
            "focus_name": "",
            "limitations": [],
            "notes": NOTE + (" " + page.notes if page.notes else ""),
            "roots": nodes,
        }
        write_json(fixture_path, fixture)
    print("pages:", len(pages_spec.SPECS))


if __name__ == "__main__":
    main()
