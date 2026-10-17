# Task: build answer-quality evals for the open-memory LLM answer step

You are working in `/Users/abhinavvashisht/workspace/goldfish-implementation` (Rust workspace, macOS-only crate `crates/open-memory`). Retrieval already has an eval harness (`evals/`). Nothing measures the generation step: `ask` with `OPEN_MEMORY_LLM_URL` set sends redacted retrieved evidence to an OpenAI-compatible chat endpoint (`llm_answer` in `crates/open-memory/src/main.rs`) and prints the model's answer above the ranked evidence. Your job is to measure that step: is the answer faithful to the evidence, are citations valid, does it abstain when it should, and are numbers and times right.

Read first: `evals/README.md`, `evals/reports/baseline-analysis.md`, `README.md` (the LLM section and redaction notes), spec sections 8.5 and 16.4 in `goldfish-end-to-end-spec.md`, then `llm_answer`, `redact_cloud`, `snippet`, `retrieve`, and the eval code.

## Coordination with the fixes agent (important)

Another agent is fixing retrieval at the same time (`docs/rag-fixes-agent-prompt.md`) and will change `retrieve`, `snippet`, and the evidence passed to `llm_answer` (Fix 2 passes several chunks per snapshot), plus abstention behavior (Fix 3).

- Work on your own git branch in a separate worktree (`git worktree add ../goldfish-answer-eval -b evals-answer-quality`).
- Put your code in new files (for example `crates/open-memory/src/answer_eval.rs` and `evals/answers/`). For `llm_answer`, make only a small additive refactor: split it into (a) building the prompt from `(question, sources)` and (b) sending it and parsing the reply, so the eval can call (a) and a provider function with an injected endpoint. Do not change prompts, evidence selection or redaction behavior in this task. Keep the refactor minimal so it merges cleanly after the fixes land; say so in the commit message.
- The system prompt currently reads "Answer only from the supplied evidence. Cite snapshot IDs in square brackets..." Measure it as is. Prompt improvements are a later task, driven by your results.
- Report which fixes-agent commit you measured against.

## Safety and data rules (hard)

- Only the **invented** corpus and gold set may be sent to a model. Never use the user's real state directory (`~/Library/Application Support/Open Memory/local-memory`) or any private captured data. Do not enable capture or request Accessibility permission.
- LLM endpoints, models and keys come only from environment variables: `OPEN_MEMORY_LLM_URL`, `OPEN_MEMORY_LLM_MODEL`, `OPEN_MEMORY_LLM_API_KEY` for the answer model, and a separate trio with the prefix `OPEN_MEMORY_JUDGE_` for the judge. Never hardcode or print keys. The existing rule allows only HTTPS or localhost HTTP endpoints; keep it.
- All tests must run without network access using a mock provider (a local HTTP server or an injected function that returns scripted replies). Live-model runs are opt-in and require the user to set the variables.
- The user decides which model generates and which judges. If the variables are unset, build and test everything with the mock and stop at "ready to run live"; say what the user needs to set.

## What to measure

Per gold question (invented corpus), run retrieval, build the evidence exactly as `ask` would, call the answer model, then score:

**Automatic checks (no judge):**
- `contains_answer`: the generated answer contains the gold `answer_text` (normalized; allow equivalent number formats you define explicitly, such as "1,687" vs "1687").
- `citations_valid`: every `[id]` the model cites is in the retrieved set shown to it; report the rate of invented IDs, and the rate of answers with no citation at all.
- `citation_supports`: for each cited ID, does that snapshot's text contain the claimed answer string (cheap lexical version), reported separately from the judge.
- `abstained`: for `absent` questions, did the model say the evidence is insufficient (detect with a defined phrase set plus judge confirmation), and did it still state a made-up fact.
- `wrong_abstention`: for answerable questions where the evidence contained the answer, did it wrongly refuse.
- Numeric exactness: every number in the answer that is also in the gold `answer_text` must match exactly (no 138 for 137).
- Version handling: for `near_duplicate_version` and contradictory-fact questions, does the answer use the right (latest) version, and does it mention the conflict when the evidence conflicts? Use the optional gold field `wrong_text` where present.
- Time handling: does the answer confuse the capture/observation time with a message time shown in the text? Build a small set of questions that probe this and score it with explicit rules.
- Redaction effect: `redact_cloud` replaces names, emails and URLs with placeholders before sending. Measure how often redaction removes information the question needs (for example answers that are person names or titles), by running the same questions with redaction on and off against the mock-free invented corpus, and report the accuracy gap.

