# Gold-set answer evaluation

Runs `evals/private/gold.jsonl` through the app's real answer flow and scores the replies.
Nothing here touches your real memory: a throwaway engine runs in test mode on a **copy** of the eval archive.

How it works: `answers.eval.ts` runs the page's own `answerFromMemory` in Node. Its `invoke` calls go
(`tauri-shim.ts`) to `src-tauri/examples/eval_bridge.rs`, which runs the same shell commands the UI uses
(`openrouter_chat` with the `search_memory` tool loop, `openrouter_search_query`, `daemon_request`).
`judge.eval.ts` then scores the answers file.

## Run (from `apps/desktop`)

```bash
# once, or after Rust changes
(cd ../.. && cargo build --release -p rewind)
(cd src-tauri && cargo build --release --example eval_bridge)

# 1. answer every question (resumable; same EVAL_RUN continues where it stopped)
EVAL_RUN=sonnet-1 EVAL_MODEL=<openrouter model> EVAL_SPLIT=dev npm run eval:answers
#    local model instead: EVAL_PROVIDER=local EVAL_LOCAL_ENDPOINT=http://127.0.0.1:8080/v1 EVAL_LOCAL_MODEL=<name>

# 2. judge them
EVAL_RUN=sonnet-1 npm run eval:judge        # Jev (typesafe/jev) on OpenRouter by default
#    chat-model judge instead: EVAL_JUDGE_KIND=chat EVAL_JUDGE_MODEL=<model>
```

Results: `evals/private/answers/<run>.jsonl` (answers), `.judged.jsonl` (verdicts), `.report.md` (tables).
Filters for both steps: `EVAL_SPLIT=dev|test`, `EVAL_FAMILIES=a,b`, `EVAL_IDS=a001,a002`, `EVAL_LIMIT=10`.
The OpenRouter key is the one saved in the app (copied into the throwaway folder, deleted after the run). Use dev while tuning, test once at the end.

## What the judge checks
Per question: a verdict plus string checks. The default judge is Jev, TypeSafe's classifier on OpenRouter
(`~typesafe/jev-latest`, set another with `EVAL_JUDGE_MODEL`). It is not a chat model: the bridge calls
`POST /api/alpha/decisions` with the reply as `state` and typed questions: a three-way choice
(correct / partial / incorrect, with a rubric per expected behavior) and yes/no checks (right kind of reply,
states a wrong answer, states every required fact). It returns probabilities, not prose, so the report shows a
confidence and lists low-confidence verdicts instead of a reason. String checks: required facts present, a known wrong answer mentioned, SOURCE tag
matches the expected behavior, support snapshot cited. The report lists questions where the string check and
the judge disagree; read those by hand before trusting the judge.

## Privacy
The judge input contains the question, reference facts (which can include emails and phone numbers) and the
reply. With Jev or any OpenRouter judge that text leaves this Mac; use `EVAL_JUDGE_KIND=chat
EVAL_JUDGE_PROVIDER=local` to keep it local.
