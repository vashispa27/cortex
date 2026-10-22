#!/bin/bash
# One command: ask Rewind every gold question using the local model, then judge the answers with Jev.
#   evals/run.sh          # all questions
#   evals/run.sh dev      # dev split only (or: test)
#   evals/run.sh 5        # first 5 questions (smoke test)
# Cloud instead: EVAL_CLOUD_MODEL=<openrouter model> evals/run.sh
# Needs the local model server running (mlx_lm.server on 127.0.0.1:8080).
# Override: EVAL_LOCAL_MODEL=<name> EVAL_LOCAL_ENDPOINT=<url>.
set -e
case "${1:-}" in
  dev|test) export EVAL_SPLIT="$1" ;;
  "") ;;
  *) export EVAL_LIMIT="$1" ;;
esac
if [ -n "${EVAL_CLOUD_MODEL:-}" ]; then
  # Cloud: Rewind answers through OpenRouter with your saved key, e.g. EVAL_CLOUD_MODEL=anthropic/claude-haiku-5.5
  export EVAL_PROVIDER=openrouter EVAL_MODEL="$EVAL_CLOUD_MODEL"
  KIND="cloud-$(echo "$EVAL_CLOUD_MODEL" | tr '/' '-')"
else
  export EVAL_PROVIDER=local
  export EVAL_LOCAL_ENDPOINT="${EVAL_LOCAL_ENDPOINT:-http://127.0.0.1:8080/v1}"
  export EVAL_LOCAL_MODEL="${EVAL_LOCAL_MODEL:-mlx-community/Qwen3.5-2B-4bit}"
  curl -sf -m 3 "$EVAL_LOCAL_ENDPOINT/models" >/dev/null || { echo "local model server not reachable at $EVAL_LOCAL_ENDPOINT"; exit 1; }
  KIND="local-${EVAL_LOCAL_MODEL##*/}"
fi
export EVAL_GOLD="${EVAL_GOLD:-$(cd "$(dirname "$0")" && pwd)/private/gold-v1.jsonl}"   # the 309-question set
# run name says where and with what model it ran, e.g. local-Qwen3.5-4B-MLX-4bit_1019-2300
export EVAL_RUN="${EVAL_RUN:-${KIND}_$(date +%m%d-%H%M)}"
cd "$(dirname "$0")/../apps/desktop"
npm run eval:answers
npm run eval:judge
python3 ../../evals/tools/side_by_side.py "$EVAL_RUN" >/dev/null
echo "side by side: evals/private/answers/$EVAL_RUN.compare.md"
echo "report: evals/private/answers/$EVAL_RUN.report.md"
