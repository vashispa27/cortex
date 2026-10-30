#!/bin/bash
# Fine-tune a LoRA adapter for intent routing on evals/routing/train.jsonl, on this Mac.
#   evals/routing/train.sh            # Gemma 4 E4B, 2 passes over the data (~40 min)
#   ITERS=40 evals/routing/train.sh   # quick check
# Writes the adapter to evals/routing/adapters/<model>/ (gitignored). Stop mlx_lm.server first: training
# needs the memory. Training stops by itself if free memory drops under 10%; rerun with
# RESUME=1 to continue from the last saved checkpoint.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
model="${MODEL:-mlx-community/gemma-4-e4b-it-4bit}"
adapter="$root/evals/routing/adapters/${model##*/}"
iters="${ITERS:-1240}"   # 618 training rows x 2 passes

if curl -sf -m 2 http://127.0.0.1:8080/v1/models >/dev/null; then
  echo "mlx_lm.server is running on port 8080; stop it first (training needs the memory)" >&2; exit 1
fi
node "$root/evals/routing/to-mlx.cjs"
mkdir -p "$adapter"
resume=()
[[ "${RESUME:-}" == 1 && -f "$adapter/adapters.safetensors" ]] && resume=(--resume-adapter-file "$adapter/adapters.safetensors")

# Stop training if the Mac gets close to running out of memory.
watch_memory() {
  while sleep 3; do
    free=$(memory_pressure | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}')
    if [ -n "$free" ] && [ "$free" -lt 10 ]; then
      echo "only $free% memory free: stopping training (rerun with RESUME=1 to continue)" >&2
      pkill -f "mlx_lm.lora" || true
      return
    fi
  done
}
watch_memory & watcher=$!
trap 'kill $watcher 2>/dev/null || true' EXIT

# --mask-prompt: learn only the answer, not the context. --grad-checkpoint and batch 1 keep memory down.
~/.venvs/rewind-mlx/bin/mlx_lm.lora --model "$model" --train --data "$root/evals/routing/mlx" \
  --fine-tune-type lora --num-layers 16 --mask-prompt --batch-size 1 --grad-checkpoint \
  --iters "$iters" --learning-rate 1e-4 --max-seq-length 1536 \
  --steps-per-report 20 --steps-per-eval 200 --val-batches 25 --save-every 200 \
  --adapter-path "$adapter" ${resume[@]+"${resume[@]}"}
echo "adapter: $adapter"
