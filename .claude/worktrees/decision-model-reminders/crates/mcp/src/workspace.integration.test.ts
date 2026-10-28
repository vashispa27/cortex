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

test('Agent Space lifecycle crosses independent MCP clients and retains handoff provenance', { skip: !binary, timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'cortex-agent-space-'));
  const env = { ...process.env, CORTEX_STATE_DIR: root } as Record<string, string>;
  let daemon: ChildProcess | undefined;
  let port = 0, token = '';
  const client = new Client({ name: 'codex-test', version: '1' });
  const other = new Client({ name: 'claude-test', version: '1' });
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
  const tool = async (name: string, args: Record<string, unknown>, caller = client) => {
    const reply = await caller.callTool({ name, arguments: args }); assert.notEqual(reply.isError, true, JSON.stringify(reply));
    const block = reply.content?.[0]; if (block?.type !== 'text') throw new Error('Expected text'); return JSON.parse(block.text).data;
  };
  try {
    await start();
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dirname(fileURLToPath(import.meta.url)), 'index.js')], env }));
    await other.connect(new StdioClientTransport({ command: process.execPath, args: [join(dirname(fileURLToPath(import.meta.url)), 'index.js')], env }));
    assert.equal((await client.callTool({ name: 'list_tasks', arguments: {} })).isError, true);
    await request('/v1/settings', { expected_version: 0, mcp_enabled: true }, 'PATCH');
    const created = await tool('create_task', { id: 'work', title: 'Portable work', harness: 'codex', session_id: 'c1' });
    assert.deepEqual(created.origin, { harness: 'codex', session_id: 'c1' });
    await tool('create_task', { id: 'child', title: 'Follow up', parent_id: 'work', harness: 'codex', session_id: 'c1' });
    const first = await tool('claim_task', { task_id: 'work', expected_revision: 1, harness: 'codex', session_id: 'c1' });
    assert.equal((await other.callTool({ name: 'claim_task', arguments: { task_id: 'work', expected_revision: 2, harness: 'claude', session_id: 'cl1' } })).isError, true);
    await tool('append_task_transcript', { task_id: 'work', harness: 'codex', session_id: 'c1', start_sequence: 0, jsonl: JSON.stringify({ role: 'assistant', content: 'Implementation ready' }) });
    const progress = await tool('update_task', { task_id: 'work', expected_revision: 2, lease_token: first.lease_token, handoff: 'Implementation ready', artifacts: [{ name: 'Patch', location: '/repo/change.patch' }] });
    assert.equal(progress.revision, 3);
    assert.equal((await client.callTool({ name: 'update_task', arguments: { task_id: 'work', expected_revision: 2, lease_token: first.lease_token, handoff: 'stale' } })).isError, true);
    await tool('release_task', { task_id: 'work', expected_revision: 3, lease_token: first.lease_token, handoff: 'Please verify', next_action: 'Run checks', blockers: 'Review pending' });
    const pack = await tool('get_task_resume_pack', { task_id: 'work' }, other);
    assert.equal(pack.task.handoff, 'Please verify');
    assert.equal(pack.task.next_action, 'Run checks');
    assert.equal(pack.task.artifacts[0].location, '/repo/change.patch');
    assert.equal(pack.follow_ups[0].id, 'child');
    assert.equal(pack.sessions[0].harness, 'codex');
    const second = await tool('claim_task', { task_id: 'work', expected_revision: 4, harness: 'claude', session_id: 'cl1' }, other);
    assert.notEqual(second.lease_token, first.lease_token);
    assert.equal((await client.callTool({ name: 'update_task', arguments: { task_id: 'work', expected_revision: 5, lease_token: first.lease_token } })).isError, true);
    assert.equal((await tool('list_tasks', { owner_harness: 'claude', ownership: 'claimed' })).total, 1);
    await tool('release_task', { task_id: 'work', expected_revision: 5, lease_token: second.lease_token, status: 'done', handoff: 'Checks passed', next_action: '', blockers: '' }, other);
    const events = await tool('get_task_events', { task_id: 'work' });
    const releases = events.items.filter((e: any) => e.action === 'release');
    assert.equal(releases[0].record.actor.harness, 'codex');
    assert.equal(releases[1].record.actor.harness, 'claude');
    assert.equal(JSON.stringify(events).includes('lease_token'), false);
    await stop(); await start();
    const restored = await tool('get_task_resume_pack', { task_id: 'work' }, other);
    assert.equal(restored.task.status, 'done');
    assert.equal(restored.task.origin.harness, 'codex');
    assert.equal((await tool('get_task_transcript', { task_id: 'work', session_id: 'c1' }, other)).records[0].message.content, 'Implementation ready');
    assert.equal((await tool('list_schedules', {})).total, 0);

  } finally { await client.close(); await other.close(); await stop(); await rm(root, { recursive: true, force: true }); }
});
