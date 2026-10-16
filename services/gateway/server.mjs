import http from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAuthenticator } from './auth.mjs';
import { CompatibleProvider, MockProvider } from './provider.mjs';
import { sensitiveCategory } from './privacy.mjs';
import { ContractError, TASKS, validateRequest, validateOutput } from '../../packages/prompts/index.mjs';

function reply(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); res.end(JSON.stringify(value)); }
function fail(res, status, code, message) { reply(res, status, { error: { code, message } }); }
async function body(req, limit) {
  let n = 0; const chunks = [];
  for await (const chunk of req) { n += chunk.length; if (n > limit) throw Object.assign(new Error('Payload too large'), { status: 413, code: 'payload_too_large' }); chunks.push(chunk); }
  try { return { bytes: Buffer.concat(chunks), json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400, code: 'invalid_json' }); }
}
function event(res, type, data) { res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); }
function streamText(res, text) { for (const part of text.match(/.{1,80}/gs) || []) event(res, 'token', { text: part }); }

export function createGateway({ controlUrl = 'http://127.0.0.1:8788', controlSecret, authenticate, provider, signingKey, keyId = 'dev-ephemeral' } = {}) {
  if (!controlSecret) throw new Error('Control service secret required');
  if (!authenticate || !provider) throw new Error('Authenticator and provider required');
  const controlAddress = new URL(controlUrl);
  if (controlAddress.protocol !== 'https:' && !(controlAddress.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(controlAddress.hostname))) throw new Error('Control service must use HTTPS or loopback HTTP');
  const key = signingKey || generateKeyPairSync('ed25519').privateKey;
  const internal = async (path, method = 'GET', value, extraHeaders = {}) => {
    const response = await fetch(new URL(path, controlUrl), { method, headers: { authorization: `Bearer ${controlSecret}`, ...(value !== undefined ? { 'content-type': 'application/json' } : {}), ...extraHeaders }, body: value !== undefined ? JSON.stringify(value) : undefined, redirect: 'error', signal: AbortSignal.timeout(5_000) });
    const data = await response.json(); return { status: response.status, data };
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://gateway.local');
    let streamed = false;
    try {
      if (url.pathname === '/health' && req.method === 'GET') return reply(res, 200, { status: 'ok' });
      if (url.pathname === '/v1/billing/webhook' && req.method === 'POST') {
        const signature = req.headers['x-signature-sha256'];
        if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return fail(res, 401, 'bad_signature', 'A signed billing event is required');
        const { bytes } = await body(req, 64_000);
        const response = await fetch(new URL('/internal/billing/webhook', controlUrl), { method: 'POST', headers: { authorization: `Bearer ${controlSecret}`, 'content-type': 'application/json', 'x-signature-sha256': signature }, body: bytes, redirect: 'error', signal: AbortSignal.timeout(5_000) });
        return reply(res, response.status, await response.json());
      }
      const identity = await authenticate(req.headers.authorization);
      if (url.pathname === '/v1/account/entitlements' && req.method === 'GET') {
        const result = await internal(`/internal/entitlements?account_id=${encodeURIComponent(identity.sub)}`);
        if (result.status !== 200) return reply(res, result.status, result.data);
        const payload = Buffer.from(JSON.stringify(result.data));
        const signature = sign(null, payload, key).toString('base64url');
        return reply(res, 200, { entitlements: result.data, signature, signature_alg: 'Ed25519', key_id: keyId });
      }
      if (url.pathname === '/v1/devices/register' && req.method === 'POST') {
        const { json } = await body(req, 4_096);
        const result = await internal('/internal/devices/register', 'POST', { account_id: identity.sub, device_id: json.device_id, platform: json.platform });
        return reply(res, result.status, result.data);
      }
      if (url.pathname === '/v1/billing/checkout' || url.pathname === '/v1/billing/portal') return fail(res, 503, 'billing_unconfigured', 'Billing provider is not configured');
      const release = url.pathname.match(/^\/v1\/releases\/([^/]+)\/([^/]+)$/);
      if (release && req.method === 'GET') {
        const result = await internal(`/internal/releases/${encodeURIComponent(release[1])}/${encodeURIComponent(release[2])}`);
        return reply(res, result.status, result.data);
      }
      const match = url.pathname.match(/^\/v1\/inference\/(rewrite|answer|extract|summarize|transcribe)$/);
      if (!match || req.method !== 'POST') return fail(res, 404, 'not_found', 'Unknown route');
      const task = match[1];
      if (!req.headers['content-type']?.startsWith('application/json')) return fail(res, 415, 'unsupported_media_type', 'JSON required');
      const idempotency = req.headers['idempotency-key'];
      if (typeof idempotency !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotency)) return fail(res, 400, 'idempotency_required', 'A unique Idempotency-Key is required');
      const maxBytes = task === 'transcribe' ? 2_700_000 : 70_000;
      const { json } = await body(req, maxBytes);
      const input = validateRequest(task, json);
      if (sensitiveCategory(input)) return fail(res, 400, 'sensitive_input', 'Potential credential or payment identifier in selected context');
      const reservationKey = createHash('sha256').update(`${identity.sub}\0${idempotency}`).digest('hex');
      const reserved = await internal('/internal/quota/reserve', 'POST', { account_id: identity.sub, key: reservationKey, task });
      if (reserved.status !== 200) return reply(res, reserved.status, reserved.data);
      let settled = false;
      const abort = new AbortController();
      const cancel = () => abort.abort();
      const timeout = setTimeout(cancel, 90_000);
      req.on('aborted', cancel); res.on('close', () => { if (!res.writableEnded) cancel(); });
      const wantsStream = req.headers.accept?.includes('text/event-stream');
      if (wantsStream) { res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' }); streamed = true; event(res, 'started', { task }); }
      try {
        const result = await provider.infer(task, input, abort.signal);
        if (abort.signal.aborted) throw Object.assign(new Error('Cancelled'), { status: 499, code: 'cancelled' });
        const output = validateOutput(task, input, result.output);
        const usage = result.usage || { input_tokens: 0, output_tokens: 0 };
        const settledResult = await internal('/internal/quota/settle', 'POST', { key: reservationKey, input_tokens: Math.max(0, Math.floor(usage.input_tokens || 0)), output_tokens: Math.max(0, Math.floor(usage.output_tokens || 0)) });
        if (settledResult.status !== 200) throw Object.assign(new Error('Unable to settle quota'), { status: 503, code: 'quota_unavailable' });
        settled = true;
        if (wantsStream) {
          const text = output.replacement_text ?? output.answer ?? output.summary ?? output.transcript ?? '';
          if (text) streamText(res, text);
          if (output.evidence_ids?.length) event(res, 'evidence', { ids: output.evidence_ids });
          event(res, 'completed', { result: output }); res.end();
        } else reply(res, 200, { result: output });
      } catch (err) {
        if (!settled) await internal('/internal/quota/cancel', 'POST', { key: reservationKey }).catch(() => {});
        const code = abort.signal.aborted ? 'cancelled' : (err.code || 'inference_failed');
        const status = abort.signal.aborted ? 499 : (err.status || 502);
        if (wantsStream) { event(res, code === 'cancelled' ? 'cancelled' : 'error', { code }); res.end(); }
        else fail(res, status, code, code === 'cancelled' ? 'Request cancelled' : 'Inference failed');
      } finally { clearTimeout(timeout); }
    } catch (err) {
      const status = err instanceof ContractError ? 400 : (err.status || 503);
      const code = err instanceof ContractError ? err.code : (err.code || (status === 401 ? 'unauthorized' : 'service_unavailable'));
      if (streamed) { event(res, 'error', { code }); res.end(); }
      else fail(res, status, code, status === 401 ? 'Authentication required' : (err instanceof ContractError ? err.message : 'Request failed'));
    }
  });
  return { server };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const devMode = process.env.GF_DEV_MODE === '1';
  const authenticate = createAuthenticator({ devMode, devToken: process.env.GF_DEV_TOKEN || '', issuer: process.env.GF_OIDC_ISSUER, audience: process.env.GF_OIDC_AUDIENCE, jwksUrl: process.env.GF_OIDC_JWKS_URL });
  const provider = devMode && (process.env.GF_PROVIDER_MODE || 'mock') === 'mock' ? new MockProvider() : new CompatibleProvider({ baseUrl: process.env.GF_PROVIDER_BASE_URL, allowedOrigin: process.env.GF_PROVIDER_ALLOWED_ORIGIN, apiKey: process.env.GF_PROVIDER_API_KEY, models: { inline: process.env.GF_MODEL_INLINE, answer: process.env.GF_MODEL_ANSWER, structured: process.env.GF_MODEL_STRUCTURED, speech: process.env.GF_MODEL_SPEECH } });
  const signingKey = process.env.GF_ENTITLEMENT_PRIVATE_KEY_FILE ? readFileSync(process.env.GF_ENTITLEMENT_PRIVATE_KEY_FILE) : undefined;
  if (!devMode && !signingKey) throw new Error('GF_ENTITLEMENT_PRIVATE_KEY_FILE is required outside dev mode');
  const gateway = createGateway({ controlUrl: process.env.GF_CONTROL_URL || 'http://127.0.0.1:8788', controlSecret: process.env.GF_CONTROL_SECRET, authenticate, provider, signingKey, keyId: process.env.GF_ENTITLEMENT_KEY_ID || (devMode ? 'dev-ephemeral' : 'production') });
  const host = process.env.GF_GATEWAY_HOST || '127.0.0.1';
  gateway.server.listen(Number(process.env.GF_GATEWAY_PORT || 8787), host, () => process.stdout.write(`Gateway listening on ${host}:${gateway.server.address().port}\n`));
}
