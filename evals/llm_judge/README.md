# Rewind answer evaluation with Jev

This folder grades the existing Rewind answer pipeline with TypeSafe Jev through OpenRouter. Gemini uses OpenRouter's **chat completions** endpoint; Jev uses its **Decisions API**. The script creates a fresh mock fixture run to check that every piece of evidence in the answer report exactly matches the current code's evidence for the frozen invented corpus. It does not start capture or access the live state directory.

## Set up

From the repository root:

```sh
cargo build -p rewind
export OPENROUTER_API_KEY='your-openrouter-key'
```

Alternatively, the script accepts the existing `REWIND_LLM_API_KEY` variable. Do not put keys in the output or source files.

## Grade your existing Gemini run

This sends the invented questions, expected facts, exact evidence Gemini saw, and Gemini's raw responses to Jev. It does **not** call Gemini again. Use only an unedited answer report produced from the frozen invented fixtures, stored under `evals/answers/out/` or `evals/llm_judge/out/`. Evidence is verified against a fresh fixture run; the authenticity of the raw answer in a manually modified report cannot be independently verified.

```sh
python3 evals/llm_judge/judge.py --live \
  --answers evals/answers/out/live_new_policy.json \
  --out evals/llm_judge/out/live-judged.json
```

To check the first five questions and limit Jev calls, add `--limit 5` and use a different output filename. A question stopped by retrieval is handled locally, with no judge request. A full run has at most one Jev request per model answer. The output is written incrementally, and a non-zero exit means at least one answer-provider or judge error occurred. Existing output files are not overwritten unless you explicitly pass `--overwrite`.

## Generate new Gemini answers and grade them

```sh
python3 evals/llm_judge/judge.py --live --generate \
  --answer-model google/gemini-2.5-flash \
  --judge-model typesafe/jev-1.14 \
  --out evals/llm_judge/out/new-judged.json
```

`--generate` runs the full fixture evaluation, potentially sending 112 requests to the answer model at current retrieval defaults, followed by Jev requests. `--limit` restricts only the Jev stage, **not** answer generation. The generated answer report is saved as `evals/llm_judge/out/generated-answers.json`; the script refuses to overwrite it without `--overwrite`. To compare another model, use `--answer-model <OpenRouter-model-id>` and save each result under a different filename. Model availability and pricing can change.

## What the grades mean

Jev makes separate choices about evidence sufficiency, answer quality and response behavior. The script combines them:

- **A:** correct and supported answer, including an appropriate refusal for a gold-absent question.
- **B:** partly correct, incomplete, or contains a material error alongside correct information.
- **C:** wrong or unsupported answer when evidence was sufficient; also an invented answer for a gold-absent question.
- **D:** a known-answer question for which Jev judges the actual sent evidence insufficient. A D also records whether the model refused, answered, or mixed both. It may be a retrieval, redaction, selection, truncation, or ambiguity issue; the `possible_evidence_failure` field is only a lexical diagnostic.

Retrieval abstentions and empty results never reach the answer model: gold-absent questions count as A and answerable questions as D, deterministically and without Jev. Provider failures, malformed Jev replies, and inconsistent judge results are **ungraded errors**, never D or correct abstentions. Counts and percentages use all graded questions as the denominator; error counts appear separately. `planned_questions` and `processed` make partial runs visible.

The model's **raw answer** is graded even if Rewind's citation validator rejects it and the user would see ranked evidence instead. `invalid_answer_fallbacks` and `grades_with_valid_citations_or_retrieval_refusal` are reported separately; do not interpret raw A as an answer delivered to the user when validation failed. Citation validity is still determined by the production validator, not by Jev.

Detailed records include the exact judge request, probabilities/confidence returned by Jev, answer and judge costs when supplied, and timing. The default output directory is git-ignored; keep it private. No API key is recorded. `--answers` input also contains evidence and responses and should be treated as sensitive. By default the fresh reference is removed after the run. The script checks frozen fixture files before any live request, but cannot prove the raw response in a manually altered report is invented. Do not use reports containing real captures or real personal information.

Jev's choices are estimates, not ground truth. Manually label a representative sample, including absent questions, D cases, multi-source and financial questions, and rejected citations, before trusting percentages. Its confidence is not a guarantee. The original gold facts can be incomplete, and D cause labels use strict lexical checks; review disputed cases. Evidence instructions are explicitly described as untrusted, but a judge can still be influenced by them. The test corpus is invented and results do not establish production accuracy.

## Offline tests

```sh
python3 -m unittest discover -s evals/llm_judge -v
```

Tests use scripted responses and do not call Gemini or Jev.
