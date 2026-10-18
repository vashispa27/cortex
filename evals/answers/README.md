# Answer pipeline evaluation

This evaluates retrieval, the production evidence builder and citation validator together. The default provider is a gold-aware scripted mock: it copies a gold fact only if that fact survives in the correct sent source, otherwise it refuses. Its results verify plumbing, **not model quality**. It is not a simulated independent model. See the [mock report](../reports/answers/mock-pipeline.md).

```sh
cargo build -p rewind
target/debug/rewind eval-answers --mock --corpus evals/corpus \
  --gold evals/gold/gold.jsonl --out evals/answers/out/mock.json
```

Live evaluation requires an explicit `--live`, and is restricted to the verified frozen invented corpus and gold. Never supply private captures. The command does not start capture or open the live state directory. It creates a temporary index, injects the retrieval eval's clock, and uses `REWIND_MODEL_DIR` or the pinned model cache. The provider may be a remote service; the following command transmits invented evidence to it:

```sh
export REWIND_LLM_URL='https://your-provider.example/v1/chat/completions'
export REWIND_LLM_MODEL='your-model'
export REWIND_LLM_API_KEY='your-key' # optional when the provider does not require one
target/debug/rewind eval-answers --live --corpus evals/corpus \
  --gold evals/gold/gold.jsonl --out evals/answers/out/live.json
```

`--split dev|test|all` is optional. The JSON contains exact model messages and responses, so keep detailed output in the ignored `evals/answers/out/` directory and handle it as sensitive. Credentials are never recorded. There is no response cache; each live invocation incurs provider requests. Model call latency excludes preparation; total covers the question's retrieval through scoring preparation, and usage is recorded only when provided.

The same `prepare` function is used by `ask` and this command. It sends at most eight retrieval-ranked sources, preserves numeric snapshot IDs, includes observed/last-seen metadata, a bounded snippet and up to 2,500 characters of retrieved text per source, and redacts the question and all source content using the existing policy. Retrieved chunks, snippet and metadata visible in `prepared.sources` are exactly those inserted into the messages. Retrieval deduplication and version ordering occur before this boundary. On retrieval abstention or an empty result no request is built or sent. Unknown citation IDs and substantive answers without citations cause `ask` to fall back to ranked evidence. A narrow standalone refusal may omit citations.

`fact_state` compares each gold fact to the correct fixture's evidence: `retrieved`, `selected_before_redaction` and `sent_after_redaction` distinguish retrieval, selection/truncation and privacy losses. These exact checks lower-case and collapse whitespace; they do not equate paraphrases. `sensitive_placeholders` counts redacted credential and financial markers. Names, places, phone numbers, email addresses, and dates are sent, while common credential and financial patterns are masked. The pattern-based filter can miss sensitive data; monetary questions can become unanswerable by design.

Answer coverage is a heuristic: lower-case and normalize whitespace, numeric formats, certain dates and times, then accept exact text, all identifying numbers/tokens, or (for facts without such tokens) 75% of content-word stems. Dates drop their year in this answer scoring normalization; exact context checks retain it. Numeric near-miss, `wrong_text` version checks, absent/wrong abstention, unknown IDs, and per-fact cited-source matches are additional lexical signals. Optional `time_right` and `time_wrong` arrays on a gold question enable explicit capture-time/message-time probes. For multi-source cases, `each_gold_fact_in_its_cited_source` checks every required fixture separately. Citation support is labeled lexical, not proof that a claim follows from a source. Numbers or IDs can match for the wrong reason; paraphrases, negation, unsupported extra claims, ambiguous times, and mixed refusals can fool checks. Provider errors and invalid responses are separately reported and are never successful abstentions. Manual review is needed for answer quality and faithfulness.
