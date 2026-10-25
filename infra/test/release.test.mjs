import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, unlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { compareVersions, exportConfigs, signManifest, verifyManifest } from '../release.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'cortex.pkg'), 'synthetic macOS package');
  writeFileSync(join(dir, 'cortex.msi'), 'synthetic Windows installer');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { dir, privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString() };
}
function inputs(f) { return { artifactsDir: f.dir, artifacts: [{ platform: 'macos-universal', filename: 'cortex.pkg' }, { platform: 'windows-x64', filename: 'cortex.msi' }], version: '1.2.3', channel: 'canary', baseUrl: 'https://downloads.example.test/releases/1.2.3', expectedDownloadOrigin: 'https://downloads.example.test', minimumSupportedVersion: '1.0.0', privateKeyPem: f.privateKeyPem, keyId: 'release-2026', createdAt: '2026-10-16T00:00:00.000Z' }; }
function remote(f, override) { return async (url) => { const filename = new URL(url).pathname.split('/').at(-1); const bytes = override?.[filename] ?? readFileSync(join(f.dir, filename)); return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } }); }; }

test('signs existing files, verifies Ed25519 and SHA-256, then exports configured URLs', async (t) => {
  const f = fixture(t);
  const manifest = await signManifest(inputs(f));
  const payload = await verifyManifest({ manifest, artifactsDir: f.dir, publicKeyPem: f.publicKeyPem, expectedKeyId: 'release-2026', expectedChannel: 'canary', installedVersion: '1.2.2' });
  assert.equal(payload.artifacts.length, 2);
  assert.match(payload.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  const configs = await exportConfigs({ manifest, artifactsDir: f.dir, publicKeyPem: f.publicKeyPem, expectedKeyId: 'release-2026', expectedChannel: 'canary', expectedDownloadOrigin: 'https://downloads.example.test', siteUrl: 'https://cortex.example.test', fetchImpl: remote(f) });
  assert.equal(configs.site.downloads.macos, 'https://downloads.example.test/releases/1.2.3/cortex.pkg');
  assert.equal(configs.site.downloads.windows, 'https://downloads.example.test/releases/1.2.3/cortex.msi');
  assert.deepEqual(Object.keys(configs.control).sort(), ['canary/macos-universal', 'canary/windows-x64']);
});

test('refuses unsigned, tampered, missing, and downgraded releases', async (t) => {
  const f = fixture(t);
  const manifest = await signManifest(inputs(f));
  const verify = (value = manifest, installedVersion) => verifyManifest({ manifest: value, artifactsDir: f.dir, publicKeyPem: f.publicKeyPem, expectedKeyId: 'release-2026', expectedChannel: 'canary', installedVersion });
  await assert.rejects(verify({ ...manifest, signature: undefined }), /unsigned|signature/i);
  await assert.rejects(verify({ ...manifest, payload: { ...manifest.payload, version: '1.2.4' } }), /signature/i);
  await assert.rejects(verify(manifest, '2.0.0'), /downgrade/i);
  await assert.rejects(verify(manifest, '0.9.0'), /upgrade floor/i);
  writeFileSync(join(f.dir, 'cortex.msi'), 'tampered installer');
  await assert.rejects(verify(), /SHA-256|size/i);
  unlinkSync(join(f.dir, 'cortex.pkg'));
  await assert.rejects(verify(), /missing/i);
});

test('refuses path traversal, symlinks, empty files, wrong key and unsafe URL', async (t) => {
  const f = fixture(t);
  await assert.rejects(signManifest({ ...inputs(f), artifacts: [{ platform: 'macos-universal', filename: '../outside.pkg' }] }), /basename/i);
  writeFileSync(join(f.dir, 'empty.pkg'), '');
  await assert.rejects(signManifest({ ...inputs(f), artifacts: [{ platform: 'macos-universal', filename: 'empty.pkg' }] }), /nonempty/i);
  symlinkSync(join(f.dir, 'cortex.pkg'), join(f.dir, 'link.pkg'));
  await assert.rejects(signManifest({ ...inputs(f), artifacts: [{ platform: 'macos-universal', filename: 'link.pkg' }] }), /regular file/i);
  await assert.rejects(signManifest({ ...inputs(f), baseUrl: 'http://downloads.example.test/releases' }), /HTTPS/i);
  await assert.rejects(signManifest({ ...inputs(f), baseUrl: 'https://other.example.test/releases' }), /allowlisted/i);
  await assert.rejects(signManifest({ ...inputs(f), artifacts: [{ platform: 'windows-x64', filename: 'cortex.pkg' }] }), /extension/i);
  const manifest = await signManifest(inputs(f));
  const other = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' }).toString();
  await assert.rejects(verifyManifest({ manifest, artifactsDir: f.dir, publicKeyPem: other, expectedKeyId: 'release-2026', expectedChannel: 'canary' }), /signature/i);
  await assert.rejects(verifyManifest({ manifest, artifactsDir: f.dir, publicKeyPem: f.publicKeyPem, expectedKeyId: 'release-2026', expectedChannel: 'stable' }), /channel/i);
});

test('never exports URLs for missing or changed remote CDN bytes', async (t) => {
  const f = fixture(t);
  const manifest = await signManifest(inputs(f));
  const options = { manifest, artifactsDir: f.dir, publicKeyPem: f.publicKeyPem, expectedKeyId: 'release-2026', expectedChannel: 'canary', expectedDownloadOrigin: 'https://downloads.example.test', siteUrl: 'https://cortex.example.test' };
  await assert.rejects(exportConfigs({ ...options, fetchImpl: async () => ({ status: 404 }) }), /unavailable/i);
  await assert.rejects(exportConfigs({ ...options, fetchImpl: remote(f, { 'cortex.msi': Buffer.from('wrong remote bytes') }) }), /size mismatch|SHA-256 mismatch/i);
  await assert.rejects(exportConfigs({ ...options, expectedDownloadOrigin: 'https://other.example.test', fetchImpl: remote(f) }), /allowlisted/i);
  await assert.rejects(exportConfigs({ ...options, fetchImpl: async () => ({ status: 200, headers: new Headers({ 'content-encoding': 'gzip' }), body: new Response('x').body }) }), /encoding/i);
});

test('semantic versions place prereleases before final and reject lower numbers', () => {
  assert.equal(compareVersions('1.2.3-beta.2', '1.2.3'), -1);
  assert.equal(compareVersions('1.2.3', '1.2.3-beta.2'), 1);
  assert.equal(compareVersions('1.2.4', '1.2.3'), 1);
});

test('CLI signs and verifies synthetic files but refuses unverified remote export', (t) => {
  const f = fixture(t);
  const script = new URL('../release.mjs', import.meta.url).pathname;
  const manifestPath = join(f.dir, 'out', 'manifest.json');
  const env = { ...process.env, TEST_PRIVATE_PEM: f.privateKeyPem, TEST_PUBLIC_PEM: f.publicKeyPem };
  const run = (...args) => execFileSync(process.execPath, [script, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(run('sign', '--dir', f.dir, '--version', '1.2.3', '--channel', 'stable', '--base-url', 'https://downloads.example.test/1.2.3', '--download-origin', 'https://downloads.example.test', '--artifact', 'macos-universal=cortex.pkg', '--artifact', 'windows-x64=cortex.msi', '--key-id', 'test-key', '--private-key-env', 'TEST_PRIVATE_PEM', '--out', manifestPath), /Signed 2 artifact/);
  assert.match(run('verify', '--dir', f.dir, '--manifest', manifestPath, '--channel', 'stable', '--key-id', 'test-key', '--public-key-env', 'TEST_PUBLIC_PEM'), /Verified 2 artifact/);
  assert.throws(() => run('export-config', '--dir', f.dir, '--manifest', manifestPath, '--channel', 'stable', '--key-id', 'test-key', '--public-key-env', 'TEST_PUBLIC_PEM', '--download-origin', 'https://downloads.example.test', '--site-url', 'https://cortex.example.test', '--site-out', join(f.dir, 'out', 'site.json'), '--control-out', join(f.dir, 'out', 'control.json')), (error) => error.status === 1 && /Remote artifact could not be downloaded/.test(error.stderr));
  assert.equal(existsSync(join(f.dir, 'out', 'site.json')), false);
  assert.equal(existsSync(join(f.dir, 'out', 'control.json')), false);
});
