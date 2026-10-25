import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const binary = process.env.CORTEX_DAEMON_BIN;

test('real daemon and MCP share persisted schedules, revisions and access controls', { skip: !binary, timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'cortex-schedules-'));
  const env = { ...process.env, CORTEX_STATE_DIR: root } as Record<string, string>;
  let daemon: ChildProcess | undefined;
  let port = 0, token = '';
  const client = new Client({ name: 'scheduling-test', version: '1' });
  const request = async (path: string, body: unknown, method = 'POST', mcp = false) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(mcp ? { 'X-Memory-Client': 'mcp' } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const start = async () => {
    await unlink(join(root, 'daemon.port')).catch(() => {});
    daemon = spawn(binary!, [], { env, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { port = Number(await readFile(join(root, 'daemon.port'), 'utf8')); token = (await readFile(join(root, 'daemon.token'), 'utf8')).trim(); if (port) return; } catch { /* starting */ }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Daemon failed to start');
  };
  const stop = async () => { if (daemon && daemon.exitCode === null) { const exit = new Promise<void>(resolve => daemon!.once('exit', () => resolve())); daemon.kill(); await exit; } };
  const tool = async (name: string, args: Record<string, unknown>) => {
    const reply = await client.callTool({ name, arguments: args }); assert.notEqual(reply.isError, true, JSON.stringify(reply));
    const block = reply.content?.[0]; if (block?.type !== 'text') throw new Error('Expected text'); return JSON.parse(block.text).data;
  };
  try {
    await start();
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dirname(fileURLToPath(import.meta.url)), 'index.js')], env }));
    assert.equal((await client.callTool({ name: 'list_schedules', arguments: {} })).isError, true);
    await request('/v1/settings', { expected_version: 0, mcp_enabled: true }, 'PATCH');
    const spec = { title: 'Stock market briefing', timezone: 'Asia/Kolkata', timing: { type: 'after_wake', time: '06:00', window_end: '12:00', weekdays: [1,2,3,4,5] }, action: { type: 'task', prompt: 'Current stock market briefing', requires_live_sources: true } };
    const created = await tool('create_schedule', { id: 'morning', schedule: spec });
    assert.equal(created.status, 'active');
    assert.equal((await tool('create_schedule', { id: 'morning', schedule: spec })).revision, 1);
    assert.equal((await request('/v1/schedules/get', { schedule_id: 'morning' })).body.data.title, spec.title);
    await tool('pause_schedule', { schedule_id: 'morning', expected_revision: 1 });
    assert.equal((await client.callTool({ name: 'cancel_schedule', arguments: { schedule_id: 'morning', expected_revision: 1 } })).isError, true);
    await stop(); await start();
    const stored = await tool('get_schedule', { schedule_id: 'morning' }); assert.equal(stored.status, 'paused'); assert.equal(stored.revision, 2);
    const resumed = await tool('resume_schedule', { schedule_id: 'morning', expected_revision: 2 });
    const updated = await tool('update_schedule', { schedule_id: 'morning', expected_revision: resumed.revision, schedule: { ...spec, timing: { type: 'daily', time: '09:00' } } });
    const cancelled = await tool('cancel_schedule', { schedule_id: 'morning', expected_revision: updated.revision }); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.next_due_ms, null);
    assert.equal((await tool('list_schedules', { status: 'cancelled' })).total, 1);
    assert.equal((await tool('get_schedule_history', { schedule_id: 'morning' })).total, 0);
    assert.equal((await request('/v1/schedules/wake', {}, 'POST', true)).status, 403);
    assert.equal((await request('/v1/schedules/create', { id: 'bad', schedule: { ...spec, timezone: 'Nowhere/Invalid' } })).status, 400);
  } finally { await client.close(); await stop(); await rm(root, { recursive: true, force: true }); }
});
