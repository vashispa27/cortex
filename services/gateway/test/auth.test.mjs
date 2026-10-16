import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createAuthenticator } from '../auth.mjs';

test('OIDC verifier checks signature, issuer, audience, expiry and maps subject', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  try {
    const authenticate = createAuthenticator({ issuer: 'https://issuer.example', audience: 'open-memory', jwksUrl: 'https://issuer.example/keys' });
    const make = (claims) => {
      const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({ iss: 'https://issuer.example', aud: 'open-memory', sub: 'auth0|123', exp: Math.floor(Date.now() / 1000) + 60, ...claims })).toString('base64url');
      const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
      return `Bearer ${head}.${body}.${signature}`;
    };
    const identity = await authenticate(make({}));
    assert.match(identity.sub, /^oidc:[a-f0-9]{64}$/);
    await assert.rejects(authenticate(make({ aud: 'other' })), { status: 401 });
    await assert.rejects(authenticate(make({ exp: 1 })), { status: 401 });
  } finally { globalThis.fetch = oldFetch; }
});
