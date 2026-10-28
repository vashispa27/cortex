#!/usr/bin/env python3
"""Compare retrieval runs written by run_gold.py (--out): hit@1/3/8 and MRR overall and by family.

  python3 evals/tools/compare_retrieval.py base.json new.json [more.json ...]
  python3 evals/tools/compare_retrieval.py base.json new.json --gold evals/private/gold-v1.jsonl --diff
      (--diff lists questions whose rank got worse or better, with the query: real text, keep it private)

Only questions with support are scored. Rank is the position of the first result that is, or lists as an other
captured version, a supporting snapshot.
"""
import argparse, json, os
from collections import defaultdict

FAMILIES = ["attribution", "chat_lookup", "scheduling", "contact_details", "aggregation", "cross_chunk"]


def load(path):
    return {r["id"]: r for r in json.load(open(path)) if r["has_support"]}


def metrics(rows):
    n = len(rows)
    if not n:
        return "n=0"
    f = lambda k: sum(1 for r in rows if r["rank"] and r["rank"] <= k) / n
    mrr = sum(1 / r["rank"] for r in rows if r["rank"]) / n
    return f"{f(1):.2f} / {f(3):.2f} / {f(8):.2f} / {mrr:.2f}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="+")
    ap.add_argument("--gold")
    ap.add_argument("--diff", action="store_true")
    a = ap.parse_args()
    runs = [(os.path.basename(p), load(p)) for p in a.runs]
    ids = set.intersection(*[set(r) for _, r in runs])
    print(f"questions with support in every run: {len(ids)}\n")
    print("| set | n | " + " | ".join(name for name, _ in runs) + " |")
    print("|---|---|" + "---|" * len(runs))
    print("(cells are hit@1 / hit@3 / hit@8 / MRR)\n")
    groups = [("overall", sorted(ids))] + [(fam, sorted(i for i in ids if runs[0][1][i]["family"] == fam)) for fam in FAMILIES]
    for name, members in groups:
        print(f"| {name} | {len(members)} | " + " | ".join(metrics([r[i] for i in members]) for _, r in runs) + " |")
    if a.diff and len(runs) >= 2:
        gold = {}
        if a.gold:
            gold = {json.loads(l)["id"]: json.loads(l) for l in open(a.gold)}
        base, new = runs[0][1], runs[1][1]
        key = lambda r: r["rank"] or 99
        worse = [i for i in ids if key(new[i]) > key(base[i])]
        better = [i for i in ids if key(new[i]) < key(base[i])]
        for title, group in (("worse", worse), ("better", better)):
            print(f"\n{title}: {len(group)}")
            for i in sorted(group):
                q = gold.get(i, {}).get("query", "")[:80]
                print(f"  {i} {base[i]['family']:<16} {base[i]['rank']} -> {new[i]['rank']}  {q}")


if __name__ == "__main__":
    main()
