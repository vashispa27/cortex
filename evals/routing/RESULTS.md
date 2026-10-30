# Routing fine-tune results

Gemma 4 E4B (`mlx-community/gemma-4-e4b-it-4bit`) was fine-tuned with LoRA to make Cortex's routing
decision: one `decide` tool call per message. Both models were scored on the same 300 rows of
`test.jsonl`, with `upcoming_days` in the context.

| | Untrained | Fine-tuned |
|---|---|---|
| Correct | 43% (129) | 79% (237) |
| Right action | 57% (172) | 83% (248) |
| Wrong writes | 17 | 15 |
| Invalid outputs | 79 | 0 |
| Asked when it should have acted | 4 | 38 |
| Latency p50 / p90 | 1689 / 3398 ms | 1746 / 2447 ms |

Full reports, including per-kind scores and every wrong write, are in
`apps/desktop/evals/decision/out/gemma-baseline-v2.md` and `gemma-finetuned-v2.md`; the `.json` files
next to them hold per-row results.

Known weaknesses of the fine-tuned model:

- It over-asks. 31 of 54 one-off reminders got a needless question, such as am/pm when it was given, or
  "is that 85 minutes from now?". 35% of the added training rows are follow-up questions, against 17% in
  the test set.
- It picks one of two similar reminders instead of asking which one (6 wrong writes).

## The adapter

`adapters/gemma-4-e4b-it-4bit-v2/` holds the MLX LoRA adapter, its config and the training log.

- Training: 1,634 rows from `train.jsonl` via `to-mlx.cjs`, with 166 held out by scenario.
- Settings: 818 steps at batch 4 on a RunPod A40 (MLX CUDA), 16 layers, learning rate 1e-4, masked
  prompts.
- It was trained with the one-line `ROUTER_SHORT_PROMPT`, so evaluate it with `EVAL_PROMPT=short`.

Serve and score it:

```bash
~/.venvs/rewind-mlx/bin/mlx_lm.server --model mlx-community/gemma-4-e4b-it-4bit --adapter-path evals/routing/adapters/gemma-4-e4b-it-4bit-v2 --host 127.0.0.1 --port 8080 --max-tokens 512 --chat-template-args '{"enable_thinking":false}'
cd apps/desktop && EVAL_LOCAL_ENDPOINT=http://127.0.0.1:8080/v1 EVAL_MODEL=mlx-community/gemma-4-e4b-it-4bit EVAL_ADAPTER=../../evals/routing/adapters/gemma-4-e4b-it-4bit-v2 EVAL_PROMPT=short npm run eval:routing
```

`mlx_lm.server` ignores `--adapter-path` for requests that name a model, which is why the eval also sends
the adapter with each request (`EVAL_ADAPTER`).
