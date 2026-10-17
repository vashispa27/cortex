#!/usr/bin/env python3
"""Offline estimate for "step 5": how many more snapshots would merge if volatile text were ignored when comparing
captures? Replays the real corpus in observation order through the ingest rule of `dedup.rs` (same app/URL/title within six hours,
word overlap >= 0.9, identical numbers/capitalised words/negations) and compares:
  A  as shipped (exact title, bodies as stored)
  B  + page titles without counters and browser status suffixes ("(2) ", " - High memory usage - 822 MB", " - Audio playing")
  C  + volatile tokens masked in the bodies before comparing (relative times, notification counts, view/like/comment counters)
It also checks, for every extra merge, that no gold answer lives only in the snapshot that would be dropped.
Aggregates only on stdout. Reads evals/private (bodies, corpus, gold).

  volatile_gain.py [--private evals/private]
"""
import argparse, collections, json, os, re

WINDOW_MS = 6 * 3600 * 1000
THRESHOLD = 0.9
NEG = {"not", "no", "never", "cannot", "without", "none", "neither", "nor"}

TITLE_RULES = [
    ("leading counter", re.compile(r"^\(\d+\)\s*")),
    ("memory suffix", re.compile(r"\s+-\s+High memory usage\s+-\s+[\d.,]+\s*[MG]B", re.I)),
    ("audio suffix", re.compile(r"\s+-\s+Audio playing", re.I)),
    ("camera suffix", re.compile(r"\s+-\s+(Camera|Microphone) recording", re.I)),
]
BODY_RULES = [
    ("relative time", re.compile(r"\b(\d+\s?(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|weeks?|mo|months?|y|yr|yrs|years?)\s+ago|just now|a moment ago)\b", re.I)),
    ("notification count", re.compile(r"\b\d+\s+(new\s+)?(notifications?|unread)\b", re.I)),
    ("engagement counter", re.compile(r"\b[\d.,]+\s?[KMB]?\s+(views?|likes?|comments?|reposts?|replies|subscribers|followers|other people)\b", re.I)),
]


def critical(body):
    out = set()
    for t in re.split(r"[^\w'$€.,]", body):
        t = t.strip(".,")
        if not t:
            continue
        low = t.lower()
        if any(c.isdigit() for c in t) or t[0].isupper() or low in NEG or low.endswith("n't"):
            out.add(low)
    return out


def words(body):
    return set(w for w in re.split(r"[\W_]+", body.lower()) if w)


def mergeable(a, b):
    wa, wb = words(a), words(b)
    union = len(wa | wb)
    jac = 1.0 if union == 0 else len(wa & wb) / union
    return jac >= THRESHOLD and critical(a) == critical(b)


def norm_title(t, rules_hit):
    for name, rx in TITLE_RULES:
        n = rx.sub("", t)
        if n != t:
            rules_hit[name] += 1
        t = n
    return t


def mask(body, rules_hit):
    for name, rx in BODY_RULES:
        n = rx.sub(" ", body)
        if n != body:
            rules_hit[name] += 1
        body = n
    return body


def replay(rows, title_fn, body_fn):
    """rows sorted by time. Returns (kept ids, dropped -> kept)."""
    last = collections.defaultdict(list)
    merged = {}
    for r in rows:
        key = (r["app"], r["url"], title_fn(r["title"]))
        cands = [c for c in last[key] if r["t"] - c["t"] <= WINDOW_MS][-3:][::-1]
        hit = None
        for c in cands:
            if c["body_raw"] == r["body_raw"] or mergeable(c["body"], body_fn(r["body_raw"])):
                hit = c
                break
        if hit:
            merged[r["id"]] = hit["id"]
            hit["t"] = r["t"]
        else:
            last[key].append({"id": r["id"], "t": r["t"], "body": body_fn(r["body_raw"]), "body_raw": r["body_raw"]})
    return merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--private", default="evals/private")
    a = ap.parse_args()
    bodies_dir = os.path.join(a.private, "bodies")
    idx = json.load(open(os.path.join(bodies_dir, "_index.json")))
    rows = []
    for f in sorted(idx):
        if not idx[f]["searchable"]:
            continue
        c = json.load(open(os.path.join(a.private, "corpus", f + ".json")))
        rows.append({"id": f, "app": c["app_id"], "url": c.get("url"), "title": c["title"], "t": c["observed_ms"],
                     "body_raw": open(os.path.join(bodies_dir, f + ".txt")).read()})
    rows.sort(key=lambda r: (r["t"], r["id"]))
    n = len(rows)
    title_hits, body_hits = collections.Counter(), collections.Counter()
    ident = lambda x: x
    A = replay(rows, ident, ident)
    B = replay(rows, lambda t: norm_title(t, title_hits), ident)
    C = replay(rows, lambda t: norm_title(t, title_hits), lambda b: mask(b, body_hits))
    print(f"snapshots replayed: {n}")
    for name, m in (("A as shipped", A), ("B + title normalisation", B), ("C + volatile body masking", C)):
        print(f"  {name:<28} survivors {n - len(m):>5}  merged away {len(m):>5}  ({100 * len(m) / n:.1f}%)")
    print("  title rules that fired:", dict(title_hits))
    print("  body rules that fired:", dict(body_hits))

    # Safety: gold answers that live only in a snapshot C would drop.
    gold = [json.loads(l) for l in open(os.path.join(a.private, "gold.jsonl")) if l.strip()]
    norm = lambda s: " ".join(s.lower().split())
    text = {r["id"]: norm(r["body_raw"]) for r in rows}
    extra = {d: k for d, k in C.items() if d not in A}
    lost = 0
    for d, k in extra.items():
        for g in gold:
            for rel in g["relevant"]:
                ans = norm(rel["answer_text"])
                if ans in text[d] and ans not in text[k]:
                    lost += 1
    print(f"  extra merges from B/C vs A: {len(extra)}; gold answers present only in a dropped snapshot: {lost}")
    only_c = {d: k for d, k in C.items() if d not in B}
    print(f"  of which only because of body masking: {len(only_c)}")


main()
