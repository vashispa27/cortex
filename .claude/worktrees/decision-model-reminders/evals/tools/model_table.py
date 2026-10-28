#!/usr/bin/env python3
"""One row per judged run: memory-question accuracy, abstain, speed. Latest run per name prefix.
   python3 evals/tools/model_table.py [name-substring]    # default: ctx- and the Gemini reference run"""
import glob, json, os, re, statistics as st, sys
d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "private/answers")
sub = sys.argv[1] if len(sys.argv) > 1 else ""
runs = {}
for f in sorted(glob.glob(f"{d}/*.judged.jsonl"), key=os.path.getmtime):
    name = os.path.basename(f)[:-len(".judged.jsonl")]
    if (sub and sub not in name) or (not sub and not (name.startswith("ctx-") or name.startswith("context-haiku_gemini"))):
        continue
    runs[re.sub(r"_\d{4}-\d{4,6}$", "", name)] = name
rows = []
for key, name in runs.items():
    j = [json.loads(l) for l in open(f"{d}/{name}.judged.jsonl")]
    a = {x["id"]: x for x in map(json.loads, open(f"{d}/{name}.jsonl"))}
    pct = lambda sel, v: (100 * sum(1 for x in sel if x["judge"] and x["judge"]["verdict"] == v) / len(sel)) if sel else float("nan")
    mem = [x for x in j if x["behavior"] == "memory"]; ab = [x for x in j if x["behavior"] == "abstain"]
    t = sorted(sum(a[x["id"]]["timings_ms"].values()) / 1000 for x in j if a.get(x["id"], {}).get("timings_ms"))
    facts = [x for x in mem if x["det"]]
    rows.append((pct(mem, "correct"), key, len(j), sum(1 for x in mem if x["det"] and x["det"]["all_facts"]) / max(1, len(mem)) * 100, pct(ab, "correct"), t[len(t) // 2] if t else float("nan"), t[int(.95 * len(t))] if t else float("nan"), sum(1 for x in j if x["error"] or x["judge_error"])))
print(f"{'run':58s} {'n':>4s} {'mem correct':>11s} {'facts all':>9s} {'abstain ok':>10s} {'p50 s':>6s} {'p95 s':>6s} {'err':>3s}")
for r in sorted(rows, reverse=True):
    print(f"{r[1]:58s} {r[2]:4d} {r[0]:10.0f}% {r[3]:8.0f}% {r[4]:9.0f}% {r[5]:6.1f} {r[6]:6.1f} {r[7]:3d}")
