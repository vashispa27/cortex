#!/usr/bin/env python3
"""Show the tracked eval history (evals/history/runs.csv): one table per corpus, newest last, with the change to the
previous row. Rows measured on a different frozen dataset are marked (their numbers are not comparable).

  python3 evals/history.py [invented|real|bench] [--last N]
"""
import csv, os, sys

CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history", "runs.csv")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
last = int(sys.argv[sys.argv.index("--last") + 1]) if "--last" in sys.argv else 12
if "--last" in sys.argv:
    args = [a for a in args if a != str(last)]
rows = list(csv.DictReader(open(CSV))) if os.path.exists(CSV) else []
for corpus in args or ["invented", "real", "bench"]:
    rs = [r for r in rows if r["corpus"] == corpus]
    if not rs:
        continue
    print(f"\n== {corpus} ({len(rs)} runs, showing last {min(last, len(rs))})")
    print(f"{'date':<17} {'commit':<9} {'hit@1':>7} {'hit@8':>7} {'MRR':>6} {'lost':>5} {'abst':>6} {'dup%':>5} {'p50 ms':>8} {'p95 ms':>8} {'p99 ms':>8}  note")
    prev = None
    for r in rs[-last:]:
        def d(k, fmt="{:+d}", cast=int):
            if prev is None or r["dataset_id"] != prev["dataset_id"]:
                return ""
            try:
                return " (" + fmt.format(cast(r[k]) - cast(prev[k])) + ")"
            except ValueError:
                return ""
        flag = "" if prev is None or r["dataset_id"] == prev["dataset_id"] else "  [different dataset]"
        dirty = "+" if r["dirty"] == "1" else " "
        print(f"{r['date']:<17} {r['commit']:<8}{dirty} {r['hit1']+'/'+r['answerable']:>7} {r['hit8']+'/'+r['answerable']:>7} {float(r['mrr']):>6.3f} "
              f"{r['lost_at_final']:>5} {r['absent_abstained']+'/'+r['absent']:>6} {float(r['near_dup_share'])*100:>4.0f}% {r['lat_p50_ms']:>8} {r['lat_p95_ms']:>8} {r['lat_p99_ms']:>8}  {r['note']}{flag}")
        prev = r
