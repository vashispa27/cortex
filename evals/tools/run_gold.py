#!/usr/bin/env python3
"""Retrieval eval over evals/private/gold.jsonl using `cortex ask` (no LLM needed).

Runs against a throwaway COPY of the eval archive, never local-memory. For every question with
support (memory/mixed/clarify) it checks at what rank a supporting snapshot appears; near-duplicate
captures listed under "Other captured versions" count as the same hit. For abstain/general it records
whether retrieval abstained. Follow-ups are skipped (they need conversation state).

  python3 evals/tools/run_gold.py                 # all questions
  python3 evals/tools/run_gold.py --split dev     # dev only (tune here), later --split test
  python3 evals/tools/run_gold.py --out evals/private/retrieval_run.json
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap = argparse.ArgumentParser()
ap.add_argument("--gold", default=os.path.join(ROOT, "evals/private/gold.jsonl"))
ap.add_argument("--archive", default=os.path.expanduser("~/Library/Application Support/Cortex/eval-memory-segments"))
ap.add_argument("--bin", default=os.path.join(ROOT, "target/release/cortex"))
ap.add_argument("--split", choices=["dev", "test"])
ap.add_argument("--out", default=os.path.join(ROOT, "evals/private/retrieval_run.json"))
ap.add_argument("--jobs", type=int, default=1)
a = ap.parse_args()
if not os.path.exists(a.bin):
    sys.exit(f"{a.bin} missing: run `cargo build --release -p cortex`")

os.makedirs(os.path.join(ROOT, "evals/private"), exist_ok=True)
work = tempfile.mkdtemp(prefix="cortex-evalcopy-", dir=os.path.join(ROOT, "evals/private"))
state = os.path.join(work, "state")
shutil.copytree(a.archive, state)

ITEM = re.compile(r"^\d+\. \[(\d+)\]")
OTHER = re.compile(r"Other captured versions of this page: ((?:\[\d+\]\s*)+)")

def ask(q):
    env = dict(os.environ, CORTEX_STATE_DIR=state)
    env.pop("CORTEX_LLM_URL", None)  # retrieval only
    try:
        result = subprocess.run([a.bin, "ask", q], env=env, capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError(f"retrieval process failed (exit {result.returncode}); refusing to score an invalid run")
        out = result.stdout
    except subprocess.TimeoutExpired:
        raise RuntimeError("retrieval timed out; refusing to score an invalid run") from None
    ranked, cur = [], None
    for line in out.splitlines():
        m = ITEM.match(line)
        if m:
            cur = {int(m.group(1))}; ranked.append(cur)
            continue
        o = OTHER.search(line)
        if o and cur is not None:
            cur.update(int(x) for x in re.findall(r"\d+", o.group(1)))
    abstained = out.startswith("No matching") or not ranked
    return ranked, abstained

rows = [json.loads(l) for l in open(a.gold)]
rows = [r for r in rows if (not a.split or r["split"] == a.split)]
todo = [r for r in rows if r["family"] != "followup"]

def run(r):
    ranked, abst = ask(r["query"])
    sup = {s["snapshot_id"] for s in r["support"]}
    rank = next((i + 1 for i, g in enumerate(ranked) if g & sup), None)
    return {"id": r["id"], "family": r["family"], "behavior": r["expected_behavior"], "split": r["split"],
            "variant": bool(r.get("variant_of")), "has_support": bool(sup), "rank": rank,
            "abstained": abst, "returned": [sorted(g)[0] for g in ranked]}

try:
    res = []
    with ThreadPoolExecutor(a.jobs) as ex:
        for index, result in enumerate(ex.map(run, todo), 1):
            res.append(result)
            if index % 25 == 0:
                print(f"Retrieval: {index}/{len(todo)} questions", file=sys.stderr, flush=True)
finally:
    shutil.rmtree(work, ignore_errors=True)
json.dump(res, open(a.out, "w"), indent=1)

def summarize(items):
    n = len(items)
    f = lambda k: sum(1 for x in items if x["rank"] and x["rank"] <= k) / n
    mrr = sum(1 / x["rank"] for x in items if x["rank"]) / n
    fa = sum(x["abstained"] for x in items) / n
    return f"n={n:3d}  hit@1={f(1):.2f}  hit@3={f(3):.2f}  hit@8={f(8):.2f}  MRR={mrr:.2f}  retrieval_abstained={fa:.2f}"

sup = [x for x in res if x["has_support"]]
print(f"== questions with support ({len(sup)}) ==")
print("all       ", summarize(sup))
for name, sel in (("clean", [x for x in sup if not x["variant"]]), ("noisy", [x for x in sup if x["variant"]])):
    if sel: print(f"{name:10s}", summarize(sel))
for key in ("family", "split"):
    print(f"-- by {key}")
    g = defaultdict(list)
    for x in sup: g[x[key]].append(x)
    for k, v in sorted(g.items()): print(f"{k:18s}", summarize(v))
no = [x for x in res if not x["has_support"]]
print(f"== no-support questions ({len(no)}): retrieval abstained on {sum(x['abstained'] for x in no)} ==")
miss = [x["id"] for x in sup if not x["rank"]]
print(f"misses (no support in results): {len(miss)} -> {' '.join(miss[:40])}")
print(f"per-question results: {a.out}  (followups skipped: {len(rows) - len(todo)})")
