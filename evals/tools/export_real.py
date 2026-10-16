#!/usr/bin/env python3
"""Export the user's real open-memory database as eval fixtures (one per snapshot).

Reads memory.sqlite3 read-only. Writes evals/private/corpus/<id>.json in the same format as
evals/corpus (app id, title, url, source type, observed time, `roots` = the stored ax_nodes_json so
the current cleaner re-cleans every snapshot through the real path), plus a stats file.

Skips: snapshots with no AX nodes, cleaner_quality navigation_only / content_unavailable,
source_type browser_private.

  python3 evals/tools/export_real.py [--db PATH] [--out evals/private/corpus]
"""
import argparse, collections, json, os, re, sqlite3, statistics, sys
from urllib.parse import urlparse

DEFAULT_DB = os.path.expanduser("~/Library/Application Support/Open Memory/local-memory/memory.sqlite3")
SHORT = {"com.google.Chrome": "chrome", "ai.opencode.desktop": "opencode", "com.anthropic.claudefordesktop": "claude",
         "dev.warp.Warp-Stable": "warp", "net.whatsapp.WhatsApp": "whatsapp", "com.apple.Safari": "safari",
         "com.openai.codex": "codex", "com.apple.systempreferences": "sysprefs", "com.microsoft.VSCode": "vscode"}
SKIP_QUALITY = {"navigation_only", "content_unavailable"}


def dist(xs):
    if not xs:
        return {}
    xs = sorted(xs)
    q = lambda p: xs[min(len(xs) - 1, int(p * len(xs)))]
    return {"n": len(xs), "min": xs[0], "p25": q(.25), "p50": q(.5), "p75": q(.75), "p90": q(.9), "p99": q(.99), "max": xs[-1],
            "mean": round(statistics.mean(xs), 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--out", default="evals/private/corpus")
    a = ap.parse_args()
    db = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    os.makedirs(a.out, exist_ok=True)
    for f in os.listdir(a.out):
        if f.endswith(".json"):
            os.remove(os.path.join(a.out, f))
    obs = collections.defaultdict(list)
    for r in db.execute("SELECT snapshot_id, observed_ms FROM observations ORDER BY observed_ms"):
        obs[r["snapshot_id"]].append(r["observed_ms"])
    skipped = collections.Counter()
    kept = []
    for r in db.execute("SELECT * FROM snapshots ORDER BY id"):
        if r["source_type"] == "browser_private":
            skipped["browser_private"] += 1; continue
        if r["cleaner_quality"] in SKIP_QUALITY:
            skipped[r["cleaner_quality"]] += 1; continue
        try:
            nodes = json.loads(r["ax_nodes_json"])
        except Exception:
            nodes = []
        if not nodes:
            skipped["no_ax_nodes"] += 1; continue
        times = obs.get(r["id"]) or [r["first_seen_ms"]]
        fid = f"real-{SHORT.get(r['app_id'], 'other')}-{r['id']:04d}"
        fx = {
            "provenance": "real_capture",
            "app_id": r["app_id"], "title": r["title"], "url": r["url"], "source_type": r["source_type"],
            "observed_ms": times[0], "also_observed_ms": times[1:],
            "focus_role": r["focus_role"] or "", "focus_name": r["focus_name"] or "",
            "limitations": json.loads(r["limitations"] or "[]"),
            "notes": f"exported from snapshot {r['id']} (stored cleaner quality {r['cleaner_quality']})",
            "roots": nodes,
        }
        with open(os.path.join(a.out, fid + ".json"), "w") as f:
            json.dump(fx, f)
        kept.append((fid, r, len(times)))
    stats = {"exported": len(kept), "skipped": dict(skipped), "sightings_total": sum(k[2] for k in kept)}
    stats["by_app"] = dict(collections.Counter(k[1]["app_id"] for k in kept).most_common())
    dom = collections.Counter()
    for _, r, _ in kept:
        d = r["domain"] or (urlparse(r["url"]).hostname if r["url"] else None) or "(none)"
        dom[d] += 1
    stats["by_domain_top30"] = dict(dom.most_common(30))
    stats["by_source_type"] = dict(collections.Counter(k[1]["source_type"] for k in kept))
    stats["by_stored_quality"] = dict(collections.Counter(k[1]["cleaner_quality"] for k in kept))
    stats["stored_body_bytes"] = dist([len(k[1]["body"].encode()) for k in kept])
    stats["sightings_per_snapshot"] = dist([k[2] for k in kept])
    stats["stored_body_bytes_by_app"] = {app: dist([len(k[1]["body"].encode()) for k in kept if k[1]["app_id"] == app]) for app in stats["by_app"]}
    # near-identical captures: same app+title
    grp = collections.Counter((k[1]["app_id"], k[1]["title"]) for k in kept)
    stats["same_app_title_groups"] = {"groups": len(grp), "snapshots_in_groups_of_2plus": sum(v for v in grp.values() if v > 1),
                                       "largest_group": max(grp.values())}
    ts = [t for k in kept for t in [k[1]["first_seen_ms"], k[1]["last_seen_ms"]]]
    stats["time_range_ms"] = [min(ts), max(ts)]
    os.makedirs(os.path.dirname(a.out.rstrip("/")) or ".", exist_ok=True)
    with open(os.path.join(os.path.dirname(a.out.rstrip("/")), "export_stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    print(json.dumps({k: stats[k] for k in ("exported", "skipped", "sightings_total", "by_app")}, indent=1))


if __name__ == "__main__":
    main()
