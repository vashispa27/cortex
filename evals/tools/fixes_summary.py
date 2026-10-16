#!/usr/bin/env python3
"""Build the step table of evals/reports/fixes/summary.md from the per-fix reports.

    python3 evals/tools/fixes_summary.py > /tmp/table.md

Paired bootstrap intervals (10,000 resamples, seed 0) compare each step to 00-baseline-120 on the
questions both reports contain (the 122 original+Fix-0 ids; later reports add q123/q124).
"""
import json
import os
import random

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "reports", "fixes")
STEPS = [
    ("0 baseline (122 q)", "00-baseline-120.json"),
    ("1 app-word filter", "01-app-filter.json"),
    ("2 multi-chunk results", "02-multi-chunk.json"),
    ("3 abstention", "03-abstention.json"),
    ("4 chunk boundaries/size", "04-chunking.json"),
    ("5 sender labels (prefix off)", "05-context.json"),
    ("6 date phrases + obs prefilter", "06-dates.json"),
    ("7 version ordering", "07-versions.json"),
    ("8 entity labels", "08-entities.json"),
]


def load(name):
    with open(os.path.join(D, name), encoding="utf-8") as f:
        return json.load(f)


def rr(ranks):
    r = [x for x in ranks if x]
    return 1.0 / min(r) if r else 0.0


def metric(q, kind):
    f = q["final_first_hit_rank"]
    if kind == "hit1":
        return float(any(x and x <= 1 for x in f))
    if kind == "hit8":
        return float(any(x and x <= 8 for x in f))
    return rr(f)


def ci(base, var, ids, kind, rng):
    d = [metric(var[i], kind) - metric(base[i], kind) for i in ids]
    means = sorted(sum(d[rng.randrange(len(d))] for _ in d) / len(d) for _ in range(4000))
    return sum(d) / len(d), means[100], means[3899]


def main():
    base_report = load(STEPS[0][1])
    base = {q["id"]: q for q in base_report["queries"]}
    rows = []
    for label, name in STEPS:
        r = load(name)
        q = {x["id"]: x for x in r["queries"]}
        ids = [i for i in base if i in q and not base[i]["expect_abstain"]]
        o = r["overall"]
        fl = o["final_level"]
        n = o["n_answerable"]
        t = r["by_split"]["test"]["abstention"]
        if "absent_queries_abstained" not in t:  # reports before Fix 3 had no abstention rule
            ret = t["absent_queries_returning_results"]
            t = dict(t, absent_queries_abstained={"count": ret["of"] - ret["count"], "of": ret["of"]},
                     answerable_wrongly_abstained={"count": 0, "of": r["by_split"]["test"]["n_answerable"]})
        rng = random.Random(0)
        if name == STEPS[0][1]:
            delta = ["–", "–", "–"]
        else:
            delta = []
            for kind in ("hit1", "hit8", "mrr"):
                m, lo, hi = ci(base, q, ids, kind, rng)
                delta.append("%+.3f [%+.3f, %+.3f]" % (m, lo, hi))
        rows.append("| %s | %d/%d | %d/%d | %.3f | %s | %s | %s | %d/%d · %d/%d | %.1f%% | %.0f MB | %.0f / %.0f ms |" % (
            label, fl["hit@1"]["count"], n, fl["hit@k"]["count"], n, fl["mrr"], delta[0], delta[1], delta[2],
            t["absent_queries_abstained"]["count"], t["absent_queries_abstained"]["of"],
            t["answerable_wrongly_abstained"]["count"], t["answerable_wrongly_abstained"]["of"],
            o["near_duplicate_crowding"]["jaccard_0.8"]["slots_near_duplicate"]["rate"] * 100,
            r["timing"]["index_size_bytes"] / 1e6, r["timing"]["query_latency_ms"]["p50"], r["timing"]["query_latency_ms"]["p95"]))
    out = ["| step | final hit@1 | final hit@8 | final MRR | Δ hit@1 vs step 0 [95% CI] | Δ hit@8 | Δ MRR | test: absent abstained · answerable wrongly abstained | near-dup slots | index | latency p50/p95 |",
           "|---|---|---|---|---|---|---|---|---|---|---|"] + rows
    out += ["", "Per affected type, final hit@8 (answerable questions of that type):", "",
            "| step | " + " | ".join(["filter_trap", "paraphrase", "boundary_fact", "time_scoped", "near_duplicate_version", "non_english", "speaker"]) + " |",
            "|---|" + "---|" * 7]
    for label, name in STEPS:
        r = load(name)
        cells = []
        for t in ("filter_trap", "paraphrase", "boundary_fact", "time_scoped", "near_duplicate_version", "non_english", "speaker"):
            v = r["by_type"][t]["final_level"]["hit@k"]
            cells.append("%d/%d" % (v["count"], r["by_type"][t]["n_answerable"]))
        out.append("| %s | %s |" % (label, " | ".join(cells)))
    print("\n".join(out))


if __name__ == "__main__":
    main()
