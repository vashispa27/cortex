#!/usr/bin/env python3
"""Expected vs Cortex answer, per question, with the judge's verdict.
   python3 evals/tools/side_by_side.py [RUN]   # default: latest run in evals/private/answers/
Writes evals/private/answers/<run>.compare.md and prints it."""
import glob, json, os, sys
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
d = os.path.join(root, "evals/private/answers")
run = sys.argv[1] if len(sys.argv) > 1 else os.path.basename(max(glob.glob(f"{d}/*.judged.jsonl"), key=os.path.getmtime))[:-len(".judged.jsonl")]
gold = {q["id"]: q for f in sorted(glob.glob(f"{root}/evals/private/gold*.jsonl")) for q in map(json.loads, open(f))}
ans = {a["id"]: a for a in map(json.loads, open(f"{d}/{run}.jsonl"))}
jud = {j["id"]: j for j in map(json.loads, open(f"{d}/{run}.judged.jsonl"))}
out = [f"# {run}: expected vs Cortex\n"]
for i, a in ans.items():
    q, j = gold[i], jud.get(i, {})
    v = j.get("judge") or {}
    out += [f"## {i} [{q['family']} / expects {q['expected_behavior']}]  verdict: {v.get('verdict', 'n/a')} (conf {v.get('confidence', '-')})",
            f"**Q:** {q['query']}", "",
            f"**Expected:** {q['reference_answer']}", f"*facts: {', '.join(q['answer_facts']) or '-'}*", "",
            f"**Cortex ({a.get('source')}):** {a['answer'] if a['answer'] is not None else 'ERROR: ' + str(a['error'])}", "", "---", ""]
path = f"{d}/{run}.compare.md"
open(path, "w").write("\n".join(out))
print("\n".join(out)); print(f"saved: {path}")
