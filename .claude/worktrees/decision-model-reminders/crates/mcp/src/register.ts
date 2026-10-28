#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateDirectory } from './local-api.js';

type JsonObject = Record<string, unknown>;
type Receipt = { configPath: string; entryHash: string; backupPath: string; removedByUser: boolean };
const entryName = 'cortex';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bridgeEntry(): JsonObject {
  const bridge = resolve(dirname(fileURLToPath(import.meta.url)), 'index.js');
  return { command: process.execPath, args: [bridge] };
}

async function readConfig(path: string): Promise<{ value: JsonObject; original: string; mode: number }> {
  let original = '{}\n';
  let mode = 0o600;
  try {
    original = await readFile(path, 'utf8');
    mode = (await stat(path)).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(original); }
  catch { throw new Error('Client config is not strict JSON; use manual setup to preserve comments'); }
  if (!object(parsed) || (parsed.mcpServers !== undefined && !object(parsed.mcpServers))) {
    throw new Error('Client config must be a JSON object with an object-valued mcpServers field');
  }
  return { value: parsed, original, mode };
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temp, content, { mode, flag: 'wx' });
  await rename(temp, path);
}

export async function configureClient(configPath: string, action: 'enable' | 'disable', stateDir = stateDirectory()): Promise<string> {
  if (!isAbsolute(configPath)) throw new Error('Pass an absolute client config path');
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const receiptPath = join(stateDir, `mcp-receipt-${hash(configPath).slice(0, 24)}.json`);
  const { value, original, mode } = await readConfig(configPath);
  const servers = object(value.mcpServers) ? value.mcpServers : {};
  let receipt: Receipt | undefined;
  try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as Receipt; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

  if (action === 'enable') {
    if (servers[entryName] !== undefined) {
      throw new Error('An cortex entry already exists; inspect it before changing it');
    }
    const entry = bridgeEntry();
    const backupPath = join(stateDir, `mcp-backup-${hash(configPath).slice(0, 24)}-${Date.now()}.json`);
    await writeFile(backupPath, original, { mode: 0o600, flag: 'wx' });
    servers[entryName] = entry;
    value.mcpServers = servers;
    // Re-read just before replace so a concurrent client edit is not silently overwritten.
    const latest = await readConfig(configPath);
    if (latest.original !== original) throw new Error('Client config changed during setup; retry after reviewing it');
    await atomicWrite(configPath, JSON.stringify(value, null, 2) + '\n', mode);
    await atomicWrite(receiptPath, JSON.stringify({ configPath, entryHash: hash(entry), backupPath, removedByUser: false } satisfies Receipt) + '\n', 0o600);
    return 'Cortex MCP entry installed. After you enable Connected AI Apps, this client can search captured memory and read/write shared tasks, transcripts, and permanent memories.';
  }

  if (!receipt || receipt.configPath !== configPath) throw new Error('No installation receipt for this config');
  if (servers[entryName] === undefined) {
    receipt.removedByUser = true;
    await atomicWrite(receiptPath, JSON.stringify(receipt) + '\n', 0o600);
    return 'Entry was already removed; no client config change made.';
  }
  if (hash(servers[entryName]) !== receipt.entryHash) {
    throw new Error('The MCP entry changed since installation; leaving it untouched');
  }
  delete servers[entryName];
  value.mcpServers = servers;
  const latest = await readConfig(configPath);
  if (latest.original !== original) throw new Error('Client config changed during removal; retry after reviewing it');
  await atomicWrite(configPath, JSON.stringify(value, null, 2) + '\n', mode);
  receipt.removedByUser = true;
  await atomicWrite(receiptPath, JSON.stringify(receipt) + '\n', 0o600);
  return 'Owned MCP entry removed; other client settings preserved.';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [actionFlag, configPath] = process.argv.slice(2);
  const action = actionFlag === '--enable' ? 'enable' : actionFlag === '--disable' ? 'disable' : null;
  if (!action || !configPath) {
    console.error('Usage: node register.js --enable|--disable /absolute/path/to/client-config.json');
    process.exitCode = 2;
  } else {
    configureClient(configPath, action).then(console.log).catch(error => {
      console.error(error instanceof Error ? error.message : 'Client setup failed');
      process.exitCode = 1;
    });
  }
}
