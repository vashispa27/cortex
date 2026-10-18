#!/usr/bin/env node
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCT = 'rewind';
const PLATFORMS = new Set(['macos-universal', 'macos-arm64', 'macos-x64', 'windows-x64']);
const CHANNELS = new Set(['internal', 'canary', 'stable']);
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export class ReleaseError extends Error {
  constructor(message) { super(message); this.name = 'ReleaseError'; }
}
function requireValue(condition, message) { if (!condition) throw new ReleaseError(message); }
function exactKeys(value, keys, name) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), `${name} fields are invalid`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function strictHttps(input, name) {
  let url; try { url = new URL(input); } catch { throw new ReleaseError(`${name} must be an absolute HTTPS URL`); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, `${name} must be HTTPS without credentials, query, or fragment`);
  return url;
}
function downloadOrigin(input) {
  const url = strictHttps(input, 'Download origin');
  requireValue(url.href === url.origin + '/', 'Download origin must contain only scheme and host');
  return url.origin;
}
function artifactFile(directory, filename) {
  requireValue(typeof filename === 'string' && FILENAME.test(filename) && filename !== '.' && filename !== '..' && basename(filename) === filename, 'Artifact filename must be a simple basename');
  const path = resolve(directory, filename);
  requireValue(existsSync(path), `Artifact is missing: ${filename}`);
  const info = lstatSync(path);
  requireValue(info.isFile() && !info.isSymbolicLink() && info.size > 0, `Artifact must be a nonempty regular file: ${filename}`);
  return { path, size: info.size };
}
async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function keyFrom(source, kind) {
  requireValue(source && typeof source === 'string', `${kind} key is required`);
  let key;
  try { key = kind === 'private' ? createPrivateKey(source) : createPublicKey(source); } catch { throw new ReleaseError(`Invalid ${kind} key`); }
  requireValue(key.asymmetricKeyType === 'ed25519', `${kind} key must be Ed25519`);
  return key;
}
function payloadShape(payload) {
  exactKeys(payload, ['schema_version', 'product', 'version', 'channel', 'created_at', 'minimum_supported_version', 'artifacts'], 'Payload');
  requireValue(payload.schema_version === 1 && payload.product === PRODUCT, 'Unsupported manifest schema or product');
  requireValue(typeof payload.version === 'string' && VERSION.test(payload.version), 'Invalid release version');
  requireValue(typeof payload.minimum_supported_version === 'string' && VERSION.test(payload.minimum_supported_version), 'Invalid minimum supported version');
  requireValue(CHANNELS.has(payload.channel), 'Invalid release channel');
  requireValue(typeof payload.created_at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(payload.created_at) && !Number.isNaN(Date.parse(payload.created_at)), 'Invalid release timestamp');
  requireValue(Array.isArray(payload.artifacts) && payload.artifacts.length > 0 && payload.artifacts.length <= PLATFORMS.size, 'Manifest needs one or more artifacts');
  const seen = new Set();
  for (const item of payload.artifacts) {
    exactKeys(item, ['platform', 'filename', 'url', 'size', 'sha256'], 'Artifact');
    requireValue(PLATFORMS.has(item.platform) && !seen.has(item.platform), 'Invalid or duplicate platform');
    seen.add(item.platform);
    requireValue(typeof item.filename === 'string' && FILENAME.test(item.filename), 'Invalid artifact filename');
    requireValue(item.platform.startsWith('macos-') ? /\.(?:pkg|dmg)$/i.test(item.filename) : /\.(?:msi|exe)$/i.test(item.filename), 'Artifact extension does not match platform');
    requireValue(Number.isSafeInteger(item.size) && item.size > 0, 'Invalid artifact size');
    requireValue(typeof item.sha256 === 'string' && SHA256.test(item.sha256), 'Invalid artifact digest');
    const url = strictHttps(item.url, 'Artifact URL');
    requireValue(decodeURIComponent(url.pathname.split('/').at(-1)) === item.filename, 'Artifact URL filename mismatch');
  }
  requireValue(payload.artifacts.map((x) => x.platform).join('|') === [...payload.artifacts].map((x) => x.platform).sort().join('|'), 'Artifacts must be sorted by platform');
}

function versionParts(value) {
  const match = VERSION.exec(value); requireValue(match, 'Invalid version');
  const numbers = match.slice(1, 4).map(Number);
  requireValue(numbers.every(Number.isSafeInteger), 'Version component is too large');
  return { numbers, pre: match[4] ? match[4].split('.') : null };
}
export function compareVersions(a, b) {
  const x = versionParts(a); const y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x.numbers[i] !== y.numbers[i]) return Math.sign(x.numbers[i] - y.numbers[i]);
  if (!x.pre && !y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1;
    if (y.pre[i] === undefined) return 1;
    const xn = /^\d+$/.test(x.pre[i]); const yn = /^\d+$/.test(y.pre[i]);
    if (xn && yn && BigInt(x.pre[i]) !== BigInt(y.pre[i])) return BigInt(x.pre[i]) < BigInt(y.pre[i]) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    if (x.pre[i] !== y.pre[i]) return x.pre[i] < y.pre[i] ? -1 : 1;
  }
  return 0;
}

