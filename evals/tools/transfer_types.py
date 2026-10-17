#!/usr/bin/env python3
"""Per-type table across two code versions and two corpora (aggregate only).
  transfer_types.py INV_A.json REAL_A.json INV_B.json REAL_B.json [LABEL_A LABEL_B]"""
import json, sys

ia, ra, ib, rb = [json.load(open(p)) for p in sys.argv[1:5]]
la, lb = (sys.argv[5], sys.argv[6]) if len(sys.argv) > 6 else ("A", "B")


def cell(rep, t, key):
    v = rep["by_type"].get(t)
    if not v:
        return None
    if v["n_answerable"] == 0:
        return None
    return v["final_level"][key]["count"], v["final_level"][key]["of"]


def absent(rep, t):
    v = rep["by_type"].get(t)
    r = v["abstention"].get("absent_queries_returning_results") if v else None
    return (r["count"], r["of"]) if r else None


def fmt(a, b):
    if a is None or b is None:
        return "–"
    return f"{a[0]}→{b[0]} of {b[1]}"


print(f"| type | invented hit@8 {la}→{lb} | invented hit@1 | real hit@8 {la}→{lb} | real hit@1 |")
print("|---|---|---|---|---|")
types = sorted(set(ia["by_type"]) | set(ra["by_type"]) | set(ib["by_type"]) | set(rb["by_type"]))
for t in types:
    if t == "absent":
        ai, ar = fmt(absent(ia, t), absent(ib, t)), fmt(absent(ra, t), absent(rb, t))
        print(f"| absent (still answered) | {ai} | – | {ar} | – |")
        continue
    print(f"| {t} | {fmt(cell(ia, t, 'hit@k'), cell(ib, t, 'hit@k'))} | {fmt(cell(ia, t, 'hit@1'), cell(ib, t, 'hit@1'))} | "
          f"{fmt(cell(ra, t, 'hit@k'), cell(rb, t, 'hit@k'))} | {fmt(cell(ra, t, 'hit@1'), cell(rb, t, 'hit@1'))} |")
