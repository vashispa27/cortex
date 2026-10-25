import { strict as assert } from 'node:assert';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('bundled MCP runs outside the repository without node_modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cortex-standalone-'));
  const client = new Client({name:'standalone-check',version:'1'});
  try {
    const script = join(root,'cortex-mcp.mjs');
    await copyFile(join(dirname(fileURLToPath(import.meta.url)),'cortex-mcp.mjs'),script);
    await client.connect(new StdioClientTransport({command:process.execPath,args:[script],env:{...process.env,CORTEX_STATE_DIR:root} as Record<string,string>}));
    const tools=await client.listTools();
    for(const name of ['list_tasks','claim_task','release_task','remember','search_memory']) assert.ok(tools.tools.some(tool=>tool.name===name));
    const response=await client.callTool({name:'list_tasks',arguments:{}});
    assert.equal(response.isError,true);
    assert.match(JSON.stringify(response.content),/DAEMON_OFFLINE/);
  } finally {await client.close();await rm(root,{recursive:true,force:true});}
});
