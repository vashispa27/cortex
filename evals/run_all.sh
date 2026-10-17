#!/bin/bash
# The one command for evals and latency. Everything it reads and writes lives inside this repository.
#
#   evals/run_all.sh                 build, then run invented + real (quality and latency), print numbers, record history
#   evals/run_all.sh invented        only the invented corpus      (about 15 s)
#   evals/run_all.sh real            only the real corpus          (about 2 min; needs evals/private)
#   evals/run_all.sh bench           invented corpus + 1,000 synthetic distractors: latency/size at a larger index
#   evals/run_all.sh all             invented + real + bench
#   options: --no-build  --note "what changed"      EXTRA="--param key=value" passes eval options through
#
# Inputs are frozen: before each run `evals/freeze.py verify` must pass (see evals/RUNNING.md).
# Isolation: eval indexes are built in throwaway directories under evals/.work (set via TMPDIR), never in
# ~/Library/Application Support/Open Memory, and are deleted afterwards.
# Outputs: reports in evals/reports/runs (invented, bench) and evals/private/reports/runs (real);
# one tracked row per run in evals/history/runs.csv  (view: python3 evals/history.py).
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)
BUILD=1; WHICH=both; NOTE=""
while [ $# -gt 0 ]; do
  case $1 in
    --no-build) BUILD=0 ;;
    --note) shift; NOTE=${1:-} ;;
    invented|real|bench|both|all) WHICH=$1 ;;
    *) echo "unknown argument $1 (see header of evals/run_all.sh)"; exit 2 ;;
  esac
  shift
done
case $WHICH in
  both) RUN_INVENTED=1; RUN_REAL=1; RUN_BENCH=0 ;;
  all) RUN_INVENTED=1; RUN_REAL=1; RUN_BENCH=1 ;;
  invented) RUN_INVENTED=1; RUN_REAL=0; RUN_BENCH=0 ;;
  real) RUN_INVENTED=0; RUN_REAL=1; RUN_BENCH=0 ;;
  bench) RUN_INVENTED=0; RUN_REAL=0; RUN_BENCH=1 ;;
esac
if [ $RUN_REAL = 1 ] && [ ! -d evals/private/corpus ]; then
  echo "skip real: evals/private/corpus missing (it is local-only; see evals/RUNNING.md)"; RUN_REAL=0
fi

# 1. frozen inputs
[ $RUN_INVENTED = 1 ] || [ $RUN_BENCH = 1 ] && python3 evals/freeze.py verify invented
[ $RUN_REAL = 1 ] && python3 evals/freeze.py verify real

# 2. build
[ $BUILD = 1 ] && cargo build --release -p open-memory
BIN=$ROOT/target/release/open-memory
if [ ! -x "$BIN" ]; then echo "no release binary; run without --no-build"; exit 2; fi
if [ -n "$(find crates -name '*.rs' -newer "$BIN" 2>/dev/null | head -1)" ]; then
  echo "WARNING: sources are newer than $BIN; the numbers are for the old binary (rerun without --no-build)"
  NOTE="$NOTE [stale binary]"
fi

# 3. isolation: scratch state lives in the repo, never in the live state directory
export TMPDIR=$ROOT/evals/.work
rm -rf "$TMPDIR"; mkdir -p "$TMPDIR"
trap 'rm -rf "$ROOT/evals/.work"/open-memory-eval-* 2>/dev/null || true' EXIT
unset OPEN_MEMORY_STATE_DIR

STAMP=$(date +%Y%m%d-%H%M%S)
SHA=$(git rev-parse --short HEAD)
git diff --quiet HEAD -- crates || SHA="$SHA+dirty"

run() {  # run LABEL CORPUS GOLD OUTDIR DATASET [extra eval options...]
  local label=$1 corpus=$2 gold=$3 dir=$4 set=$5; shift 5
  mkdir -p "$dir"
  local prev; prev=$(ls -t "$dir"/*-"$label".json 2>/dev/null | head -1 || true)
  local out="$dir/$STAMP-$label.json"
  echo "== $label eval @ $SHA  (frozen set $set) -> ${out#$ROOT/}"
  "$BIN" eval --corpus "$corpus" --gold "$gold" --query-repeats 5 --out "$out" "$@" ${EXTRA:-} 2>&1 | grep -v "^ *ingested" || true
  python3 evals/tools/run_summary.py "$out" ${prev:+"$prev"}
  python3 evals/tools/record_run.py "$out" "$label" --note "$NOTE" --dataset-id "$set" --commit "$SHA"
}

if [ $RUN_INVENTED = 1 ]; then
  run invented evals/corpus evals/gold/gold.jsonl evals/reports/runs "$(python3 evals/freeze.py id invented)"
fi
if [ $RUN_REAL = 1 ]; then
  run real evals/private/corpus evals/private/gold.jsonl evals/private/reports/runs "$(python3 evals/freeze.py id real)"
fi
if [ $RUN_BENCH = 1 ]; then
  B=evals/.work/topical-1k
  if [ ! -d $B ]; then
    echo "== generating the 1,000-page synthetic distractor set (deterministic, seed 7)"
    ALSO=""; [ -f evals/private/gold.jsonl ] && ALSO="--also-gold evals/private/gold.jsonl"
    python3 evals/scale/gen_distractors.py --seed 7 $ALSO --n 1000 --no-hard --out $B > /dev/null
  fi
  run bench evals/corpus evals/gold/gold.jsonl evals/reports/runs "$(python3 evals/freeze.py id invented)+1k" --extra-corpus $B
fi
echo
python3 evals/history.py --last 4