export async function signManifest({ artifactsDir, artifacts, version, channel, baseUrl, expectedDownloadOrigin, minimumSupportedVersion = '0.0.0', privateKeyPem, keyId, createdAt = new Date().toISOString() }) {
  requireValue(typeof version === 'string' && VERSION.test(version), 'Invalid version');
  requireValue(typeof minimumSupportedVersion === 'string' && VERSION.test(minimumSupportedVersion), 'Invalid minimum version');
  requireValue(compareVersions(minimumSupportedVersion, version) <= 0, 'Minimum version exceeds release version');
  requireValue(CHANNELS.has(channel), 'Invalid channel');
  requireValue(typeof keyId === 'string' && KEY_ID.test(keyId), 'Invalid key ID');
  requireValue(Array.isArray(artifacts) && artifacts.length > 0, 'At least one artifact is required');
  const base = strictHttps(baseUrl, 'Base URL');
  if (expectedDownloadOrigin) requireValue(base.origin === downloadOrigin(expectedDownloadOrigin), 'Base URL is outside the allowlisted download origin');
  const root = new URL(base.href.endsWith('/') ? base.href : `${base.href}/`);
  const rows = [];
  for (const item of artifacts) {
    requireValue(item && PLATFORMS.has(item.platform), 'Invalid artifact platform');
    const file = artifactFile(artifactsDir, item.filename);
    rows.push({ platform: item.platform, filename: item.filename, url: new URL(item.filename, root).href, size: file.size, sha256: await digest(file.path) });
  }
  rows.sort((a, b) => a.platform.localeCompare(b.platform));
  const payload = { schema_version: 1, product: PRODUCT, version, channel, created_at: createdAt, minimum_supported_version: minimumSupportedVersion, artifacts: rows };
  payloadShape(payload);
  const envelope = { alg: 'Ed25519', key_id: keyId, payload };
  return { ...envelope, signature: sign(null, Buffer.from(canonical(envelope)), keyFrom(privateKeyPem, 'private')).toString('base64url') };
}

export async function verifyManifest({ manifest, artifactsDir, publicKeyPem, expectedKeyId, expectedChannel, installedVersion }) {
  exactKeys(manifest, ['alg', 'key_id', 'payload', 'signature'], 'Signed manifest');
  requireValue(manifest.alg === 'Ed25519' && typeof manifest.key_id === 'string' && KEY_ID.test(manifest.key_id), 'Invalid signature metadata');
  requireValue(typeof expectedKeyId === 'string' && expectedKeyId === manifest.key_id, 'Unexpected signing key ID');
  requireValue(typeof manifest.signature === 'string' && /^[A-Za-z0-9_-]{80,100}$/.test(manifest.signature), 'Manifest is unsigned or signature is malformed');
  payloadShape(manifest.payload);
  requireValue(CHANNELS.has(expectedChannel) && manifest.payload.channel === expectedChannel, 'Manifest channel mismatch');
  const signed = { alg: manifest.alg, key_id: manifest.key_id, payload: manifest.payload };
  const valid = verify(null, Buffer.from(canonical(signed)), keyFrom(publicKeyPem, 'public'), Buffer.from(manifest.signature, 'base64url'));
  requireValue(valid, 'Manifest signature is invalid');
  if (installedVersion) {
    requireValue(compareVersions(manifest.payload.version, installedVersion) >= 0, 'Refusing a version downgrade');
    requireValue(compareVersions(installedVersion, manifest.payload.minimum_supported_version) >= 0, 'Installed version is below the supported upgrade floor');
  }
  for (const item of manifest.payload.artifacts) {
    const file = artifactFile(artifactsDir, item.filename);
    requireValue(file.size === item.size, `Artifact size mismatch: ${item.filename}`);
    requireValue((await digest(file.path)) === item.sha256, `Artifact SHA-256 mismatch: ${item.filename}`);
  }
  return manifest.payload;
}

export async function verifyRemoteArtifacts(payload, { expectedDownloadOrigin, fetchImpl = fetch } = {}) {
  const expectedOrigin = downloadOrigin(expectedDownloadOrigin);
  for (const artifact of payload.artifacts) {
    const url = strictHttps(artifact.url, 'Artifact URL');
    requireValue(url.origin === expectedOrigin, 'Artifact URL is outside the allowlisted download origin');
    let response;
    try { response = await fetchImpl(url.href, { redirect: 'error', headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(5 * 60_000) }); }
    catch { throw new ReleaseError(`Remote artifact could not be downloaded: ${artifact.filename}`); }
    requireValue(response?.status === 200 && response.body && (!response.url || response.url === url.href), `Remote artifact is unavailable: ${artifact.filename}`);
    const encoding = response.headers?.get?.('content-encoding');
    requireValue(!encoding || encoding.toLowerCase() === 'identity', `Remote artifact uses unexpected content encoding: ${artifact.filename}`);
    const length = response.headers?.get?.('content-length');
    if (length !== null && length !== undefined) requireValue(Number(length) === artifact.size, `Remote artifact size mismatch: ${artifact.filename}`);
    const hash = createHash('sha256'); let total = 0;
    try {
      for await (const chunk of response.body) {
        total += chunk.length;
        requireValue(total <= artifact.size, `Remote artifact size mismatch: ${artifact.filename}`);
        hash.update(chunk);
      }
    } catch (err) { if (err instanceof ReleaseError) throw err; throw new ReleaseError(`Remote artifact stream failed: ${artifact.filename}`); }
    requireValue(total === artifact.size, `Remote artifact size mismatch: ${artifact.filename}`);
    requireValue(hash.digest('hex') === artifact.sha256, `Remote artifact SHA-256 mismatch: ${artifact.filename}`);
  }
}

