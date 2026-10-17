#!/usr/bin/env python3
"""Freeze and verify the eval inputs, so every run is comparable with every earlier run.

The frozen sets are:
  invented  evals/corpus/*.json + evals/gold/gold.jsonl          (tracked in git)
  real      evals/private/corpus/*.json + evals/private/gold.jsonl (git-ignored, local only)

`evals/frozen.json` (committed) holds a sha256 per file plus one id per set. Hashes reveal nothing about the
real data. `run_all.sh` verifies the sets before every run and refuses to continue if anything changed, was added
or is missing, so a changed corpus or gold set is always a deliberate act:

  python3 evals/freeze.py verify [invented|real]    exit 1 and list differences if anything changed
  python3 evals/freeze.py update [invented|real]    accept the current files as the new frozen set (then commit frozen.json)
  python3 evals/freeze.py id [invented|real]        print the set id (also stored with every history row)

`update` also makes the real files read-only (chmod a-w) so a stray script cannot overwrite them.
The raw Accessibility trees inside these fixtures are test input: the 7-day tree purge applies to the live
database only and never reads these files.
"""
import hashlib, json, os, stat, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MANIFEST = os.path.join(ROOT, "evals", "frozen.json")
SETS = {
    "invented": {"dirs": ["evals/corpus"], "files": ["evals/gold/gold.jsonl"]},
    "real": {"dirs": ["evals/private/corpus"], "files": ["evals/private/gold.jsonl"]},
}


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def current(name):
    spec = SETS[name]
    files = {}
    for d in spec["dirs"]:
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            return None
        for f in sorted(os.listdir(full)):
            if f.endswith(".json") and not f.startswith("_"):
                files[f"{d}/{f}"] = sha(os.path.join(full, f))
    for f in spec["files"]:
        full = os.path.join(ROOT, f)
        if not os.path.isfile(full):
            return None
        files[f] = sha(full)
    return files


def set_id(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:12]


def load():
    return json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {"version": 1, "sets": {}}


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "verify"
    names = [sys.argv[2]] if len(sys.argv) > 2 else list(SETS)
    manifest = load()
    bad = 0
    for name in names:
        if name not in SETS:
            sys.exit(f"unknown set {name}")
        now = current(name)
        if now is None:
            print(f"{name}: not present on this machine")
            if cmd == "verify" and name in manifest["sets"] and name == "invented":
                bad += 1
            continue
        if cmd == "id":
            print(set_id(now))
        elif cmd == "update":
            manifest["sets"][name] = {"id": set_id(now), "count": len(now), "files": now}
            if name == "real":
                for rel in now:
                    p = os.path.join(ROOT, rel)
                    os.chmod(p, os.stat(p).st_mode & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))
            print(f"{name}: froze {len(now)} files, id {manifest['sets'][name]['id']}")
        elif cmd == "verify":
            old = manifest["sets"].get(name)
            if old is None:
                print(f"{name}: no frozen entry; run `python3 evals/freeze.py update {name}`")
                bad += 1
                continue
            added = sorted(set(now) - set(old["files"]))
            removed = sorted(set(old["files"]) - set(now))
            changed = sorted(k for k in now if k in old["files"] and now[k] != old["files"][k])
            if added or removed or changed:
                bad += 1
                print(f"{name}: CHANGED since frozen (id {old['id']}): {len(changed)} changed, {len(added)} added, {len(removed)} removed")
                for label, items in (("changed", changed), ("added", added), ("removed", removed)):
                    for i in items[:10]:
                        print(f"   {label}: {i}")
                print(f"   If this is deliberate: python3 evals/freeze.py update {name}  (and commit evals/frozen.json)")
            else:
                print(f"{name}: ok ({len(now)} files, id {old['id']})")
        else:
            sys.exit("usage: freeze.py verify|update|id [invented|real]")
    if cmd == "update":
        with open(MANIFEST, "w") as f:
            json.dump(manifest, f, indent=1, sort_keys=True)
            f.write("\n")
    sys.exit(1 if bad else 0)


main()
