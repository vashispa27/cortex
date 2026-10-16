import { createPublicKey, createHash, verify, timingSafeEqual } from 'node:crypto';

function decode(part) { try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); } catch { throw Object.assign(new Error('Malformed token'), { status: 401 }); } }
function unauthorized() { return Object.assign(new Error('Unauthorized'), { status: 401 }); }
function same(a, b) { const x = Buffer.from(a || ''); const y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }

/** OIDC access-token verifier; the desktop obtains tokens via system-browser PKCE. */
export function createAuthenticator({ devMode = false, devToken = '', issuer = '', audience = '', jwksUrl = '' } = {}) {
  if (devMode && devToken.length < 16) throw new Error('GF_DEV_TOKEN must contain at least 16 characters');
  if (!devMode && (!issuer || !audience || !jwksUrl)) throw new Error('OIDC issuer, audience, and JWKS URL are required');
  if (!devMode && (!issuer.startsWith('https://') || !jwksUrl.startsWith('https://'))) throw new Error('OIDC URLs must use HTTPS');
  let cached = null; let expires = 0;
  async function getKeys() {
    if (cached && Date.now() < expires) return cached;
    const res = await fetch(jwksUrl, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw unauthorized();
    const data = await res.json();
    if (!Array.isArray(data.keys) || data.keys.length > 100) throw unauthorized();
    cached = data.keys; expires = Date.now() + 5 * 60_000;
    return cached;
  }
  return async function authenticate(header) {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw unauthorized();
    const token = header.slice(7);
    if (devMode) { if (!same(token, devToken)) throw unauthorized(); return { sub: 'dev:local', dev: true }; }
    if (token.length > 16_000) throw unauthorized();
    const parts = token.split('.'); if (parts.length !== 3) throw unauthorized();
    const head = decode(parts[0]); const body = decode(parts[1]);
    if (!['RS256', 'ES256'].includes(head.alg) || typeof head.kid !== 'string') throw unauthorized();
    const keys = await getKeys();
    const jwk = keys.find((x) => x.kid === head.kid && x.alg === head.alg && x.use === 'sig');
    if (!jwk) throw unauthorized();
    let ok = false;
    try { ok = verify(head.alg === 'RS256' ? 'RSA-SHA256' : 'sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: head.alg === 'ES256' ? 'ieee-p1363' : undefined }, Buffer.from(parts[2], 'base64url')); } catch { throw unauthorized(); }
    const now = Math.floor(Date.now() / 1000);
    if (!ok || body.iss !== issuer || !(body.aud === audience || (Array.isArray(body.aud) && body.aud.includes(audience))) || typeof body.exp !== 'number' || body.exp <= now || (body.nbf && body.nbf > now) || (body.iat && body.iat > now + 60) || typeof body.sub !== 'string' || !body.sub || body.sub.length > 200) throw unauthorized();
    // OIDC subjects may contain provider-specific punctuation. Hashing also keeps
    // the metadata service independent of a provider's raw subject format.
    return { sub: `oidc:${createHash('sha256').update(`${issuer}\0${body.sub}`).digest('hex')}`, dev: false };
  };
}
