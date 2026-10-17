#!/usr/bin/env python3
"""Key numbers of one eval report, with the change against a previous report if given.
  run_summary.py NEW.json [PREVIOUS.json]"""
import json, sys


def load(p):
    r = json.load(open(p))
    o = r["overall"]; f = o["final_level"]; a = o["abstention"]
    ab = a.get("absent_queries_abstained")
    return {
        "questions": f"{o['n_queries']} ({o['n_answerable']} answerable, {o['n_absent']} absent)",
        "final hit@1": f["hit@1"]["count"], "final hit@8": f["hit@k"]["count"], "of": f["hit@1"]["of"],
        "final MRR": f["mrr"], "chunk hit@40": o["chunk_level"]["hit"]["@40"]["count"],
        "answer in chunk list, lost at final": f["chunk_hit_but_final_miss"]["count"],
        "absent abstained": ab["count"] if ab else 0, "absent total": o["n_absent"],
        "answerable wrongly abstained": a.get("answerable_wrongly_abstained", {}).get("count", 0),
        "near-duplicate final slots": o["near_duplicate_crowding"]["jaccard_0.8"]["slots_near_duplicate"]["rate"],
        "latency p50 ms": r["timing"]["query_latency_ms"]["p50"],
        "commit": r["meta"].get("git_commit"),
    }, r


new, nr = load(sys.argv[1])
old = load(sys.argv[2])[0] if len(sys.argv) > 2 else None
n = new["of"]
print(f"   {new['questions']}; commit {new['commit']}")
for k in ["final hit@1", "final hit@8", "chunk hit@40", "answer in chunk list, lost at final", "absent abstained", "answerable wrongly abstained"]:
    d = f"   ({new[k]-old[k]:+d} vs previous)" if old else ""
    tot = n if "absent" not in k else new["absent total"]
    print(f"   {k:<38} {new[k]}/{tot}{d}")
for k in ["final MRR", "near-duplicate final slots", "latency p50 ms"]:
    d = f"   ({new[k]-old[k]:+.3f} vs previous)" if old else ""
    print(f"   {k:<38} {new[k]}{d}")
print("   by type (final hit@8):", ", ".join(f"{t} {v['final_level']['hit@k']['count']}/{v['final_level']['hit@k']['of']}" for t, v in nr["by_type"].items() if v["n_answerable"]))
