import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { LocalApi, LocalApiError } from './local-api.js';

let dir: string;
let port: number;
const token = 'a'.repeat(64);
const server = createServer((request, response) => {
  if (request.headers.authorization !== `Bearer ${token}` || request.headers['x-memory-client'] !== 'mcp') {
    response.writeHead(401).end();
    return;
  }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ request_id: 'test', data: { route: request.url } }));
});

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rewind-mcp-test-'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unexpected test address');
  port = address.port;
  await writeFile(join(dir, 'daemon.port'), String(port));
  await writeFile(join(dir, 'daemon.token'), `${token}\n`, { mode: 0o600 });
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

test('read-only local request uses loopback, bearer token, and MCP marker', async () => {
  const value = await new LocalApi(dir).request('/v1/memory/recent?limit=2');
  assert.deepEqual(value, { request_id: 'test', data: { route: '/v1/memory/recent?limit=2' } });
  assert.equal((await readFile(join(dir, 'daemon.token'), 'utf8')).trim(), token);
});

test('rejects route escape and oversized requests', async () => {
  const api = new LocalApi(dir);
  await assert.rejects(() => api.request('//example.com/v1/memory/search'), (error: unknown) => error instanceof LocalApiError && error.code === 'INVALID_ROUTE');
  await assert.rejects(() => api.request('/v1/memory/search', { query: 'x'.repeat(40_000) }), (error: unknown) => error instanceof LocalApiError && error.code === 'REQUEST_TOO_LARGE');
});
