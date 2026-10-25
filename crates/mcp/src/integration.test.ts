import { strict as assert } from 'node:assert';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const daemonBinary = process.env.CORTEX_DAEMON_BIN;

async function waitForPort(dir: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const port = Number((await readFile(join(dir, 'daemon.port'), 'utf8')).trim());
      if (port > 0) return port;
    } catch { /* daemon is starting */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Daemon did not create a port file');
}

test('synthetic source flows through daemon and consent-gated MCP', { skip: !daemonBinary }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-e2e-'));
  const env = { ...process.env, CORTEX_STATE_DIR: dir } as Record<string, string>;
  const seeded = spawnSync(daemonBinary!, ['--seed-synthetic'], { env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(seeded.status, 0, seeded.stderr);
  let daemon: ChildProcess | undefined;
  const client = new Client({ name: 'e2e-test', version: '1.0.0' });
  try {
    daemon = spawn(daemonBinary!, [], { env, stdio: 'ignore' });
    const port = await waitForPort(dir);
    const token = (await readFile(join(dir, 'daemon.token'), 'utf8')).trim();
    const base = `http://127.0.0.1:${port}`;
    const request = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, json: await response.json() as Record<string, unknown> };
    };
    const status = await request('/v1/status');
    assert.equal(status.status, 200);
    assert.equal((status.json.data as { snapshot_count: number }).snapshot_count, 1);

    const bridgeFile = join(dirname(fileURLToPath(import.meta.url)), 'index.js');
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [bridgeFile], env }));
    const disabled = await client.callTool({ name: 'search_memory', arguments: { query: 'Thursday' } });
    assert.equal(disabled.isError, true);
    assert.match(JSON.stringify(disabled.content), /MCP_DISABLED/);
    const blockedWrite = await client.callTool({ name: 'create_task', arguments: { title: 'Not allowed' } });
    assert.equal(blockedWrite.isError, true);

    const settings = await request('/v1/settings');
    const version = (settings.json.data as { version: number }).version;
    const enabled = await request('/v1/settings', 'PATCH', { expected_version: version, mcp_enabled: true });
    assert.equal(enabled.status, 200);
    const tool = async (name: string, args: Record<string, unknown>) => {
      const reply = await client.callTool({name, arguments:args});
      assert.notEqual(reply.isError,true,JSON.stringify(reply));
      const block=reply.content?.[0];
      if(block?.type!=='text') throw new Error('Expected tool text');
      return JSON.parse(block.text).data;
    };
    const task = await tool('create_task',{id:'cross-harness',title:'Portable context',project:'/example'});
    const claim = await tool('claim_task',{task_id:task.id,expected_revision:1,harness:'codex',session_id:'codex-source'});
    const conflict = await client.callTool({name:'claim_task',arguments:{task_id:task.id,expected_revision:2,harness:'claude',session_id:'claude-source'}});
    assert.equal(conflict.isError,true);
    await tool('release_task',{task_id:task.id,expected_revision:2,lease_token:claim.lease_token,handoff:'Storage implemented; tests next',next_action:'Run tests',status:'parked'});
    const transcriptPath=join(dir,'source.jsonl');
    await writeFile(transcriptPath,JSON.stringify({message:{role:'user',content:'Implement portable tasks'}})+'\n');
    const imported=await client.callTool({name:'import_task_transcript',arguments:{task_id:task.id,session_id:'codex-source',harness:'codex',path:transcriptPath}});
    assert.notEqual(imported.isError,true,JSON.stringify(imported));
    const resume = await tool('get_task_resume_pack',{task_id:task.id});
    assert.equal(resume.task.handoff,'Storage implemented; tests next');
    assert.equal(resume.sessions[0].records,1);
    const history = await tool('get_task_transcript',{task_id:task.id,session_id:'codex-source'});
    assert.equal(history.records[0].message.content,'Implement portable tasks');
    await tool('claim_task',{task_id:task.id,expected_revision:3,harness:'claude',session_id:'claude-source'});
    await tool('create_task',{id:'followup',title:'Add regression tests',parent_id:task.id});
    assert.equal((await tool('get_task_resume_pack',{task_id:task.id})).follow_ups.length,1);
    const memory = await tool('remember',{content:'Praveen has X handle @example',source:'Synthetic fixture'});
    assert.equal((await tool('search_permanent_memory',{query:'Praveen'})).total,1);
    await tool('forget_memory',{memory_id:memory.id,expected_revision:1});
    assert.equal((await tool('search_permanent_memory',{query:'Praveen'})).total,0);
    await tool('forget_memory',{memory_id:memory.id,expected_revision:2,restore:true});
    const found = await client.callTool({ name: 'search_memory', arguments: { query: 'Thursday' } });
    assert.notEqual(found.isError, true);
    const content = found.content?.[0];
    assert.equal(content?.type, 'text');
    if (content?.type !== 'text') throw new Error('Expected text MCP result');
    const data = JSON.parse(content.text).data as { results: { snapshot_id: number }[] };
    assert.equal(data.results.length, 1);
    const source = await client.callTool({ name: 'get_snapshots', arguments: { ids: [data.results[0].snapshot_id] } });
    assert.match(JSON.stringify(source.content), /Synthetic example/);
    const working = await client.callTool({ name: 'get_working_memory', arguments: { limit: 10 } });
    assert.match(JSON.stringify(working.content), /Launch review/);
    const day = new Date().toISOString().slice(0, 10);
    const chronicle = await client.callTool({ name: 'get_chronicle', arguments: { level: 'day', period: day, timezone: 'UTC' } });
    assert.match(JSON.stringify(chronicle.content), /captured foreground sources/);
    const report = await client.callTool({ name: 'get_time_report', arguments: { from_ms: 0, to_ms: Date.now() } });
    assert.match(JSON.stringify(report.content), /tracked_foreground_activity/);

    const deleted = await request('/v1/privacy/delete', 'POST', { scope: 'all', confirmation: 'DELETE ALL LOCAL MEMORY' });
    assert.equal(deleted.status, 200);
    assert.equal((deleted.json.data as { deleted_snapshots: number }).deleted_snapshots, 1);
    const after = await client.callTool({ name: 'search_memory', arguments: { query: 'Thursday' } });
    assert.equal(after.isError, undefined);
    const afterContent = after.content?.[0];
    assert.equal(afterContent?.type, 'text');
    if (afterContent?.type !== 'text') throw new Error('Expected text MCP result');
    assert.deepEqual(JSON.parse(afterContent.text).data.results, []);
  } finally {
    await client.close();
    if (daemon && daemon.exitCode === null) {
      const exited = new Promise<void>(resolve => daemon!.once('exit', () => resolve()));
      daemon.kill('SIGTERM');
      await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 2_000))]);
      if (daemon.exitCode === null) daemon.kill('SIGKILL');
    }
    await rm(dir, { recursive: true, force: true });
  }
});
