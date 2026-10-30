# Prompt: fine-tune the routing model on RunPod, baseline on the Mac in parallel

Repo: `/Users/abhinavvashisht/workspace/cortex` on the user's Mac (Apple M5, 16 GB). You have the RunPod
MCP. Two jobs that run at the same time:

1. **RunPod:** fine-tune Gemma 4 E4B for Cortex's intent routing on the new, larger training data.
2. **Mac, while that trains:** score the untrained Gemma on the test set again, because the context the
   model sees changed (it now includes `upcoming_days`), so the old baseline no longer compares.

Then bring the trained result back and score it on the Mac.

## What is being trained

Cortex sends every user message through a routing step. The model gets a short instruction, the
`decide` tool definition, and a context (current time, the next 8 dates, existing reminders, saved
facts, recent chat). It must answer with one `decide` tool call: an action (create/change/cancel a
reminder, save a fact, answer from memory) or a follow-up question when something is missing.

- Training data: `evals/routing/train.jsonl` (1,800 rows). **Never train on `evals/routing/test.jsonl`**:
  it is the test set.
- `evals/routing/mlx/train.jsonl` (1,634) and `valid.jsonl` (166, whole scenarios held out) are already
  generated from it by `node evals/routing/to-mlx.cjs`. Check the counts and that the user messages
  contain `upcoming_days`; if not, rerun `to-mlx.cjs`. Use the files exactly as generated: don't
  change the prompt, context or answers. Each line is
  `{"tools": [...], "messages": [system, user, assistant tool_call]}`; the system message is the
  one-line `ROUTER_SHORT_PROMPT` (`apps/desktop/evals/decision/routing-prompt.ts`).
- The setup is the same as `evals/routing/train.sh`: `mlx_lm.lora` on
  `mlx-community/gemma-4-e4b-it-4bit`, LoRA on 16 layers, `--mask-prompt` (learn only the answer),
  max sequence 1536, learning rate 1e-4, about 2 passes over the data.

## Job 1: train on RunPod

The previous run worked this way: MLX with CUDA on an A40 at $0.59/hr, 310 steps at batch 4 in about
11 minutes. Do the same.

1. **Ask first.** Tell the user the GPU type and hourly price and wait for their OK before creating the
   pod. One pod, the cheapest that fits (the A40 worked; a 24 GB card such as an RTX 4090 or A5000 should
   too). Expected cost is a few dollars. Stop and ask if it will go above $10.
2. Move only the two files in `evals/routing/mlx/` to the pod, plus a training script you write. No
   other repo files, no keys from the Mac.
3. `pip install "mlx[cuda]" mlx-lm`, then do a 10-step run to confirm the GPU is used.
4. Train: `--batch-size 4`, `--iters 818` (2 × 1,634 / 4), `--steps-per-eval 100`,
   `--save-every 100`, other settings as in `train.sh`. Keep the log; the validation loss should
   fall and then level off. If it rises for two evaluations in a row, use the last checkpoint before it
   rose and say so.
5. **Only if MLX CUDA fails:** LoRA-train `google/gemma-4-e4b-it` with PEFT/TRL on exactly the same
   messages and tools, rendered with the model's own chat template, loss on the answer only, same
   settings. Merge, then convert to MLX 4-bit with `mlx_lm.convert -q`. If a Hugging Face token is needed,
   ask the user; never print it or write it into a file in the repo.
6. Bring the result back:
   - MLX route: `evals/routing/adapters/gemma-4-e4b-it-4bit-v2/` (`adapters.safetensors`,
     `adapter_config.json`, and the training log).
   - PyTorch route: a full MLX model folder at `evals/routing/models/gemma-4-e4b-routing-4bit-v2/`.

   Don't overwrite `evals/routing/adapters/gemma-4-e4b-it-4bit/`, which holds the first fine-tune.
   Both `adapters/` and `models/` must be gitignored; add `evals/routing/models/` if needed.
7. **Terminate the pod** (not just stop it) and confirm no pods or volumes are left. Note the total cost.

