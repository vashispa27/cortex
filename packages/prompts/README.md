# Prompt contracts

`index.mjs` holds versioned task rules and request/result validators for rewrite, answer, extract, summarize, and transcribe. The gateway strips unknown request fields before model egress, caps selected text/evidence/audio, and checks every model result against these validators. Cited evidence IDs must be among the supplied sources. Unsupported answer claims without a citation become an abstention. A narrow guard rejects newly introduced dates, amounts, and numbers; full factual grounding still requires evaluation with consented or synthetic examples.

Run `node --test packages/prompts/test/*.test.mjs`. Bump `PROMPT_VERSION` and add regression fixtures when a task prompt, schema, or grounding rule changes.
