#!/usr/bin/env python3
"""Aggregate-only comparison of eval reports on two corpora (invented vs real). Prints markdown with
counts and rates only; no snapshot text is read from the reports' per-query rows except ids/types.

  transfer_table.py --pair LABEL=INVENTED.json,REAL.json [--pair ...] [--types-from LABEL]
"""
import argparse, json


def cnt(x):
    return f"{x['count']}/{x['of']} ({round(100*x['rate'])}%)" if x and x.get('of') else "n/a"


def pct(x):
    return f"{round(100*x['rate'])}%" if x and x.get('of') else "n/a"


def row(rep):
    o = rep['overall']; f = o['final_level']; c = o['chunk_level']; a = o['abstention']
    q = rep['timing']['query_latency_ms']
    return {
        "n": f"{o['n_queries']} ({o['n_answerable']} answerable, {o['n_absent']} absent)",
        "final hit@1": cnt(f['hit@1']), "final hit@8": cnt(f['hit@k']), "final MRR": f['mrr'],
        "chunk hit@8": cnt(c['hit']['@8']), "chunk hit@40": cnt(c['hit']['@40']),
        "answer in chunk list but lost at final": cnt(f['chunk_hit_but_final_miss']),
        "absent still returning results": cnt(a.get('absent_queries_returning_results') or a.get('absent_queries_abstained') and {'count': o['n_absent'] - a['absent_queries_abstained']['count'], 'of': a['absent_queries_abstained']['of'], 'rate': 1 - a['absent_queries_abstained']['rate']}),
        "AUROC answerable vs absent (final score)": a.get('auroc_answerable_vs_absent_final_score'),
        "final slots (2nd on) near-identical to a higher result, Jaccard>=0.8": cnt(o['near_duplicate_crowding']['jaccard_0.8']['slots_near_duplicate']),
        "queries with at least one such slot": cnt(o['near_duplicate_crowding']['jaccard_0.8']['queries_with_any']),
        "derived points in top-10": cnt(o['derived_pollution_top10']['derived_slots']),
        "zero-result queries": cnt(o['filters']['zero_result_queries']),
        "query latency p50 / p95 ms": f"{q.get('p50')} / {q.get('p95')}",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair", action="append", required=True)
    a = ap.parse_args()
    pairs = []
    for p in a.pair:
        label, files = p.split("=")
        inv, real = files.split(",")
        pairs.append((label, json.load(open(inv)), json.load(open(real))))
    print("## Overall, by code version\n")
    print("| metric | " + " | ".join(f"{l} invented | {l} real" for l, _, _ in pairs) + " |")
    print("|---|" + "---|" * (2 * len(pairs)))
    rows = [(l, row(i), row(r)) for l, i, r in pairs]
    for k in rows[0][1]:
        print(f"| {k} | " + " | ".join(f"{ri[k]} | {rr[k]}" for _, ri, rr in rows) + " |")
    for label, inv, real in pairs:
        print(f"\n## Per question type ({label})\n")
        print("| type | invented n | invented hit@1 | invented hit@8 | real n | real hit@1 | real hit@8 | real MRR |")
        print("|---|---|---|---|---|---|---|---|")
        types = sorted(set(inv['by_type']) | set(real['by_type']))
        for t in types:
            def cells(rep):
                v = rep['by_type'].get(t)
                if not v:
                    return ["–", "–", "–", "–"]
                f = v['final_level']
                if v['n_answerable'] == 0:
                    ab = v['abstention']
                    r = ab.get('absent_queries_returning_results')
                    return [str(v['n_queries']), "absent", f"{r['count']}/{r['of']} still answered" if r else "?", "–"]
                return [str(v['n_answerable']), cnt(f['hit@1']), cnt(f['hit@k']), f"{f['mrr']:.2f}"]
            ci, cr = cells(inv), cells(real)
            print(f"| {t} | {ci[0]} | {ci[1]} | {ci[2]} | {cr[0]} | {cr[1]} | {cr[2]} | {cr[3]} |")


if __name__ == "__main__":
    main()
