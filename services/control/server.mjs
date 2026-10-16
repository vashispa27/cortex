import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLANS = Object.freeze({ free: { request_limit: 100, features: ['rewrite', 'answer', 'extract', 'summarize'] } });
function send(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); }
function error(res, status, code, message) { send(res, status, { error: { code, message } }); }
function equalSecret(a, b) { const x = Buffer.from(a || ''); const y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }
function safeId(x, max = 200) { return typeof x === 'string' && x.length > 0 && x.length <= max && /^[A-Za-z0-9_.:@/-]+$/.test(x); }
async function readBody(req, max = 64_000) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) throw Object.assign(new Error('Body too large'), { status: 413 }); chunks.push(chunk); }
  const raw = Buffer.concat(chunks);
  try { return { raw, value: JSON.parse(raw.toString('utf8')) }; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

export function createControl({ dbPath = ':memory:', secret, plans = DEFAULT_PLANS, webhookSecret = '', releases = {} } = {}) {
  if (!secret || secret.length < 16) throw new Error('GF_CONTROL_SECRET must contain at least 16 characters');
  if (!plans.free || Object.values(plans).some((p) => !Number.isInteger(p.request_limit) || p.request_limit < 0 || !Array.isArray(p.features) || p.features.some((f) => !['rewrite','answer','extract','summarize','transcribe'].includes(f)))) throw new Error('Invalid plan configuration');
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'free', consent_version TEXT, plan_event_time INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), platform TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS usage (key TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), task TEXT NOT NULL, period TEXT NOT NULL, status TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_usage_account_period ON usage(account_id, period, status);
    CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, account_id TEXT NOT NULL, applied INTEGER NOT NULL);
  `);
  const now = () => Date.now();
  const period = () => new Date().toISOString().slice(0, 7);
  const ensure = (accountId) => {
    if (!safeId(accountId)) throw Object.assign(new Error('Invalid account ID'), { status: 400 });
    db.prepare('INSERT OR IGNORE INTO accounts(id,created_at) VALUES (?,?)').run(accountId, now());
    return db.prepare('SELECT * FROM accounts WHERE id=?').get(accountId);
  };
  const transaction = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (err) { db.exec('ROLLBACK'); throw err; } };
  const entitlements = (accountId) => {
    const account = ensure(accountId);
    const plan = plans[account.plan] || plans.free;
    const counts = db.prepare("SELECT COUNT(*) AS n FROM usage WHERE account_id=? AND period=? AND status IN ('pending','settled')").get(accountId, period());
    return { account_id: accountId, plan: account.plan, features: plan.features, request_limit: plan.request_limit, requests_used_or_reserved: counts.n, period: period(), expires_at: new Date(now() + 5 * 60_000).toISOString(), consent_version: account.consent_version };
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (!equalSecret(req.headers.authorization, `Bearer ${secret}`)) return error(res, 401, 'unauthorized', 'Internal service token required');
      const url = new URL(req.url, 'http://control.local');
      if (url.pathname === '/internal/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
      if (url.pathname === '/internal/account/ensure' && req.method === 'POST') {
        const { value } = await readBody(req);
        const account = ensure(value.account_id);
        return send(res, 200, { account_id: account.id, plan: account.plan });
      }
      if (url.pathname === '/internal/account/consent' && req.method === 'POST') {
        const { value } = await readBody(req);
        if (!safeId(value.account_id) || !safeId(value.version, 80)) return error(res, 400, 'invalid_request', 'Invalid consent update');
        ensure(value.account_id);
        db.prepare('UPDATE accounts SET consent_version=? WHERE id=?').run(value.version, value.account_id);
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/internal/entitlements' && req.method === 'GET') {
        return send(res, 200, entitlements(url.searchParams.get('account_id')));
      }
      if (url.pathname === '/internal/devices/register' && req.method === 'POST') {
        const { value } = await readBody(req);
        if (!safeId(value.account_id) || !safeId(value.device_id, 128) || !['macos', 'windows'].includes(value.platform)) return error(res, 400, 'invalid_request', 'Invalid device');
        ensure(value.account_id);
        const prior = db.prepare('SELECT account_id FROM devices WHERE id=?').get(value.device_id);
        if (prior && prior.account_id !== value.account_id) return error(res, 409, 'device_account_mismatch', 'Device already belongs to another account');
        db.prepare('INSERT INTO devices(id,account_id,platform,created_at,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen, platform=excluded.platform').run(value.device_id, value.account_id, value.platform, now(), now());
        return send(res, 200, { device_id: value.device_id, account_id: value.account_id });
      }
      if (url.pathname === '/internal/quota/reserve' && req.method === 'POST') {
        const { value } = await readBody(req);
        if (!safeId(value.account_id) || !safeId(value.key, 128) || !safeId(value.task, 30)) return error(res, 400, 'invalid_request', 'Invalid reservation');
        const result = transaction(() => {
          const account = ensure(value.account_id);
          const plan = plans[account.plan] || plans.free;
          if (!plan.features.includes(value.task)) return { status: 403, code: 'feature_unavailable' };
          // A crashed gateway must not hold a request slot indefinitely.
          db.prepare("UPDATE usage SET status='cancelled' WHERE status='pending' AND created_at<?").run(now() - 10 * 60_000);
          const old = db.prepare('SELECT * FROM usage WHERE key=?').get(value.key);
          if (old) return { status: old.account_id === value.account_id && old.task === value.task ? 409 : 409, code: old.account_id === value.account_id && old.task === value.task ? 'duplicate_request' : 'idempotency_conflict', state: old.status };
          const count = db.prepare("SELECT COUNT(*) AS n FROM usage WHERE account_id=? AND period=? AND status IN ('pending','settled')").get(value.account_id, period()).n;
          if (count >= plan.request_limit) return { status: 429, code: 'quota_exhausted' };
          db.prepare("INSERT INTO usage(key,account_id,task,period,status,created_at) VALUES (?,?,?,?,'pending',?)").run(value.key, value.account_id, value.task, period(), now());
          return { status: 200, code: 'reserved' };
        });
        return send(res, result.status, result.status === 200 ? { reservation: result.code } : { error: { code: result.code, message: result.code, state: result.state } });
      }
      if (url.pathname === '/internal/quota/settle' && req.method === 'POST') {
        const { value } = await readBody(req);
        if (!safeId(value.key, 128) || !Number.isInteger(value.input_tokens) || value.input_tokens < 0 || !Number.isInteger(value.output_tokens) || value.output_tokens < 0) return error(res, 400, 'invalid_request', 'Invalid settlement');
        const result = db.prepare("UPDATE usage SET status='settled', input_tokens=?, output_tokens=? WHERE key=? AND status='pending'").run(value.input_tokens, value.output_tokens, value.key);
        if (result.changes === 0) return error(res, 409, 'not_pending', 'Reservation is not pending');
        return send(res, 200, { settled: true });
      }
      if (url.pathname === '/internal/quota/cancel' && req.method === 'POST') {
        const { value } = await readBody(req);
        if (!safeId(value.key, 128)) return error(res, 400, 'invalid_request', 'Invalid reservation key');
        db.prepare("UPDATE usage SET status='cancelled' WHERE key=? AND status='pending'").run(value.key);
        return send(res, 200, { cancelled: true });
      }
      if (url.pathname === '/internal/billing/webhook' && req.method === 'POST') {
        if (!webhookSecret) return error(res, 503, 'billing_unconfigured', 'Billing integration is unavailable');
        const { raw, value } = await readBody(req);
        const signature = createHmac('sha256', webhookSecret).update(raw).digest('hex');
        if (!equalSecret(req.headers['x-signature-sha256'], signature)) return error(res, 401, 'bad_signature', 'Invalid webhook signature');
        if (!safeId(value.event_id, 128) || !safeId(value.account_id) || !plans[value.plan] || !Number.isSafeInteger(value.occurred_at)) return error(res, 400, 'invalid_request', 'Invalid billing event');
        const result = transaction(() => {
          if (db.prepare('SELECT id FROM billing_events WHERE id=?').get(value.event_id)) return 'duplicate';
          const account = ensure(value.account_id);
          const applied = value.occurred_at >= account.plan_event_time;
          db.prepare('INSERT INTO billing_events(id,occurred_at,account_id,applied) VALUES (?,?,?,?)').run(value.event_id, value.occurred_at, value.account_id, applied ? 1 : 0);
          if (applied) db.prepare('UPDATE accounts SET plan=?, plan_event_time=? WHERE id=?').run(value.plan, value.occurred_at, value.account_id);
          return applied ? 'applied' : 'stale';
        });
        return send(res, 200, { status: result });
      }
      const match = url.pathname.match(/^\/internal\/releases\/([^/]+)\/([^/]+)$/);
      if (match && req.method === 'GET') {
        const key = `${match[1]}/${match[2]}`;
        const release = releases[key];
        return release ? send(res, 200, release) : error(res, 404, 'release_unavailable', 'No release for this platform and channel');
      }
      return error(res, 404, 'not_found', 'Unknown route');
    } catch (err) { return error(res, err.status || 500, err.status ? 'invalid_request' : 'internal_error', err.status ? err.message : 'Internal service error'); }
  });
  return { server, db, close: () => { server.close(); db.close(); }, entitlements };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plans = process.env.GF_PLANS_FILE ? JSON.parse(readFileSync(resolve(process.env.GF_PLANS_FILE), 'utf8')) : DEFAULT_PLANS;
  const releases = process.env.GF_RELEASES_FILE ? JSON.parse(readFileSync(resolve(process.env.GF_RELEASES_FILE), 'utf8')) : {};
  const control = createControl({ dbPath: process.env.GF_CONTROL_DB || resolve(here, 'data/control.sqlite'), secret: process.env.GF_CONTROL_SECRET, plans, releases, webhookSecret: process.env.GF_BILLING_WEBHOOK_SECRET || '' });
  const host = process.env.GF_CONTROL_HOST || '127.0.0.1';
  control.server.listen(Number(process.env.GF_CONTROL_PORT || 8788), host, () => process.stdout.write(`Control listening on ${host}:${control.server.address().port}\n`));
}
