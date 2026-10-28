#!/usr/bin/env python3
"""Build eval-memory-segments from eval-memory without modifying eval-memory.

Copies the eval archive's SQLite file (a consistent backup, raw trees included) into a new marked directory,
then runs `cortex segment-archive` on the copy: the stored raw trees are re-ingested through the item path
(CORTEX_SEGMENTS) in observation order, snapshot ids and observations are kept, and the index is rebuilt.
Prints the before/after counts as JSON. Needs `cargo build --release -p cortex`. No network: the pinned
embedding model is read from the Hugging Face cache (or CORTEX_MODEL_DIR).

  python3 evals/tools/prepare_segment_archive.py
  python3 evals/tools/prepare_segment_archive.py --force      # rebuild an existing copy
  python3 evals/tools/prepare_segment_archive.py --keep-ads   # eval-memory-segments-ads: promoted posts kept as items
"""
import argparse, os, shutil, sqlite3, subprocess, sys
from contextlib import closing
from pathlib import Path

REV = "1e5a03f8eeb2c98b928fbbd846f22f816360919f"


def main():
    root = Path.home() / "Library/Application Support/Cortex"
    repo = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=root / "eval-memory")
    ap.add_argument("--output", type=Path, default=root / "eval-memory-segments")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--keep-ads", action="store_true", help="CORTEX_SEGMENTS_ADS=1: keep promoted posts; builds eval-memory-segments-ads")
    args = ap.parse_args()
    if args.keep_ads and args.output == root / "eval-memory-segments":
        args.output = root / "eval-memory-segments-ads"
    source, output = args.source.resolve(), args.output.resolve()
    if source != root / "eval-memory" or output not in (root / "eval-memory-segments", root / "eval-memory-segments-ads"):
        sys.exit("only eval-memory -> eval-memory-segments[-ads] is permitted")
    marker = output / ".cortex-segments-copy"
    if output.exists():
        if not marker.is_file():
            sys.exit(f"{output} exists and is not a marked segments copy")
        if not args.force:
            sys.exit(f"{output} exists; pass --force to rebuild it")
        shutil.rmtree(output)
    output.mkdir(mode=0o700)
    try:
        with closing(sqlite3.connect((source / "memory.sqlite3").as_uri() + "?mode=ro", uri=True)) as src, closing(sqlite3.connect(output / "memory.sqlite3")) as dst:
            src.backup(dst)
        os.chmod(output / "memory.sqlite3", 0o600)
        if (source / "captures.jsonl").is_file():
            shutil.copy2(source / "captures.jsonl", output / "captures.jsonl")
        marker.write_text("Copy of the eval archive re-ingested through the item path (CORTEX_SEGMENTS).\n")
    except BaseException:
        shutil.rmtree(output)
        raise
    env = dict(os.environ, CORTEX_SEGMENTS="1", CORTEX_SEGMENTS_ADS="1" if args.keep_ads else "0", RAYON_NUM_THREADS="2", OMP_NUM_THREADS="2", TOKENIZERS_PARALLELISM="false")
    cache = Path.home() / ".cache/huggingface/hub/models--minishlab--potion-base-32M/snapshots" / REV
    env.setdefault("CORTEX_MODEL_DIR", str(cache))
    env.pop("CORTEX_LLM_URL", None)
    result = subprocess.run([str(repo / "target/release/cortex"), "segment-archive", str(output)], env=env)
    if result.returncode:
        sys.exit(result.returncode)


if __name__ == "__main__":
    main()
