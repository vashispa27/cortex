#!/usr/bin/env python3
"""Precision/coverage curves for abstention rules, computed on a report's `dev` queries only.

    python3 evals/tools/abstention_curve.py REPORT.json [--max-wrong 0.05] [--eval-on test]

REPORT must come from a run with the abstention thresholds at 0 (no abstaining), so every query carries
its raw signals (`score_norm`, `support`, `dense_sim`). For each rule the table gives, on dev, how many
absent questions it correctly abstains on and how many answerable questions it wrongly abstains on.
The rule is picked on dev only: the most absent questions abstained subject to wrongly abstaining on at
most --max-wrong of the answerable ones, ties to the lower wrong count and then the more conservative
(lower) thresholds. --eval-on reports the chosen rule on another split, so thresholds are never tuned on test.
"""
import argparse
import itertools
import json

SIGNALS = ("score_norm", "support", "dense_sim", "chunk_sim", "chunk_support", "unseen_inv", "ident")


def evaluate(queries, rule):
    absent = [q for q in queries if q["expect_abstain"]]
    answerable = [q for q in queries if not q["expect_abstain"]]
    def abstain(q):
        # "unseen>=u&chunk_sim<s": many never-captured terms AND a dissimilar best chunk.
        for k, t in rule.items():
            if k == "unseen_and_dissimilar":
                if q["unseen"] >= t[0] and q["chunk_sim"] < t[1]:
                    return True
            elif k == "time_support":
                if q["has_time_window"] and q["support"] < t:
                    return True
            elif q[k] < t:
                return True
        return False
    return (sum(1 for q in absent if abstain(q)), len(absent),
            sum(1 for q in answerable if abstain(q)), len(answerable),
            sum(1 for q in answerable if abstain(q) and q["would_have_hit"]))


def candidates(queries):
    values = {k: sorted({round(q[k], 2) for q in queries}) for k in SIGNALS}
    singles = [{k: t} for k in SIGNALS for t in values[k]]
    pairs = [{a: ta, b: tb} for a, b in itertools.combinations(SIGNALS, 2) for ta in values[a][::2] for tb in values[b][::2]]
    unseen_vals = sorted({round(q["unseen"], 2) for q in queries if q["unseen"] > 0})
    ands = [{"unseen_and_dissimilar": (u, s)} for u in unseen_vals for s in values["chunk_sim"]]
    # The identifier check is exact (a token the question names is nowhere in the evidence), so it
    # is always offered alongside any other rule.
    with_ident = [dict(r, ident=1.0) for r in singles + pairs + ands if "ident" not in r]
    times = [{"time_support": t} for t in sorted({round(q["support"], 2) for q in queries if q["has_time_window"]})]
    with_time = [dict(r, time_support=t["time_support"]) for r in singles[:0] + ands + [{}] for t in times]
    with_time_ident = [dict(r, ident=1.0) for r in with_time]
    return singles + pairs + ands + with_ident + times + with_time + with_time_ident


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report")
    ap.add_argument("--max-wrong", type=float, default=0.05)
    ap.add_argument("--eval-on", default="test")
    ap.add_argument("--out")
    args = ap.parse_args()
    queries = json.load(open(args.report))["queries"]
    for q in queries:
        q["unseen_inv"] = 1.0 - q["unseen"]   # lower = more unseen terms, so "x < t" abstains like the others
    dev = [q for q in queries if q["split"] == "dev"]
    other = [q for q in queries if q["split"] == args.eval_on]
    lines = ["# Abstention rule selection (dev only)", "",
             "dev: %d absent, %d answerable. Constraint: wrongly abstained <= %.0f%% of dev answerable."
             % (sum(q["expect_abstain"] for q in dev), sum(not q["expect_abstain"] for q in dev), args.max_wrong * 100), ""]
    for k in SIGNALS:
        lines += ["### Single signal: %s" % k, "", "| threshold | absent abstained | answerable wrongly abstained | of which would have hit |", "|---|---|---|---|"]
        for t in sorted({round(q[k], 2) for q in dev}):
            a, na, w, nw, wh = evaluate(dev, {k: t})
            if 0 < a or w:
                lines.append("| %s < %.2f | %d/%d | %d/%d | %d |" % (k, t, a, na, w, nw, wh))
        lines.append("")
    best = None
    for rule in candidates(dev):
        a, na, w, nw, wh = evaluate(dev, rule)
        if w / nw <= args.max_wrong:
            key = (a, -w, -sum(v if not isinstance(v, tuple) else v[1] - v[0] for v in rule.values()))
            if best is None or key > best[0]:
                best = (key, rule, (a, na, w, nw, wh))
    _, rule, (a, na, w, nw, wh) = best
    describe = lambda kv: ("unseen >= %.2f and chunk_sim < %.2f" % kv[1]) if kv[0] == "unseen_and_dissimilar" else "%s < %.2f" % kv
    lines += ["## Chosen on dev", "", "Rule: abstain when %s" % " or ".join(describe(kv) for kv in sorted(rule.items())),
              "", "dev: absent abstained %d/%d, answerable wrongly abstained %d/%d (%d would have hit)" % (a, na, w, nw, wh)]
    if other:
        a, na, w, nw, wh = evaluate(other, rule)
        lines += ["", "%s (not used for selection): absent abstained %d/%d, answerable wrongly abstained %d/%d (%d would have hit)"
                  % (args.eval_on, a, na, w, nw, wh)]
    text = "\n".join(lines) + "\n"
    if args.out:
        open(args.out, "w").write(text)
    print(text)
    print(json.dumps(rule))


if __name__ == "__main__":
    main()
