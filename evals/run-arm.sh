#!/bin/bash
# One arm of the label + routing comparison. Every arm uses structure-aware chunks
# (eval-memory-segments), Claude Haiku answering and Jev judging; only labels and routing change.
#   evals/run-arm.sh local     # labels + routing by the local model (mlx_lm.server on 127.0.0.1:8080)
#   evals/run-arm.sh cloud     # labels by Claude Haiku 4.5, routing by Claude Haiku 5.5 (OpenRouter)
#   evals/run-arm.sh control   # no labels, routing by rules only
#   evals/run-arm.sh local 25  # first 25 answer questions (smoke test)
# Steps: 1. labelled copy of eval-memory-segments (local/cloud; reused once finished, resumed if
# interrupted), 2. retrieval eval (no model, free), 3. routing eval on the labelled phrasings in
# apps/desktop/evals/decision/cases.ts (local/cloud), 4. answer eval + Jev.
# The answer eval calls the answer step directly, so routing is measured only in step 3.
# Cloud calls use the OpenRouter key saved by Cortex Settings.
set -euo pipefail
arm="${1:-}"; shift || true
root="$(cd "$(dirname "$0")/.." && pwd)"
data="$HOME/Library/Application Support/Cortex"
source="$data/eval-memory-segments"
key_file="$data/openrouter.key"
local_model="${LOCAL_MODEL:-mlx-community/gemma-4-e4b-it-4bit}"
endpoint="${LOCAL_ENDPOINT:-http://127.0.0.1:8080/v1}"
model_dir="${CORTEX_MODEL_DIR:-$data/local-memory/models/1e5a03f8eeb2c98b928fbbd846f22f816360919f}"
stamp="$(date +%m%d-%H%M)"
case "$arm" in
  local)   archive="$data/eval-memory-segments-context-${local_model##*/}"; route_model="$local_model"; tag="local-${local_model##*/}" ;;
  cloud)   archive="$data/eval-memory-segments-context-haiku-4.5"; route_model="anthropic/claude-haiku-5.5"; tag="cloud-haiku" ;;
  control) archive="$source"; route_model=""; tag="control" ;;
  *) echo "usage: evals/run-arm.sh local|cloud|control [question limit]" >&2; exit 2 ;;
esac

need_local() { curl -sf -m 3 "$endpoint/models" >/dev/null || { echo "local model server not reachable at $endpoint" >&2; exit 1; }; }

# Stop label generation if the Mac gets close to running out of memory.
watch_memory() {
  while sleep 5; do
    free=$(memory_pressure | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}')
    if [ -n "$free" ] && [ "$free" -lt 10 ]; then
      echo "only $free% memory free: stopping label generation" >&2
      pkill -f "cortex prepare-context-eval" || true
      return
    fi
  done
}

# 1. Labels
if [[ "$arm" != control && ! -f "$archive/.cortex-context-eval-ready" ]]; then
  if [[ "$arm" == local ]]; then
    need_local
    provider=(CORTEX_CONTEXT_PROVIDER=local CORTEX_CONTEXT_MODEL="$local_model" CORTEX_CONTEXT_URL="$endpoint/chat/completions")
  else
    [[ -s "$key_file" ]] || { echo "no OpenRouter key saved in Cortex Settings" >&2; exit 1; }
    provider=(CORTEX_CONTEXT_PROVIDER=openrouter CORTEX_CONTEXT_MODEL=anthropic/claude-haiku-4.5 CORTEX_CONTEXT_URL=https://openrouter.ai/api/v1/chat/completions)
  fi
  if [[ ! -d "$archive" ]]; then
    mkdir -m 700 "$archive"
    python3 - "$source" "$archive" <<'EOF' || { rm -rf "$archive"; exit 1; }
import sqlite3, shutil, sys, os
from contextlib import closing
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
# as_uri() escapes the space in "Application Support". immutable=1 opens the frozen WAL source
# without creating its -shm file (mode=ro can't), so the source is never touched.
with closing(sqlite3.connect(f"{(src / 'memory.sqlite3').as_uri()}?immutable=1", uri=True)) as a, closing(sqlite3.connect(dst / "memory.sqlite3")) as b:
    a.backup(b)
shutil.copy2(src / "captures.jsonl", dst / "captures.jsonl")
for f in ("memory.sqlite3", "captures.jsonl"): os.chmod(dst / f, 0o600)
(dst / ".cortex-context-eval-copy").write_text("Isolated copy for contextual retrieval evaluation.\n")
EOF
  fi
  log="$root/evals/private/context-generation-${tag}_$stamp.log"
  echo "1. writing labels ($tag), log: $log"
  watch_memory & watcher=$!
  env CORTEX_CONTEXT_ENABLED=1 CORTEX_CONTEXT_STRICT=1 CORTEX_CONTEXT_MAX_TOKENS=160 "${provider[@]}" \
    CORTEX_MODEL_DIR="$model_dir" RAYON_NUM_THREADS=2 OMP_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
    "$root/target/release/cortex" prepare-context-eval "$archive" >"$log" 2>&1 \
    || { kill $watcher 2>/dev/null; echo "label generation failed, see $log" >&2; exit 1; }
  kill $watcher 2>/dev/null || true
  tail -1 "$log"
elif [[ "$arm" == control ]]; then
  echo "1. labels: none (control)"
else
  echo "1. labels: reusing $archive"
fi

# 2. Retrieval
echo "2. retrieval eval"
CORTEX_MODEL_DIR="$model_dir" RAYON_NUM_THREADS=2 OMP_NUM_THREADS=2 python3 "$root/evals/tools/run_gold.py" \
  --archive "$archive" --gold "$root/evals/private/gold-v1.jsonl" \
  --out "$root/evals/private/retrieval_arm-${tag}.json"

# 3. Routing
if [[ -n "$route_model" ]]; then
  echo "3. routing eval ($route_model)"
  if [[ "$arm" == local ]]; then
    need_local
    (cd "$root/apps/desktop" && EVAL_LOCAL_ENDPOINT="$endpoint" EVAL_MODEL="$route_model" EVAL_RUN="arm-$tag-routing_$stamp" npm run eval:decision) || echo "routing eval failed or had false writes; see output above"
  else
    (cd "$root/apps/desktop" && OPENROUTER_API_KEY="$(cat "$key_file")" EVAL_MODEL="$route_model" EVAL_RUN="arm-$tag-routing_$stamp" npm run eval:decision) || echo "routing eval failed or had false writes; see output above"
  fi
else
  echo "3. routing: rules only (control), no model to evaluate"
fi

# 4. Answers
echo "4. answer eval: Haiku answering, Jev judging"
unset CORTEX_CONTEXT_ENABLED CORTEX_CONTEXT_IN_EVIDENCE EVAL_JUDGE_PROVIDER EVAL_JUDGE_MODEL EVAL_JUDGE_ENDPOINT
export EVAL_ARCHIVE="$archive" EVAL_JUDGE_KIND=jev
export EVAL_CLOUD_MODEL="${EVAL_CLOUD_MODEL:-anthropic/claude-haiku-5.5}"
export EVAL_RUN="${EVAL_RUN:-arm-${tag}_$stamp}"
"$root/evals/run.sh" "$@"
echo "results: evals/private/answers/$EVAL_RUN.report.md"
