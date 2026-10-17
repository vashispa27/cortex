#!/usr/bin/env python3
"""Aggregate scale-run reports (run_scale.sh output directory) into markdown tables. Counts and rates only.

  summarize.py DIR [--points inv-base,inv-1k,...]
"""
import argparse, glob, json, os, re

ORDER = ["inv-base", "inv-hard", "inv-real", "inv-1k", "inv-10k", "inv-10k-hard", "inv-real-10k-hard", "inv-100k",
         "real-base", "real-1k", "real-10k", "real-mut", "real-100k"]


def rss_mb(path):
    p = path[:-5] + ".time"
    if os.path.exists(p):
        m = re.search(r"(\d+)\s+maximum resident set size", open(p).read())
        if m:
            return round(int(m.group(1)) / 1e6)
    return None


def cnt(x):
    return f"{x['count']}/{x['of']}" if x and x.get("of") else "–"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--points")
    a = ap.parse_args()
    names = a.points.split(",") if a.points else [n for n in ORDER if os.path.exists(os.path.join(a.dir, n + ".json"))]
    reps = {n: json.load(open(os.path.join(a.dir, n + ".json"))) for n in names}
    for group in ("inv", "real"):
        ns = [n for n in names if n.startswith(group + "-")]
        if not ns:
            continue
        print(f"\n### {'Invented' if group == 'inv' else 'Real'} gold set\n")
        print("| point | snapshots | chunks | vector pts | final hit@1 | final hit@8 | MRR | chunk hit@40 | absent answered | wrongly abstained | extras in final slots | rank-1 is extra | p50 / p95 / p99 ms | ingest s | snap/s | index MB (apparent / allocated) | MB per 1k vector pts | peak RSS MB |")
        print("|" + "---|" * 18)
        for n in ns:
            r = reps[n]; o = r["overall"]; f = o["final_level"]; t = r["timing"]; q = t["query_latency_ms"]
            sc = r.get("scale") or {}
            d = o.get("distractors") or {}
            ab = o["abstention"]
            vp = sc.get("vector_points") or 0
            alloc = t.get("index_allocated_bytes") or t["index_size_bytes"]
            print(f"| {n} | {sc.get('snapshots','?')} | {sc.get('chunks','?')} | {vp} | {cnt(f['hit@1'])} | {cnt(f['hit@k'])} | {f['mrr']:.3f} | {cnt(o['chunk_level']['hit']['@40'])} | "
                  f"{cnt(ab.get('absent_queries_returning_results'))} | {cnt(ab.get('answerable_wrongly_abstained'))} | "
                  f"{round(100*d['final_slots_held_by_extra_snapshots']['rate']) if d and d['final_slots_held_by_extra_snapshots']['of'] else 0}% | "
                  f"{cnt(d.get('rank1_is_extra')) if d else '–'} | {q.get('p50')} / {q.get('p95')} / {q.get('p99','–')} (best-of: {(t.get('query_latency_best_of_repeats_ms') or {}).get('p50','–')} / {(t.get('query_latency_best_of_repeats_ms') or {}).get('p95','–')}) | {round(t['ingest_ms']/1000)} | {t.get('ingest_snapshots_per_second')} | "
                  f"{round(t['index_size_bytes']/1e6)} / {round(alloc/1e6)} | {round(alloc/1e6/max(vp,1)*1000,1)} | {rss_mb(os.path.join(a.dir, n + '.json'))} |")
        types = sorted({tn for n in ns for tn in reps[n]["by_type"]})
        print(f"\nPer type, final hit@8 (answerable) and absent questions still answered ({group}):\n")
        print("| type | " + " | ".join(ns) + " |")
        print("|---|" + "---|" * len(ns))
        for tn in types:
            cells = []
            for n in ns:
                v = reps[n]["by_type"].get(tn)
                if not v:
                    cells.append("–")
                elif v["n_answerable"] == 0:
                    ra = v["abstention"].get("absent_queries_returning_results")
                    cells.append(f"{ra['count']}/{ra['of']} answered" if ra else "–")
                else:
                    cells.append(cnt(v["final_level"]["hit@k"]))
            print(f"| {tn} | " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main()