export async function exportConfigs({ manifest, artifactsDir, publicKeyPem, expectedKeyId, expectedChannel, expectedDownloadOrigin, siteUrl, fetchImpl }) {
  const payload = await verifyManifest({ manifest, artifactsDir, publicKeyPem, expectedKeyId, expectedChannel });
  await verifyRemoteArtifacts(payload, { expectedDownloadOrigin, fetchImpl });
  const site = strictHttps(siteUrl, 'Site URL');
  const downloads = {};
  const releases = {};
  for (const artifact of payload.artifacts) {
    releases[`${payload.channel}/${artifact.platform}`] = { manifest, artifact };
    if (artifact.platform === 'macos-universal') downloads.macos = artifact.url;
    if (artifact.platform === 'windows-x64') downloads.windows = artifact.url;
  }
  return { site: { siteUrl: site.origin, pricing: null, downloads, docsUrl: null }, control: releases };
}

function parseArgs(argv) {
  const [command, ...rest] = argv; const options = { artifact: [] };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]; const value = rest[i + 1];
    requireValue(key?.startsWith('--') && value !== undefined && !value.startsWith('--'), `Invalid argument: ${key || ''}`);
    if (key === '--artifact') options.artifact.push(value);
    else { requireValue(!(key.slice(2) in options), `Duplicate option: ${key}`); options[key.slice(2)] = value; }
  }
  return { command, options };
}
function keyOption(options, kind) {
  const file = options[`${kind}-key-file`]; const env = options[`${kind}-key-env`];
  requireValue(Boolean(file) !== Boolean(env), `Choose exactly one ${kind} key source`);
  if (file) return readFileSync(resolve(file), 'utf8');
  return process.env[env];
}
function writeNew(path, value) {
  requireValue(path, 'Output path is required');
  const target = resolve(path); requireValue(!existsSync(target), `Refusing to overwrite ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
}
async function main(argv) {
  const { command, options } = parseArgs(argv);
  if (command === 'sign') {
    const artifacts = options.artifact.map((item) => { const idx = item.indexOf('='); requireValue(idx > 0, 'Use --artifact platform=filename'); return { platform: item.slice(0, idx), filename: item.slice(idx + 1) }; });
    requireValue(options['download-origin'], 'Allowlisted download origin is required');
    const manifest = await signManifest({ artifactsDir: options.dir, artifacts, version: options.version, channel: options.channel, baseUrl: options['base-url'], expectedDownloadOrigin: options['download-origin'], minimumSupportedVersion: options['minimum-version'] || '0.0.0', privateKeyPem: keyOption(options, 'private'), keyId: options['key-id'] });
    writeNew(options.out, manifest);
    process.stdout.write(`Signed ${manifest.payload.artifacts.length} artifact(s) for ${manifest.payload.channel} ${manifest.payload.version}\n`);
    return;
  }
  if (command === 'verify' || command === 'export-config') {
    requireValue(options.manifest, 'Manifest path is required');
    const manifest = JSON.parse(readFileSync(resolve(options.manifest), 'utf8'));
    const publicKeyPem = keyOption(options, 'public');
    if (command === 'verify') {
      const payload = await verifyManifest({ manifest, artifactsDir: options.dir, publicKeyPem, expectedKeyId: options['key-id'], expectedChannel: options.channel, installedVersion: options['installed-version'] });
      process.stdout.write(`Verified ${payload.artifacts.length} artifact(s) for ${payload.channel} ${payload.version}\n`);
      return;
    }
    const exported = await exportConfigs({ manifest, artifactsDir: options.dir, publicKeyPem, expectedKeyId: options['key-id'], expectedChannel: options.channel, expectedDownloadOrigin: options['download-origin'], siteUrl: options['site-url'] });
    writeNew(options['site-out'], exported.site);
    writeNew(options['control-out'], exported.control);
    process.stdout.write(`Exported verified website and control configuration for ${manifest.payload.version}\n`);
    return;
  }
  throw new ReleaseError('Usage: release.mjs sign|verify|export-config [options]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => { process.stderr.write(`Release error: ${err instanceof ReleaseError ? err.message : 'Unexpected failure'}\n`); process.exitCode = 1; });
}
