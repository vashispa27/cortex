import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createControl } from '../server.mjs';

test('quota reservation is unique, bounded, and cancellable', async (t) => {
  const control = createControl({ secret: 'test-secret-123456789', plans: { free: { request_limit: 1, features: ['answer'] } } });
  await new Promise((resolve) => control.server.listen(0, '127.0.0.1', resolve));
  t.after(() => control.close());
  const base = `http://127.0.0.1:${control.server.address().port}`;
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: 'POST', headers: { authorization: 'Bearer test-secret-123456789', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  assert.equal((await post('/internal/quota/reserve', { account_id: 'user:1', key: 'k1', task: 'answer' })).status, 200);
  assert.equal((await post('/internal/quota/reserve', { account_id: 'user:1', key: 'k1', task: 'answer' })).body.error.code, 'duplicate_request');
  assert.equal((await post('/internal/quota/reserve', { account_id: 'user:1', key: 'k2', task: 'answer' })).status, 429);
  assert.equal((await post('/internal/quota/cancel', { key: 'k1' })).status, 200);
  assert.equal((await post('/internal/quota/reserve', { account_id: 'user:1', key: 'k2', task: 'answer' })).status, 200);
  assert.equal((await post('/internal/quota/settle', { key: 'k2', input_tokens: 5, output_tokens: 2 })).status, 200);
});

test('billing event retries and out-of-order delivery cannot duplicate or reverse plan', async (t) => {
  const control = createControl({ secret: 'test-secret-123456789', webhookSecret: 'webhook-secret-123456789', plans: { free: { request_limit: 1, features: ['answer'] }, pro: { request_limit: 10, features: ['answer'] } } });
  await new Promise((resolve) => control.server.listen(0, '127.0.0.1', resolve));
  t.after(() => control.close());
  const base = `http://127.0.0.1:${control.server.address().port}`;
  const sendEvent = async (event) => {
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', 'webhook-secret-123456789').update(body).digest('hex');
    const res = await fetch(base + '/internal/billing/webhook', { method: 'POST', headers: { authorization: 'Bearer test-secret-123456789', 'content-type': 'application/json', 'x-signature-sha256': signature }, body });
    return res.json();
  };
  const current = { event_id: 'evt_new', account_id: 'account-1', plan: 'pro', occurred_at: 200 };
  assert.equal((await sendEvent(current)).status, 'applied');
  assert.equal((await sendEvent(current)).status, 'duplicate');
  assert.equal((await sendEvent({ event_id: 'evt_old', account_id: 'account-1', plan: 'free', occurred_at: 100 })).status, 'stale');
  const res = await fetch(base + '/internal/entitlements?account_id=account-1', { headers: { authorization: 'Bearer test-secret-123456789' } });
  assert.equal((await res.json()).plan, 'pro');
});
