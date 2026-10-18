#!/usr/bin/env python3
"""Build the real-snapshot haystack for `eval --extra-corpus`: symlinks every exported real fixture
except those whose cleaned body contains an invented gold answer_text (they would contain the answer
to a gold question and so are not distractors). Bodies come from
`rewind ingest-fixtures --dump-bodies` (the current cleaner). Prints/records what was excluded.

  python3 evals/scale/make_real_haystack.py [--gold evals/gold/gold.jsonl] [--out evals/private/haystack]
"""
import argparse, json, os

norm = lambda s: " ".join(s.lower().split())
ap = argparse.ArgumentParser()
ap.add_argument("--gold", default="evals/gold/gold.jsonl")
ap.add_argument("--bodies", default="evals/private/bodies")
ap.add_argument("--corpus", default="evals/private/corpus")
ap.add_argument("--out", default="evals/private/haystack")
a = ap.parse_args()
answers = {}
for l in open(a.gold):
    if l.strip():
        g = json.loads(l)
        for r in g["relevant"]:
            answers[norm(r["answer_text"])] = g["id"]
os.makedirs(a.out, exist_ok=True)
for f in os.listdir(a.out):
    os.remove(os.path.join(a.out, f))
excluded, kept = {}, 0
for f in sorted(os.listdir(a.corpus)):
    if not f.endswith(".json"):
        continue
    stem = f[:-5]
    bp = os.path.join(a.bodies, stem + ".txt")
    body = norm(open(bp).read()) if os.path.exists(bp) else ""
    hit = sorted({qid for ans, qid in answers.items() if ans in body})
    if hit:
        excluded[stem] = hit
        continue
    os.symlink(os.path.abspath(os.path.join(a.corpus, f)), os.path.join(a.out, f))
    kept += 1
rep = {"kept": kept, "excluded": len(excluded), "excluded_fixtures": excluded}
json.dump(rep, open(os.path.join(os.path.dirname(a.out.rstrip("/")), "haystack_exclusions.json"), "w"), indent=1)
print(f"kept {kept}, excluded {len(excluded)} real snapshots that contain an invented gold answer")
for k, v in list(excluded.items())[:40]:
    print(" ", k, v)
