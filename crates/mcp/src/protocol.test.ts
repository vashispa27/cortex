import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('stdio bridge negotiates MCP and fails closed with no daemon', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'open-memory-empty-state-'));
  const serverFile = join(dirname(fileURLToPath(import.meta.url)), 'index.js');
  const client = new Client({ name: 'bridge-test', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [serverFile],
      env: { ...process.env, OPEN_MEMORY_STATE_DIR: stateDir } as Record<string, string>,
    }));
    const listed = await client.listTools();
    assert.ok(listed.tools.some(tool => tool.name === 'search_memory'));
    const result = await client.callTool({ name: 'search_memory', arguments: { query: 'example' } });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /DAEMON_OFFLINE/);
  } finally {
    await client.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});
