#!/bin/bash
# One command: build, run the eval on the invented corpus and (if evals/private exists) on the real corpus,
# save timestamped reports, and print the key numbers next to the previous run.
#
#   evals/run_all.sh              both corpora
#   evals/run_all.sh invented     only the invented corpus
#   evals/run_all.sh real         only the real corpus
#   evals/run_all.sh --no-build   skip cargo build
#   EXTRA="--param rerank_bonus=off" evals/run_all.sh   pass extra eval options (applied to both)
#
# Reports: evals/reports/runs/<stamp>-invented.{json,md}   and   evals/private/reports/runs/<stamp>-real.{json,md}
# Compare two runs in detail:  python3 evals/tools/compare.py OLD.json NEW.json
set -eu
cd "$(dirname "$0")/.."
BUILD=1; WHICH=both
for a in "$@"; do
  case $a in
    --no-build) BUILD=0 ;;
    invented|real|both) WHICH=$a ;;
    *) echo "unknown argument $a"; exit 2 ;;
  esac
done
[ $BUILD = 1 ] && cargo build --release -p open-memory
BIN=target/release/open-memory
STAMP=$(date +%Y%m%d-%H%M%S)
SHA=$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- crates 2>/dev/null || echo "+dirty")

run() {  # run LABEL CORPUS GOLD OUTDIR
  local label=$1 corpus=$2 gold=$3 dir=$4
  mkdir -p "$dir"
  local prev; prev=$(ls -t "$dir"/*-"$label".json 2>/dev/null | head -1 || true)
  local out="$dir/$STAMP-$label.json"
  echo "== $label eval ($SHA) -> $out"
  "$BIN" eval --corpus "$corpus" --gold "$gold" --out "$out" ${EXTRA:-} 2>&1 | grep -v "^ *ingested" || true
  python3 evals/tools/run_summary.py "$out" ${prev:+"$prev"}
}

if [ $WHICH != real ]; then
  run invented evals/corpus evals/gold/gold.jsonl evals/reports/runs
fi
if [ $WHICH != invented ]; then
  if [ -d evals/private/corpus ] && [ -f evals/private/gold.jsonl ]; then
    run real evals/private/corpus evals/private/gold.jsonl evals/private/reports/runs
  else
    echo "skip real: evals/private/corpus or gold.jsonl missing (see evals/README.md)"
  fi
fi
