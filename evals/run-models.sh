#!/bin/bash
# Run the gold set on the contextual archive with several OpenRouter models, one after another,
# judged by Jev each time. Edit MODELS to change the lineup. A failed model does not stop the rest.
#   evals/run-models.sh           # all questions for every model
#   evals/run-models.sh 20        # first 20 questions each (smoke test)
cd "$(dirname "$0")/.."
export EVAL_ARCHIVE="${EVAL_ARCHIVE:-$HOME/Library/Application Support/Rewind/eval-memory-context-haiku}"
MODELS=(
  anthropic/claude-haiku-5.5            # closed, cheap Anthropic
  openai/gpt-4.1-nano                   # closed, cheap OpenAI
  meta-llama/llama-3.3-70b-instruct     # open weights
  qwen/qwen3-235b-a22b-2507             # open weights, large
  mistralai/mistral-small-3.2-24b-instruct  # open weights
  openai/gpt-oss-120b                   # open weights, reasoning (may be slow)
)
STAMP="$(date +%m%d-%H%M)"
for m in "${MODELS[@]}"; do
  echo "=== $m ==="
  EVAL_CLOUD_MODEL="$m" EVAL_RUN="ctx-$(echo "$m" | tr '/' '-')_$STAMP" evals/run.sh "$@" || echo "FAILED: $m"
done
python3 evals/tools/model_table.py
