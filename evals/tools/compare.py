#!/usr/bin/env python3
"""Paired comparison of eval reports with a bootstrap confidence interval.

    python3 evals/tools/compare.py BASE.json VARIANT.json [VARIANT.json ...] [--out FILE.md]

Per-query metrics come from the reports' `queries` blocks, so both reports must cover the same gold
ids. For each variant and metric the table gives the mean over queries, the paired difference to the
base, and a 95% percentile-bootstrap interval of that difference (10,000 resamples, seed 0). A
difference whose interval contains 0 is within noise at this sample size.
"""
import argparse
import json
import random


def rr(ranks):
    ranks = [r for r in ranks if r]
    return 1.0 / min(ranks) if ranks else 0.0


METRICS = [
    ("chunk hit@8", lambda q: float(any(r and r <= 8 for r in q["chunk_first_hit_rank"]))),
    ("chunk hit@40", lambda q: float(any(r and r <= 40 for r in q["chunk_first_hit_rank"]))),
    ("chunk MRR", lambda q: rr(q["chunk_first_hit_rank"])),
    ("final hit@1", lambda q: float(any(r and r <= 1 for r in q["final_first_hit_rank"]))),
    ("final hit@8", lambda q: float(any(r and r <= 8 for r in q["final_first_hit_rank"]))),
    ("final MRR", lambda q: rr(q["final_first_hit_rank"])),
]


def load(path):
    with open(path, encoding="utf-8") as f:
        report = json.load(f)
    return report, {q["id"]: q for q in report["queries"]}


def bootstrap(diffs, rng, n=10000):
    if not diffs:
        return (0.0, 0.0)
    means = []
    for _ in range(n):
        sample = [diffs[rng.randrange(len(diffs))] for _ in diffs]
        means.append(sum(sample) / len(sample))
    means.sort()
    return (means[int(0.025 * n)], means[int(0.975 * n) - 1])


def block(base_q, var_q, ids, rng, title):
    lines = ["#### %s (n=%d)" % (title, len(ids)), "",
             "| metric | base | variant | diff | 95% CI | verdict |", "|---|---|---|---|---|---|"]
    for name, fn in METRICS:
        b = [fn(base_q[i]) for i in ids]
        v = [fn(var_q[i]) for i in ids]
        d = [y - x for x, y in zip(b, v)]
        mb, mv = sum(b) / len(b), sum(v) / len(v)
        lo, hi = bootstrap(d, rng)
        changed = sum(1 for x in d if x != 0)
        verdict = "within noise" if lo <= 0 <= hi else ("better" if mv > mb else "worse")
        lines.append("| %s | %.3f | %.3f | %+.3f | [%+.3f, %+.3f] | %s (%d queries differ) |" % (name, mb, mv, mv - mb, lo, hi, verdict, changed))
    return lines + [""]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("variants", nargs="+")
    ap.add_argument("--out")
    ap.add_argument("--types", default="paraphrase,keyword,near_duplicate_version,time_scoped,filter_trap,boundary_fact,non_english",
                    help="comma-separated query types to break out (needs n >= 3)")
    args = ap.parse_args()
    base_report, base_q = load(args.base)
    out = ["# Paired comparison against `%s`" % base_report["meta"]["variant"], "",
           "Answerable questions only (absent questions have no answer to rank). Bootstrap: 10,000 resamples of the "
           "paired per-query differences, seed 0. Intervals this wide mean a few queries decide each row.", ""]
    for path in args.variants:
        report, var_q = load(path)
        rng = random.Random(0)
        ids = [i for i in base_q if i in var_q and not base_q[i]["expect_abstain"]]
        out.append("### %s vs %s" % (report["meta"]["variant"], base_report["meta"]["variant"]))
        out.append("")
        out += block(base_q, var_q, ids, rng, "all answerable queries")
        for t in args.types.split(","):
            tids = [i for i in ids if base_q[i]["type"] == t]
            if len(tids) >= 3:
                out += block(base_q, var_q, tids, rng, "type: " + t)
        absent = [i for i in base_q if base_q[i]["expect_abstain"] and i in var_q]
        if absent:
            n_b = sum(1 for i in absent if base_q[i].get("n_final", 1) > 0)
            n_v = sum(1 for i in absent if var_q[i].get("n_final", 1) > 0)
            out.append("Absent questions that still returned results: base %d/%d, variant %d/%d." % (n_b, len(absent), n_v, len(absent)))
            out.append("")
    text = "\n".join(out)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
