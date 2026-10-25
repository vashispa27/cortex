import { describe, expect, it } from 'vitest';
import { mcpConfiguration } from './mcp';
const info={command:'/opt/homebrew/bin/node',args:['/Library/Application Support/Cortex/mcp/cortex-mcp.mjs'],env:{CORTEX_STATE_DIR:'/state'},node_available:true,node_version:'v24'};
describe('harness configuration',()=>{
  it('uses each harness transport shape without losing spaces in paths',()=>{
    expect(JSON.parse(mcpConfiguration(info,'json')).mcpServers.cortex.args).toEqual(info.args);
    const open=JSON.parse(mcpConfiguration(info,'opencode')).mcp.cortex;
    expect(open.command).toEqual([info.command,...info.args]); expect(open.environment).toEqual(info.env);
    const codex=mcpConfiguration(info,'toml'); expect(codex).toContain('[mcp_servers.cortex]'); expect(codex).toContain(JSON.stringify(info.args));
  });
});