**Judge-based checks (opt-in, live):**
- Claim-level faithfulness: split the answer into atomic claims, then for each claim ask the judge whether the cited snapshot text supports it (supported, unsupported, contradicted). Report claim-level support rate (spec gate: at least 95%), and per question type.
- Completeness and correctness against the gold answer.
- Keep the judge prompt, rubric, and temperature in versioned files under `evals/answers/judge/`. Use JSON-structured outputs and reject unparsable replies (count them).

**Judge calibration (required before trusting the judge):**
- Sample about 50 answers (stratified: supported, unsupported, partly supported, abstentions) and produce a CSV/Markdown sheet for the user to hand-label. Build a tool that compares the judge to the human labels and reports agreement (accuracy, Cohen's kappa, confusion matrix). Do not claim judge-based numbers are reliable until this is done; mark every judge number "uncalibrated" in reports until the user supplies labels.

## Test set

Reuse `evals/gold/gold.jsonl` (do not edit it; the fixes agent owns it) and add answer-specific questions in your own file `evals/answers/extra_gold.jsonl` in the same schema, covering: multi-fact answers, answers that need two snapshots, questions where the evidence conflicts, questions with a plausible but wrong value in a distractor, adversarial evidence (a captured page that says "ignore previous instructions and ..." in its text, to check that the model treats evidence as untrusted data), and time-confusion probes. All invented. Keep dev/test splits.

## Harness

Add `open-memory eval-answers --corpus ... --gold ... [--extra-gold ...] --out evals/reports/answers/<name>.json` (or a Python driver that calls a thin Rust JSON mode; choose the simpler one that keeps the model loading once). It must:
- reuse the existing deterministic ingest and fixed clock,
- cache model replies keyed by (model, prompt hash) in a gitignored directory so reruns are cheap and reproducible, and record the cache hit rate,
- record per question: retrieved IDs, the exact prompt sent (after redaction), the raw reply, all automatic scores, the judge verdicts and cost/latency,
- write a markdown summary with overall and per-type numbers and counts alongside percentages. With small n, call differences of one or two questions noise. Add a paired bootstrap for comparing runs, reusing `evals/tools/compare.py` where it fits.

## Deliverables

1. Code, tests with the mock provider (including tests for the citation checker, number matching, abstention detection, the prompt-injection probe handling, and cache behavior), all passing under `cargo test --workspace`.
2. `evals/answers/` with the extra gold file, judge prompts and rubric, calibration sheet generator and comparison tool, and an `evals/answers/README.md` explaining how to run mock and live evals and what to set.
3. A mock-provider run report committed under `evals/reports/answers/` (clearly labeled as mock, not a quality result) so the pipeline is shown to work end to end.
4. If the user has set the live variables: a live run on the invented corpus, with the judge numbers marked uncalibrated until labels exist. If not, say clearly that no live run was done and what is needed.
5. A final message: what exists, how to run it, what the first live results show (or what is pending), and suggested prompt or evidence-format improvements to test next, ranked by expected impact.

Commits small and descriptive on your branch only; do not merge into the fixes agent's branch. Tell the user the merge order and expected conflicts (especially around `llm_answer`).

Stop and ask the user before: sending anything to a live model, touching real captured data, adding a dependency, changing the answer prompt, evidence selection or redaction behavior, or enabling capture.
