#!/usr/bin/env python3
"""Offline estimate of how much a final-stage near-duplicate collapse could recover (Fix 7 headroom).

Takes an eval report produced with a large `--param final_k=N` (e.g. 40) and the cleaned bodies of the
corpus (`ingest-fixtures --dump-bodies`). For every answerable query it walks the final list in rank order,
drops a result whose body has word-set Jaccard >= THRESHOLD with a result already kept, and reports hit@8 /
hit@1 / MRR of the collapsed list next to the original. Aggregates only; read-only; no retrieval changes.

  dedup_potential.py REPORT.json --bodies evals/private/bodies [--threshold 0.8] [--k 8]
"""
import argparse, json, os, re


def words(t):
    return set(re.findall(r"\w+", t.lower()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report")
    ap.add_argument("--bodies", required=True)
    ap.add_argument("--threshold", type=float, default=0.8)
    ap.add_argument("--k", type=int, default=8)
    a = ap.parse_args()
    rep = json.load(open(a.report))
    cache = {}

    def ws(f):
        if f not in cache:
            p = os.path.join(a.bodies, f + ".txt")
            cache[f] = words(open(p).read()) if os.path.exists(p) else set()
        return cache[f]

    n = hit_o = hit_c = h1_o = h1_c = 0
    mrr_o = mrr_c = 0.0
    dropped = total = 0
    for q in rep["queries"]:
        if q["expect_abstain"]:
            continue
        n += 1
        kept = []
        orig_rank = 0
        first_o = first_c = None
        for r in q["final"]:
            orig_rank += 1
            fx = r["fixtures"][0] if r["fixtures"] else ""
            if r["hit"] and first_o is None:
                first_o = orig_rank
            total += 1
            w = ws(fx)
            dup = False
            for kfx in kept:
                kw = ws(kfx)
                u = len(w | kw)
                if u and len(w & kw) / u >= a.threshold:
                    dup = True
                    break
            if dup:
                dropped += 1
                continue
            kept.append(fx)
            if r["hit"] and first_c is None:
                first_c = len(kept)
        if first_o and first_o <= a.k:
            hit_o += 1
        if first_c and first_c <= a.k:
            hit_c += 1
        h1_o += first_o == 1
        h1_c += first_c == 1
        mrr_o += (1 / first_o) if first_o and first_o <= a.k else 0
        mrr_c += (1 / first_c) if first_c and first_c <= a.k else 0
    print(json.dumps({"answerable": n, "threshold": a.threshold, "k": a.k,
                      "original": {"hit@k": hit_o, "hit@1": h1_o, "mrr": round(mrr_o / n, 4)},
                      "collapsed": {"hit@k": hit_c, "hit@1": h1_c, "mrr": round(mrr_c / n, 4)},
                      "results_dropped_as_near_duplicates": f"{dropped}/{total}"}, indent=1))


if __name__ == "__main__":
    main()
