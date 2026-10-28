export type McpConnection = { command: string; args: string[]; env: Record<string,string>; node_available: boolean; node_version: string | null };
export function mcpConfiguration(info: McpConnection, format: string): string {
  const entry = { command: info.command, args: info.args, env: info.env };
  if (format === 'opencode') return JSON.stringify({ mcp: { cortex: { type: 'local', command: [info.command, ...info.args], environment: info.env, enabled: true } } }, null, 2);
  if (format === 'toml') return `[mcp_servers.cortex]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n\n[mcp_servers.cortex.env]\nCORTEX_STATE_DIR = ${JSON.stringify(entry.env.CORTEX_STATE_DIR)}`;
  return JSON.stringify({ mcpServers: { cortex: entry } }, null, 2);
}
