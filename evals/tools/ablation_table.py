#!/usr/bin/env python3
"""Compact ablation table from one eval run with sweeps: for each variant, final hit@1, hit@8, MRR and chunk
hit@40 over answerable questions, the paired difference in final hit@8 to the base with a 95% bootstrap CI
(2,000 resamples, seed 0), and how many absent questions still return results.

  ablation_table.py BASE.json VARIANT.json ...
"""
import json, random, sys


def load(p):
    r = json.load(open(p))
    return r, {q["id"]: q for q in r["queries"]}


def hit(q, k, key="final_first_hit_rank"):
    return float(any(x and x <= k for x in q[key]))


def rr(q):
    r = [x for x in q["final_first_hit_rank"] if x]
    return 1 / min(r) if r else 0.0


def main():
    base, bq = load(sys.argv[1])
    ids = [i for i, q in bq.items() if not q["expect_abstain"]]
    rng = random.Random(0)
    print("| variant | final hit@1 | final hit@8 | Δ hit@8 vs base [95% CI] | final MRR | chunk hit@40 | absent still answered |")
    print("|---|---|---|---|---|---|---|")
    for p in sys.argv[1:]:
        r, q = load(p)
        name = r["meta"]["variant"]
        h1 = sum(hit(q[i], 1) for i in ids); h8 = sum(hit(q[i], 8) for i in ids)
        mrr = sum(rr(q[i]) for i in ids) / len(ids)
        c40 = sum(hit(q[i], 40, "chunk_first_hit_rank") for i in ids)
        absent = [i for i, x in q.items() if x["expect_abstain"]]
        ans = sum(1 for i in absent if q[i]["n_final"] > 0)
        d = [hit(q[i], 8) - hit(bq[i], 8) for i in ids]
        if any(d):
            means = sorted(sum(rng.choice(d) for _ in d) / len(d) for _ in range(2000))
            ci = f"{sum(d)/len(d):+.3f} [{means[50]:+.3f}, {means[1949]:+.3f}]"
        else:
            ci = "0 queries differ"
        print(f"| {name} | {h1:.0f}/{len(ids)} | {h8:.0f}/{len(ids)} | {ci} | {mrr:.3f} | {c40:.0f}/{len(ids)} | {ans}/{len(absent)} |")


main()
