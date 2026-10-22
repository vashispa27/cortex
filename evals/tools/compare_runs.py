#!/usr/bin/env python3
"""Compare matched judged answers without exposing question text."""
import argparse
import json
from collections import defaultdict
from pathlib import Path


def load(path):
    rows = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    result = {row['id']: row for row in rows}
    if len(result) != len(rows):
        raise ValueError(f'duplicate question ids in {path}')
    return result


def correct(row):
    return (row.get('judge') or {}).get('verdict') == 'correct'


def metrics(rows):
    facts = [r for r in rows if (r.get('det') or {}).get('facts_total', 0) > 0]
    supported = [r for r in rows if r['behavior'] in ('memory', 'mixed')]
    percent = lambda items, pred: 100 * sum(bool(pred(r)) for r in items) / len(items) if items else None
    return [percent(rows, correct),
            percent(rows, lambda r: (r.get('judge') or {}).get('verdict') == 'partial'),
            percent(facts, lambda r: r['det'].get('all_facts')),
            percent(supported, lambda r: (r.get('det') or {}).get('cited_support'))]


def table(baseline, candidate, key, ids):
    groups = defaultdict(list)
    for qid in sorted(ids):
        if baseline[qid][key] != candidate[qid][key]:
            raise ValueError(f'{key} differs for {qid}')
        groups[baseline[qid][key]].append(qid)
    print(f'\nBy {key} (matched questions; percentages, deltas in points)')
    print('| group | n | correct B / C / Δ | partial B / C / Δ | facts-all B / C / Δ | cited-support B / C / Δ |')
    print('|---|---:|---:|---:|---:|---:|')
    for name, members in sorted(groups.items()):
        b = metrics([baseline[i] for i in members])
        c = metrics([candidate[i] for i in members])
        values = ['—' if x is None or y is None else f'{x:.1f}% / {y:.1f}% / {y-x:+.1f}' for x, y in zip(b, c)]
        print(f'| {name} | {len(members)} | ' + ' | '.join(values) + ' |')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline')
    parser.add_argument('candidate')
    args = parser.parse_args()
    baseline, candidate = load(args.baseline), load(args.candidate)
    ids = baseline.keys() & candidate.keys()
    if not ids:
        parser.error('runs have no question ids in common')
    print(f'Matched {len(ids)} questions. Baseline-only: {len(baseline.keys()-ids)}; candidate-only: {len(candidate.keys()-ids)}.')
    print('B = baseline; C = candidate. Jev has about 5 percentage points of noise on groups under 30 questions.')
    for key in ('family', 'behavior'):
        table(baseline, candidate, key, ids)
    for label, before, after in [('Correct → not correct', True, False), ('Not correct → correct', False, True)]:
        flipped = sorted(i for i in ids if correct(baseline[i]) == before and correct(candidate[i]) == after)
        print(f'\n{label} ({len(flipped)}): ' + (', '.join(flipped) or 'none'))


if __name__ == '__main__':
    main()
