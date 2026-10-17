# Mock answer pipeline verification

Run on 17 October 2026 with the frozen invented corpus (dataset `c2c26900d7e0`). This is a gold-aware scripted mock, **not an LLM quality or faithfulness score**. Exact records, prompts and answers are in the ignored `evals/answers/out/mock-final.json` from this run.

| Measure | Result |
| --- | ---: |
| Questions | 124 |
| Answerable questions | 102 |
| All gold facts found in retrieved evidence, before abstention/redaction | 99/102 |
| All gold facts in the actual sent context | 41/102 |
| Answerable questions with a selected fact lost to redaction | 57/102 |
| Retrieval abstentions, all questions | 12/124 |
| Absent questions with a scripted or retrieval refusal | 22/22 |
| Provider errors / invalid citations | 0 / 0 |

The gold-aware mock returns gold facts only when they appear in the sent sources, so its coverage of 41/102 is expected from the context selection and says nothing about model correctness. Different names and titles collapse into `[PERSON_OR_TITLE]`; the 57 loss count is an exact-string measure and includes facts lost partly or entirely to redaction. Retrieval abstention also prevents some requests. The existing retrieval eval uses its own hit definition and reports hit@8 of 98/102; the definitions are not interchangeable.

Observed p50/p95 in this local mock run, in milliseconds: retrieval 27.30/39.12, preparation 55.25/57.91, mock call 0.00/0.12, total 122.80/154.88. Total also includes the evaluation's lexical scoring, and these single-run timings include local load; they are not live-provider latency. No live model was called.
