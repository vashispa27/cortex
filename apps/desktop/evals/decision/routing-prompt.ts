// The system prompt for a model fine-tuned on evals/routing/train.jsonl. The fine-tuned model learns the
// rules from the examples, so it gets one line instead of DECIDE_SYSTEM_PROMPT (about 1,000 tokens), which
// keeps training within a 16 GB Mac and makes each call faster. The tool schema and context stay the same.
export const ROUTER_SHORT_PROMPT = "You route messages for Cortex, a personal memory app. Call the decide tool exactly once with the action for the user's latest message, using the context.";
