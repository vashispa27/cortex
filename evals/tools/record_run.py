#!/usr/bin/env python3
"""Append one eval report's headline and latency numbers to evals/history/runs.csv (tracked in git; aggregates only).

  record_run.py REPORT.json CORPUS [--note TEXT] [--dataset-id ID] [--commit SHA] [--date YYYY-MM-DD HH:MM]
CORPUS is invented | real | bench. Latency columns use the per-query best of the repeats when the report has it
(robust against machine load), else the plain distribution."""
import argparse, csv, datetime, json, os, subprocess

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CSV = os.path.join(ROOT, "evals", "history", "runs.csv")
COLS = ["date", "commit", "dirty", "corpus", "dataset_id", "answerable", "hit1", "hit8", "mrr", "chunk_hit40", "lost_at_final",
        "absent", "absent_abstained", "wrongly_abstained", "near_dup_share", "lat_p50_ms", "lat_p95_ms", "lat_p99_ms", "latency_basis",
        "ingest_s", "index_mb", "note"]


def row(report, corpus, note, dataset_id, commit=None, date=None):
    r = json.load(open(report))
    o = r["overall"]; f = o["final_level"]; a = o["abstention"]; t = r["timing"]
    best = t.get("query_latency_best_of_repeats_ms")
    lat = best or t["query_latency_ms"]
    ab = a.get("absent_queries_abstained")
    meta = r["meta"]
    return {
        "date": date or datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "commit": (commit or meta.get("git_commit") or "")[:8],
        "dirty": int(bool(meta.get("git_dirty_in_inputs"))),
        "corpus": corpus, "dataset_id": dataset_id,
        "answerable": o["n_answerable"], "hit1": f["hit@1"]["count"], "hit8": f["hit@k"]["count"], "mrr": f["mrr"],
        "chunk_hit40": o["chunk_level"]["hit"]["@40"]["count"], "lost_at_final": f["chunk_hit_but_final_miss"]["count"],
        "absent": o["n_absent"], "absent_abstained": ab["count"] if ab else 0,
        "wrongly_abstained": a.get("answerable_wrongly_abstained", {}).get("count", 0),
        "near_dup_share": o["near_duplicate_crowding"]["jaccard_0.8"]["slots_near_duplicate"]["rate"],
        "lat_p50_ms": lat.get("p50"), "lat_p95_ms": lat.get("p95"), "lat_p99_ms": lat.get("p99", ""),
        "latency_basis": "best_of_repeats" if best else "all_samples",
        "ingest_s": round(t["ingest_ms"] / 1000, 1), "index_mb": round((t.get("index_allocated_bytes") or t.get("index_size_bytes") or 0) / 1e6),
        "note": note,
    }


def append(rw):
    new = not os.path.exists(CSV)
    os.makedirs(os.path.dirname(CSV), exist_ok=True)
    with open(CSV, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        if new:
            w.writeheader()
        w.writerow(rw)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("report"); ap.add_argument("corpus")
    ap.add_argument("--note", default=""); ap.add_argument("--dataset-id", default="")
    ap.add_argument("--commit"); ap.add_argument("--date")
    a = ap.parse_args()
    append(row(a.report, a.corpus, a.note, a.dataset_id, a.commit, a.date))
