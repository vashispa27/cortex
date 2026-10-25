# Inference gateway

The gateway authenticates an account, checks explicit cloud consent, validates bounded task schemas, reserves a monthly request, calls one allowlisted model deployment, validates source IDs, and settles usage. Request and response bodies are never written to the control database. No shared response cache is used. It emits JSON by default or typed server-sent events (`started`, `token`, `evidence`, `completed`, `error`, `cancelled`) when `Accept: text/event-stream` is sent. Text tokens are emitted after output validation; clients display the validated `completed` response.

## Local synthetic run

In two terminals, using the same secret:

```sh
GF_CONTROL_SECRET='replace-with-a-long-random-secret' node services/control/server.mjs
GF_CONTROL_SECRET='replace-with-a-long-random-secret' GF_DEV_MODE=1 GF_DEV_TOKEN='replace-with-a-long-dev-token' node services/gateway/server.mjs
```

The dev token is fixed to the synthetic account `dev:local`; mock inference makes no factual claims beyond supplied examples. Dev mode is not a sign-in system and must never be exposed publicly. Both services bind loopback by default.

```sh
curl -sS http://127.0.0.1:8787/v1/inference/answer \
  -H 'Authorization: Bearer replace-with-a-long-dev-token' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: answer-demo-001' \
  --data '{"cloud_consent":true,"text":"When was the review?","evidence":[{"id":"synthetic-1","text":"The review is on Friday."}]}'
```

## Production configuration

Set `GF_OIDC_ISSUER`, `GF_OIDC_AUDIENCE`, `GF_OIDC_JWKS_URL`, `GF_PROVIDER_BASE_URL`, `GF_PROVIDER_ALLOWED_ORIGIN`, `GF_PROVIDER_API_KEY`, `GF_MODEL_ANSWER`, `GF_MODEL_STRUCTURED`, `GF_ENTITLEMENT_PRIVATE_KEY_FILE`, `GF_ENTITLEMENT_KEY_ID`, `GF_CONTROL_SECRET`, and `GF_CONTROL_URL`. OIDC tokens must be acquired by the desktop client through system-browser authorization code plus PKCE and state validation; this gateway verifies signed access tokens. The provider URL is HTTPS and must match the configured origin exactly. Redirects are rejected. A reverse proxy must provide TLS and disable request-body logging, tracing, and content-bearing exception reports. Confirm the actual provider contract before making retention claims.

`GET /v1/account/entitlements` returns a short-lived Ed25519-signed entitlement object. The client must pin the public key out of band for offline verification; the ephemeral dev key is only useful during one process lifetime. `POST /v1/devices/register` accepts `{device_id,platform}` and binds it to the bearer subject. `GET /v1/releases/{channel}/{platform}` returns a configured release manifest or 404. No release artifact is configured by default.

Billing checkout and portal return 503 until a real billing provider is integrated. The public webhook route forwards the exact signed body to the control service's generic HMAC contract; configure a provider adapter and shared webhook secret before relying on it. This prevents presenting a fake checkout flow. The service currently limits monthly request count; production cost controls should also enforce provider token and audio budgets at account level.