## Job 2: untrained baseline on the Mac (while job 1 trains)

Start this as soon as the pod is training. Make sure nothing is running on port 8080, then serve plain
Gemma (no adapter):

```bash
~/.venvs/rewind-mlx/bin/mlx_lm.server --model mlx-community/gemma-4-e4b-it-4bit --host 127.0.0.1 --port 8080 --max-tokens 512 --prompt-cache-size 1 --chat-template-args '{"enable_thinking":false}'
```

Run all 300 test rows with the full rules prompt (no `EVAL_PROMPT`, no `EVAL_ADAPTER`):

```bash
cd apps/desktop && EVAL_LOCAL_ENDPOINT=http://127.0.0.1:8080/v1 EVAL_MODEL=mlx-community/gemma-4-e4b-it-4bit EVAL_RUN=gemma-baseline-v2 npm run eval:routing
```

This writes `apps/desktop/evals/decision/out/gemma-baseline-v2.md` and `.json`. Then stop the server.

## Then: score the trained model on the Mac

Only after the baseline has finished and its server is stopped (the Mac runs one model at a time).
Serve the base model with the new adapter:

```bash
~/.venvs/rewind-mlx/bin/mlx_lm.server --model mlx-community/gemma-4-e4b-it-4bit --adapter-path evals/routing/adapters/gemma-4-e4b-it-4bit-v2 --host 127.0.0.1 --port 8080 --max-tokens 512 --prompt-cache-size 1 --chat-template-args '{"enable_thinking":false}'
```

`mlx_lm.server` ignores `--adapter-path` for requests that name the model, so the eval sends the adapter
with each request (`EVAL_ADAPTER`). Without it you are scoring untrained Gemma. Run 20 rows first, and
check they look trained (valid `decide` calls, not the baseline's mistakes), then all 300:

```bash
cd apps/desktop && EVAL_LOCAL_ENDPOINT=http://127.0.0.1:8080/v1 EVAL_MODEL=mlx-community/gemma-4-e4b-it-4bit EVAL_ADAPTER=../../evals/routing/adapters/gemma-4-e4b-it-4bit-v2 EVAL_PROMPT=short EVAL_LIMIT=20 EVAL_RUN=gemma-finetuned-v2-check npm run eval:routing
cd apps/desktop && EVAL_LOCAL_ENDPOINT=http://127.0.0.1:8080/v1 EVAL_MODEL=mlx-community/gemma-4-e4b-it-4bit EVAL_ADAPTER=../../evals/routing/adapters/gemma-4-e4b-it-4bit-v2 EVAL_PROMPT=short EVAL_RUN=gemma-finetuned-v2 npm run eval:routing
```

For the PyTorch route, serve the model folder with `--model` and no `--adapter-path`, and set
`EVAL_MODEL` to that folder without `EVAL_ADAPTER`. Stop the server afterwards.

## Rules

- Don't change app code, the routing data, `author.py`, `to-mlx.cjs`, the short prompt or the eval
  scripts. If something blocks you, stop and report it.
- Don't train on `test.jsonl` and don't tune settings by looking at test results.
- One model loaded on the Mac at a time. Never touch real Cortex memory.
- Don't commit or push.

## Report back

- Training: route used, GPU type, training time, validation loss at the start, at each evaluation and
  at the end, which checkpoint you kept, total RunPod cost, and confirmation that the pod is terminated.
- Where the result is on the Mac.
- One table from the output files in `apps/desktop/evals/decision/out/`: correct, right action, wrong
  writes, invalid outputs, and the per-kind scores, for:
  - untrained, old context (`gemma-baseline.md`): 46% correct, 61% right action, 19 wrong writes;
  - first fine-tune (`gemma-finetuned.md`): 71% correct, 79% right action, 70 wrong writes;
  - untrained, new context (`gemma-baseline-v2.md`);
  - second fine-tune (`gemma-finetuned-v2.md`).
- The wrong writes of the second fine-tune, grouped: should have asked, wrong time or date, other.
- Report only what the logs and output files show.
