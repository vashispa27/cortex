#!/usr/bin/env python3
"""Compare two eval reports ignoring the `timing` block. Exit 1 when they differ."""
import json
import sys


def load(path):
    with open(path, encoding="utf-8") as f:
        report = json.load(f)
    report.pop("timing", None)
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
    problems = list(diff(load(sys.argv[1]), load(sys.argv[2])))
    if problems:
        print("\n".join(problems[:40]))
        sys.exit(1)
    print("reports identical apart from timing")
