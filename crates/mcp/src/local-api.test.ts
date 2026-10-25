import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createSocketServer } from 'node:net';
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
  dir = await mkdtemp(join(tmpdir(), 'cortex-mcp-test-'));
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

test('desktop socket is preferred, carries MCP identity and fails closed on disabled access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rw-socket-'));
  await mkdir(join(root, 'local-memory'));
  const path = join(root, 'local-memory', 'capture.sock');
  let disabled = false;
  const requests: unknown[] = [];
  const socketServer = createSocketServer({ allowHalfOpen: true }, socket => {
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => { raw += chunk; });
    socket.on('end', () => {
      const request = JSON.parse(raw);
      requests.push(request);
      socket.end(JSON.stringify(disabled ? {ok:false,error:'MCP_DISABLED: Enable access'} : {ok:true,data:{task:'shared'}}));
    });
  });
  try {
    await new Promise<void>(resolve => socketServer.listen(path, resolve));
    await chmod(path, 0o600);
    const api = new LocalApi(root);
    assert.deepEqual(await api.request('/v1/workspace/list', {}), {data:{task:'shared'}});
    assert.deepEqual(requests[0], {method:'POST',path:'/v1/workspace/list',body:{},client:'mcp'});
    disabled = true;
    await assert.rejects(() => api.request('/v1/workspace/list', {}), (e: unknown) => e instanceof LocalApiError && e.code === 'MCP_DISABLED');
    await chmod(path, 0o666);
    await assert.rejects(() => api.request('/v1/workspace/list', {}), (e: unknown) => e instanceof LocalApiError && e.code === 'INSECURE_SOCKET');
  } finally {
    await new Promise<void>(resolve => socketServer.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
