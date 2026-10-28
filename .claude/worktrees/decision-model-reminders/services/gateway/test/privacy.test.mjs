import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sensitiveCategory } from '../privacy.mjs';
import { CompatibleProvider } from '../provider.mjs';

const fixtures = [
  'AKIAABCDEFGHIJKLMNOP',
  'sk-proj-abcdefghijklmnopqrstuvwxyz1234',
  'sk_live_abcdefghijklmnopqrstuvwxyz1234',
  'ghp_abcdefghijklmnopqrstuvwxyz1234',
  'xoxb-1234567890-abcdefghijklmno',
  'glpat-abcdefghijklmnopqrstuvwxyz',
  'hf_abcdefghijklmnopqrstuvwxyz1234',
  'Bearer abcdefghijklmnopqrstuvwxyz1234',
  'https://reader:my-password@example.com/private',
  'https://example.com/?api_key=abcdefghijklmno',
  'client_secret=abcdefghijklmno',
  'password: "my-password-123"',
  'card_abcdefghijklmnopqrstuvwxyz1234',
  '4111 1111 1111 1111',
  '-----BEGIN PRIVATE KEY-----'
];

test('recognizes common credential and payment formats in nested selected context', () => {
  for (const fixture of fixtures) assert.ok(sensitiveCategory({ text: 'ordinary', evidence: [{ text: fixture }] }), fixture);
  assert.equal(sensitiveCategory({ text: 'Please explain what an API key is.' }), null);
});

test('provider origin is pinned and URL credentials are rejected', () => {
  const options = { apiKey: 'test-key', models: { answer: 'test' }, allowedOrigin: 'https://api.example.com' };
  assert.throws(() => new CompatibleProvider({ ...options, baseUrl: 'http://api.example.com/v1' }));
  assert.throws(() => new CompatibleProvider({ ...options, baseUrl: 'https://other.example.com/v1' }));
  assert.throws(() => new CompatibleProvider({ ...options, baseUrl: 'https://user:pass@api.example.com/v1' }));
  assert.throws(() => new CompatibleProvider({ ...options, baseUrl: 'https://api.example.com/v1?token=abc' }));
  const provider = new CompatibleProvider({ ...options, baseUrl: 'https://api.example.com/v1' });
  assert.equal(provider.endpoint('chat/completions').href, 'https://api.example.com/v1/chat/completions');
});
