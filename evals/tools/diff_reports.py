#!/usr/bin/env python3
"""Compare two eval reports ignoring the `timing` block. Exit 1 when they differ."""
import argparse
import json
import sys


def load(path, ignore_index_files=False):
    with open(path, encoding="utf-8") as f:
        report = json.load(f)
    report.pop("timing", None)
    if ignore_index_files and isinstance(report.get("index_size"), dict):
        # UUID file paths, WAL checkpointing and filesystem allocation vary on identical inputs.
        # Retain logical SQLite rows/payload sizes and every retrieval/parameter/metric field.
        report["index_size"].pop("state_dir_entries", None)
        report["index_size"].pop("vector_shard", None)
    return report


def diff(a, b, path=""):
    if type(a) != type(b):
        yield "%s: type %s vs %s" % (path, type(a).__name__, type(b).__name__)
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                yield "%s/%s: only in one report" % (path, k)
            else:
                for d in diff(a[k], b[k], "%s/%s" % (path, k)):
                    yield d
    elif isinstance(a, list):
        if len(a) != len(b):
            yield "%s: length %d vs %d" % (path, len(a), len(b))
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                for d in diff(x, y, "%s[%d]" % (path, i)):
                    yield d
    elif a != b:
        yield "%s: %r vs %r" % (path, a, b)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before")
    parser.add_argument("after")
    parser.add_argument("--ignore-index-files", action="store_true",
                        help="also ignore physical index file paths/sizes/allocation; keep logical SQLite and all retrieval fields")
    args = parser.parse_args()
    problems = list(diff(load(args.before, args.ignore_index_files), load(args.after, args.ignore_index_files)))
    if problems:
        print("\n".join(problems[:40]))
        sys.exit(1)
    print("reports identical apart from timing" + (" and physical index files" if args.ignore_index_files else ""))
