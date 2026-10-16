import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../../control/server.mjs';
import { createGateway } from '../server.mjs';
import { createAuthenticator } from '../auth.mjs';
import { MockProvider } from '../provider.mjs';

async function setup(t, provider = new MockProvider(), limit = 3) {
  const control = createControl({ secret: 'control-secret-123456789', plans: { free: { request_limit: limit, features: ['rewrite', 'answer', 'extract', 'summarize', 'transcribe'] } } });
  await new Promise((resolve) => control.server.listen(0, '127.0.0.1', resolve));
  const gateway = createGateway({ controlUrl: `http://127.0.0.1:${control.server.address().port}`, controlSecret: 'control-secret-123456789', authenticate: createAuthenticator({ devMode: true, devToken: 'dev-token-123456789' }), provider });
  await new Promise((resolve) => gateway.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { gateway.server.close(); control.close(); });
  return `http://127.0.0.1:${gateway.server.address().port}`;
}
const headers = { authorization: 'Bearer dev-token-123456789', 'content-type': 'application/json', 'idempotency-key': 'unique-test-key-001' };
const example = { cloud_consent: true, text: 'When?', evidence: [{ id: 'source-1', text: 'Friday.' }] };

test('answer requires consent and valid auth', async (t) => {
  const base = await setup(t);
  const unauthorized = await fetch(`${base}/v1/inference/answer`, { method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body: JSON.stringify(example) });
  assert.equal(unauthorized.status, 401);
  const noConsent = await fetch(`${base}/v1/inference/answer`, { method: 'POST', headers, body: JSON.stringify({ ...example, cloud_consent: false }) });
  assert.equal(noConsent.status, 400);
  assert.equal((await noConsent.json()).error.code, 'consent_required');
});

test('validated answer cites only supplied source; retry does not re-bill', async (t) => {
  const base = await setup(t, new MockProvider(), 1);
  const request = () => fetch(`${base}/v1/inference/answer`, { method: 'POST', headers, body: JSON.stringify(example) });
  const first = await request();
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).result.evidence_ids, ['source-1']);
  const retry = await request();
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).error.code, 'duplicate_request');
});

test('invented citations are rejected and quota is released', async (t) => {
  const bad = { infer: async () => ({ output: { answer: 'Unsupported', evidence_ids: ['fake'], uncertainties: [] }, usage: { input_tokens: 1, output_tokens: 1 } }) };
  const base = await setup(t, bad, 1);
  const first = await fetch(`${base}/v1/inference/answer`, { method: 'POST', headers, body: JSON.stringify(example) });
  assert.equal(first.status, 502);
  assert.equal((await first.json()).error.code, 'ungrounded_source');
  const second = await fetch(`${base}/v1/inference/answer`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'unique-test-key-002' }, body: JSON.stringify(example) });
  assert.equal(second.status, 502);
});

test('stream emits typed completion after validation', async (t) => {
  const base = await setup(t);
  const res = await fetch(`${base}/v1/inference/answer`, { method: 'POST', headers: { ...headers, accept: 'text/event-stream' }, body: JSON.stringify(example) });
  assert.equal(res.status, 200);
  const stream = await res.text();
  assert.match(stream, /event: started/);
  assert.match(stream, /event: evidence/);
  assert.match(stream, /event: completed/);
});

test('credential-bearing context never reaches provider', async (t) => {
  let calls = 0;
  const provider = { infer: async () => { calls++; return { output: { answer: 'bad', evidence_ids: [], uncertainties: [] } }; } };
  const base = await setup(t, provider);
  const res = await fetch(`${base}/v1/inference/answer`, { method: 'POST', headers, body: JSON.stringify({ ...example, evidence: [{ id: 'source-1', text: 'password=super-secret-value' }] }) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'sensitive_input');
  assert.equal(calls, 0);
});
