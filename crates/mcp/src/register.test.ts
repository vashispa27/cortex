import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { configureClient } from './register.js';

test('registration preserves unrelated config and removes only unchanged owned entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-register-test-'));
  try {
    const config = join(dir, 'client.json');
    const state = join(dir, 'state');
    const initial = { theme: 'dark', mcpServers: { custom: { command: '/bin/true', args: ['--safe'] } } };
    await writeFile(config, JSON.stringify(initial));
    await configureClient(config, 'enable', state);
    const installed = JSON.parse(await readFile(config, 'utf8'));
    assert.deepEqual(installed.mcpServers.custom, initial.mcpServers.custom);
    assert.equal(installed.theme, 'dark');
    assert.ok(installed.mcpServers['cortex']);
    await configureClient(config, 'disable', state);
    const removed = JSON.parse(await readFile(config, 'utf8'));
    assert.deepEqual(removed, initial);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('registration refuses to remove a user-modified entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-register-test-'));
  try {
    const config = join(dir, 'client.json');
    const state = join(dir, 'state');
    await writeFile(config, '{}');
    await configureClient(config, 'enable', state);
    const changed = JSON.parse(await readFile(config, 'utf8'));
    changed.mcpServers['cortex'].args.push('--changed');
    await writeFile(config, JSON.stringify(changed));
    await assert.rejects(() => configureClient(config, 'disable', state), /changed since installation/);
    assert.deepEqual(JSON.parse(await readFile(config, 'utf8')), changed);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
