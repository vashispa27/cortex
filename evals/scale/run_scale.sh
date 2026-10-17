#!/bin/bash
# Scale series. Usage: evals/scale/run_scale.sh BIN OUTDIR [points...]
# Points: inv-base inv-hard inv-real inv-1k inv-10k inv-10k-hard inv-real-10k-hard inv-100k
#         real-base real-1k real-10k real-mut real-100k
# Inputs under evals/scale/out and evals/private (generate them first, see evals/scale/README.md).
set -u
BIN=$1; OUT=$2; shift 2
cd "$(dirname "$0")/../.."
mkdir -p "$OUT"
S=evals/scale/out
INV_GOLD=${INV_GOLD:-evals/gold/gold.jsonl}
REAL_GOLD=evals/private/gold.jsonl

combo() {  # combo NAME DIR...  -> symlink farm
  local name=$1; shift
  rm -rf "$S/$name"; mkdir -p "$S/$name"
  for d in "$@"; do for f in "$d"/*.json; do b=$(basename "$f"); [ "${b:0:1}" = "_" ] && continue; ln -s "$(cd "$(dirname "$f")" && pwd)/$b" "$S/$name/$b"; done; done
}

run() {  # run NAME CORPUS GOLD [EXTRA]
  local name=$1 corpus=$2 gold=$3 extra=${4:-}
  echo "== $name $(date +%T)"
  local args=(eval --corpus "$corpus" --gold "$gold" --query-repeats 5 --out "$OUT/$name.json" ${EXTRA:-})
  [ -n "$extra" ] && args+=(--extra-corpus "$extra")
  /usr/bin/time -l "$BIN" "${args[@]}" > "$OUT/$name.log" 2> "$OUT/$name.time"
  grep -E "maximum resident|real" "$OUT/$name.time" | head -2
  uptime | sed 's/.*load/load/'
}

for p in "$@"; do
  case $p in
    inv-base) run inv-base evals/corpus $INV_GOLD ;;
    inv-hard) run inv-hard evals/corpus $INV_GOLD $S/hard-only ;;
    inv-real) run inv-real evals/corpus $INV_GOLD evals/private/haystack ;;
    inv-1k) run inv-1k evals/corpus $INV_GOLD $S/topical-1k ;;
    inv-10k) run inv-10k evals/corpus $INV_GOLD $S/topical-10k ;;
    inv-10k-hard) combo c-10k-hard $S/topical-10k $S/hard-only; run inv-10k-hard evals/corpus $INV_GOLD $S/c-10k-hard ;;
    inv-real-10k-hard) combo c-real-10k-hard evals/private/haystack $S/topical-10k $S/hard-only; run inv-real-10k-hard evals/corpus $INV_GOLD $S/c-real-10k-hard ;;
    inv-100k) run inv-100k evals/corpus $INV_GOLD $S/topical-100k ;;
    real-base) run real-base evals/private/corpus $REAL_GOLD ;;
    real-1k) run real-1k evals/private/corpus $REAL_GOLD $S/topical-1k ;;
    real-10k) run real-10k evals/private/corpus $REAL_GOLD $S/topical-10k ;;
    real-mut) run real-mut evals/private/corpus $REAL_GOLD $S/mutreal-1k ;;
    real-100k) run real-100k evals/private/corpus $REAL_GOLD $S/topical-100k ;;
    *) echo "unknown point $p" ;;
  esac
done
