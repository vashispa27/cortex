#!/usr/bin/env python3
"""Browse cleaned bodies of the real corpus and add gold questions with the answer-string check.

Bodies come from `open-memory ingest-fixtures --corpus evals/private/corpus --dump-bodies evals/private/bodies`
(with OPEN_MEMORY_STATE_DIR pointing at a throwaway dir), so they are what the current cleaner makes.

  gold_author.py list [--app chrome] [--grep TEXT] [--min-bytes N]     one line per snapshot
  gold_author.py show real-chrome-0042 [--grep TEXT] [--context 200]   print the cleaned body
  gold_author.py find "some phrase"                                    which bodies contain it (all of them)
  gold_author.py add --fixture ID --query "..." --answer "exact text" [--type paraphrase] [--wrong "stale text"]
                     [--notes "..."] [--also ID2=answer2]              verifies the answer, appends to gold.jsonl
  gold_author.py add-absent --query "..." --terms "key,terms" [--type absent] [--notes "..."]
                                                                       appends only if no body contains ALL terms
                                                                       (and prints bodies that contain ANY)
  gold_author.py check                                                 re-verify every answer against the bodies
"""
import argparse, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PRIV = os.path.normpath(os.path.join(HERE, "..", "private"))
BODIES = os.path.join(PRIV, "bodies")
GOLD = os.path.join(PRIV, "gold.jsonl")
norm = lambda s: " ".join(s.lower().split())


def index():
    return json.load(open(os.path.join(BODIES, "_index.json")))


def body(fid):
    return open(os.path.join(BODIES, fid + ".txt")).read()


def meta(fid):
    c = json.load(open(os.path.join(PRIV, "corpus", fid + ".json")))
    return c["app_id"], c["title"], c.get("url") or ""


def split_of(qid):
    return "dev" if int(hashlib.sha256(qid.encode()).hexdigest(), 16) % 2 == 0 else "test"


def load_gold():
    return [json.loads(l) for l in open(GOLD)] if os.path.exists(GOLD) else []


def next_id(gold):
    n = max([int(g["id"][1:]) for g in gold if re.fullmatch(r"r\d+", g["id"])] or [0])
    return f"r{n + 1:03d}"


def cmd_list(a):
    for fid, m in sorted(index().items()):
        if a.app and a.app.lower() not in fid.lower():
            continue
        if m["body_bytes"] < a.min_bytes or not m["searchable"]:
            continue
        if a.grep and a.grep.lower() not in body(fid).lower():
            continue
        app, title, url = meta(fid)
        print(f"{fid}\t{m['body_bytes']:>7}B {m['chunks']:>3}ch\t{title[:70]}\t{url[:60]}")


def cmd_show(a):
    b = body(a.fixture)
    app, title, url = meta(a.fixture)
    print(f"# {a.fixture}  {app}  {title}  {url}  ({len(b)} chars)")
    if a.grep:
        for m in re.finditer(re.escape(a.grep), b, re.I):
            print("...", b[max(0, m.start() - a.context):m.end() + a.context].replace("\n", " ⏎ "), "...\n")
    else:
        print(b)


def cmd_find(a):
    q = norm(a.phrase)
    hits = [fid for fid in index() if os.path.exists(os.path.join(BODIES, fid + ".txt")) and q in norm(body(fid))]
    print(len(hits), "bodies contain it:", *hits[:40])


def verify(fid, answer):
    if not os.path.exists(os.path.join(BODIES, fid + ".txt")):
        return False
    return norm(answer) in norm(body(fid))


def cmd_add(a):
    gold = load_gold()
    rel = [{"fixture": a.fixture, "answer_text": a.answer}]
    for extra in a.also or []:
        f, _, t = extra.partition("=")
        rel.append({"fixture": f, "answer_text": t})
    for r in rel:
        if not verify(r["fixture"], r["answer_text"]):
            sys.exit(f"answer is not an exact (case/whitespace-normalised) substring of {r['fixture']}: {r['answer_text']!r}")
    qid = next_id(gold)
    entry = {"id": qid, "type": a.type, "split": split_of(qid), "query": a.query, "relevant": rel,
             "expect_abstain": False, "notes": a.notes}
    if a.wrong:
        entry["wrong_text"] = a.wrong
    open(GOLD, "a").write(json.dumps(entry, ensure_ascii=False) + "\n")
    print("added", qid, entry["split"])


def cmd_add_absent(a):
    terms = [t.strip().lower() for t in a.terms.split(",") if t.strip()]
    all_hit, any_hit = [], {}
    for fid in index():
        p = os.path.join(BODIES, fid + ".txt")
        if not os.path.exists(p):
            continue
        b = norm(body(fid))
        present = [t for t in terms if t in b]
        if len(present) == len(terms):
            all_hit.append(fid)
        elif present:
            any_hit[fid] = present
    if all_hit:
        sys.exit(f"NOT absent: {len(all_hit)} bodies contain every term: {all_hit[:10]}")
    print(f"{len(any_hit)} bodies contain some term (near-miss material):", list(any_hit.items())[:8])
    gold = load_gold()
    qid = next_id(gold)
    open(GOLD, "a").write(json.dumps({"id": qid, "type": a.type, "split": split_of(qid), "query": a.query, "relevant": [],
                                       "expect_abstain": True, "notes": a.notes}, ensure_ascii=False) + "\n")
    print("added", qid, split_of(qid))


def cmd_check(a):
    bad = 0
    for g in load_gold():
        for r in g["relevant"]:
            if not verify(r["fixture"], r["answer_text"]):
                bad += 1
                print("BAD", g["id"], r["fixture"], r["answer_text"][:60])
    print("gold:", len(load_gold()), "questions;", bad, "bad")


p = argparse.ArgumentParser()
sp = p.add_subparsers(dest="cmd", required=True)
s = sp.add_parser("list"); s.add_argument("--app"); s.add_argument("--grep"); s.add_argument("--min-bytes", type=int, default=0); s.set_defaults(f=cmd_list)
s = sp.add_parser("show"); s.add_argument("fixture"); s.add_argument("--grep"); s.add_argument("--context", type=int, default=200); s.set_defaults(f=cmd_show)
s = sp.add_parser("find"); s.add_argument("phrase"); s.set_defaults(f=cmd_find)
s = sp.add_parser("add"); s.add_argument("--fixture", required=True); s.add_argument("--query", required=True); s.add_argument("--answer", required=True)
s.add_argument("--type", default="paraphrase"); s.add_argument("--wrong", action="append"); s.add_argument("--notes", default=""); s.add_argument("--also", action="append"); s.set_defaults(f=cmd_add)
s = sp.add_parser("add-absent"); s.add_argument("--query", required=True); s.add_argument("--terms", required=True); s.add_argument("--type", default="absent"); s.add_argument("--notes", default=""); s.set_defaults(f=cmd_add_absent)
s = sp.add_parser("check"); s.set_defaults(f=cmd_check)
a = p.parse_args()
a.f(a)
