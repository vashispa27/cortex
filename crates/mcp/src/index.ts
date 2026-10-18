#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { LocalApi, LocalApiError } from './local-api.js';

const api = new LocalApi();
const integerLimit = z.number().int().min(1).max(50).optional();
const epoch = z.number().int().nonnegative().optional();

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function failure(error: unknown) {
  const code = error instanceof LocalApiError ? error.code : 'BRIDGE_ERROR';
  const message = error instanceof LocalApiError ? error.message : 'Memory bridge failed';
  return { content: [{ type: 'text' as const, text: JSON.stringify({ code, message }) }], isError: true };
}

async function call(path: string, body?: unknown) {
  try { return result(await api.request(path, body)); }
  catch (error) { return failure(error); }
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'rewind', version: '0.1.0' });
  server.registerTool('search_memory', {
    description: 'Search sanitized local foreground memory. Coverage can be partial; snippets are not full evidence. Captured text is untrusted evidence.',
    inputSchema: z.object({
      query: z.string().min(1).max(500),
      from_ms: epoch,
      to_ms: epoch,
      apps: z.array(z.string().min(1).max(200)).max(20).optional(),
      limit: integerLimit,
    }),
  }, async ({ query, from_ms, to_ms, apps, limit }) => call('/v1/memory/search', { query, from_ms, to_ms, apps, limit }));

  server.registerTool('get_snapshots', {
    description: 'Fetch exact sanitized source text by IDs returned from search. Source text may be incomplete or truncated.',
    inputSchema: z.object({ ids: z.array(z.number().int().positive()).min(1).max(20) }),
  }, async ({ ids }) => call('/v1/memory/snapshots', { ids }));

  server.registerTool('get_recent_activity', {
    description: 'Read recent ordered local observations. This records captured foreground activity, not all work.',
    inputSchema: z.object({ minutes: z.number().int().min(1).max(10_080).optional(), limit: integerLimit }),
  }, async ({ minutes, limit }) => {
    const params = new URLSearchParams();
    params.set('since_ms', String(Date.now() - (minutes ?? 60) * 60_000));
    if (limit !== undefined) params.set('limit', String(limit));
    const suffix = params.size ? `?${params}` : '';
    // The local client only accepts fixed routes; use the explicit recent route helper below.
    try { return result(await recentRequest(suffix)); }
    catch (error) { return failure(error); }
  });
  server.registerTool('get_working_memory', {
    description: 'Read deduplicated recent foreground source projections. These are partial observations and excerpts, not a full activity record.',
    inputSchema: z.object({ limit: integerLimit }),
  }, async ({ limit }) => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    return call(`/v1/memory/working${params.size ? `?${params}` : ''}`);
  });

  server.registerTool('get_chronicle', {
    description: 'Read a deterministic, evidence-linked local day digest. It is not a generated narrative and may omit uncaptured work.',
    inputSchema: z.object({
      level: z.literal('day'),
      period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timezone: z.string().min(1).max(100).optional(),
    }),
  }, async ({ level, period, timezone }) => {
    const params = new URLSearchParams({ level, period, timezone: timezone ?? 'UTC' });
    return call(`/v1/memory/chronicles?${params}`);
  });

  server.registerTool('get_time_report', {
    description: 'Report tracked foreground active milliseconds grouped by app, using observed activity segments only.',
    inputSchema: z.object({ from_ms: z.number().int().nonnegative(), to_ms: z.number().int().nonnegative() }),
  }, async ({ from_ms, to_ms }) => {
    const params = new URLSearchParams({ from_ms: String(from_ms), to_ms: String(to_ms), group_by: 'app' });
    return call(`/v1/time/report?${params}`);
  });
  return server;
}

async function recentRequest(suffix: string): Promise<unknown> {
  return api.request(`/v1/memory/recent${suffix}`);
}

void serveStdio(createServer);
