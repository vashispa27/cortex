# Control service

Private metadata service for Cortex. It stores account IDs, devices, plan/consent metadata, a monthly request ledger, and billing event IDs in SQLite. It never accepts or stores captured text, retrieved evidence, prompts, audio, or provider responses.

Run with `GF_CONTROL_SECRET=<random-secret-at-least-16-chars> node server.mjs`. The default listener is `127.0.0.1:8788`; set `GF_CONTROL_DB` for its SQLite path. Every `/internal/*` request needs `Authorization: Bearer <GF_CONTROL_SECRET>`. Keep this listener private in deployment.

`GF_PLANS_FILE` may point to JSON such as `{ "free": { "request_limit": 100, "features": ["rewrite", "answer"] } }`. Limits are monthly request counts, not prices. No paid plan or price is supplied by default. `GF_RELEASES_FILE` is an optional map keyed by `channel/platform`; absent entries return 404. Only populate it with uploaded, signed artifacts.

The HMAC webhook at `/internal/billing/webhook` is a generic integration point gated by `GF_BILLING_WEBHOOK_SECRET`, not a checkout provider. It accepts `{event_id,account_id,plan,occurred_at}` with `x-signature-sha256` over the exact JSON bytes. Duplicate events are ignored and older plan events cannot roll back newer state. Checkout and portal integrations require a real billing provider.
