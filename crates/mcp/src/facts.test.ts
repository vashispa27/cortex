import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerWorkspace } from './workspace.js';
test('personal fact tools validate provenance, fence changes, and forward to workspace storage', async () => {
  const registered = new Map<string, { config: any; handler: (input: any) => Promise<unknown> }>();
  const calls: unknown[] = [];
  registerWorkspace({ registerTool(name: string, config: any, handler: any) { registered.set(name, { config, handler }); } } as unknown as McpServer, async (path, body) => { calls.push({ path, body }); return { content: [] }; });
  const fact = { subject: 'Invented Mira', attribute: 'phone', value: '000111', source: 'Explicit invented request' };
  for (const [op, body] of [ ['remember_fact', fact], ['recall_facts', { query: 'Mira phone' }], ['update_fact', { ...fact, fact_id: 'one', expected_revision: 2 }], ['delete_fact', { fact_id: 'one', expected_revision: 3 }] ] as const) {
    const tool = registered.get(op)!;
    const input = tool.config.inputSchema.parse(body);
    await tool.handler(input);
    assert.deepEqual(calls.pop(), { path: `/v1/workspace/${op}`, body: input });
  }
  assert.equal(registered.get('remember_fact')!.config.inputSchema.safeParse({ subject: 'Mira', value: '000111' }).success, false);
  assert.equal(registered.get('update_fact')!.config.inputSchema.safeParse({ ...fact, fact_id: 'one' }).success, false);
});
