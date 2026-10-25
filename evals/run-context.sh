#!/bin/bash
# Same answering model and Jev judge as the baseline; only retrieval input changes.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
archive="${EVAL_ARCHIVE:-$HOME/Library/Application Support/Cortex/eval-memory-context-haiku}"
if [[ ! -f "$archive/.cortex-context-eval-ready" ]]; then
  echo "Context archive is not ready: $archive" >&2
  exit 1
fi
export EVAL_ARCHIVE="$archive"
unset EVAL_CLOUD_MODEL CORTEX_CONTEXT_ENABLED CORTEX_CONTEXT_IN_EVIDENCE
export EVAL_LOCAL_MODEL="mlx-community/Qwen3.5-4B-MLX-4bit"
export EVAL_LOCAL_ENDPOINT="${EVAL_LOCAL_ENDPOINT:-http://127.0.0.1:8080/v1}"
unset EVAL_JUDGE_PROVIDER EVAL_JUDGE_MODEL EVAL_JUDGE_ENDPOINT
export EVAL_JUDGE_KIND=jev
export EVAL_RUN="${EVAL_RUN:-context-haiku_$(date +%m%d-%H%M%S)}"
exec "$root/evals/run.sh" "$@"
