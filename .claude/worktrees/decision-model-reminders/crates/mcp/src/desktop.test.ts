import { strict as assert } from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const binary=process.env.CORTEX_DESKTOP_BIN;
const model=process.env.CORTEX_MODEL_DIR;

test('real desktop engine shares tasks with MCP and enforces live access settings', {skip:!binary || !model,timeout:60_000}, async () => {
  const root=await mkdtemp(join(tmpdir(),'rw-desktop-'));
  const archive=join(root,'local-memory'); await mkdir(archive);
  let engine:ChildProcess|undefined;
  let stderr='';
  const env={...process.env,CORTEX_STATE_DIR:archive,CORTEX_SETTINGS_DIR:root,CORTEX_MODEL_DIR:model!};
  const socketRequest=(method:string,path:string,body?:unknown):Promise<{ok:boolean;data:any;error?:string}>=>new Promise((resolve,reject)=>{
    const socket=createConnection({path:join(archive,'capture.sock'),allowHalfOpen:true});let raw='';
    socket.setTimeout(10_000,()=>socket.destroy(new Error('timeout')));
    socket.setEncoding('utf8');socket.on('data',chunk=>{raw+=chunk;});socket.on('error',reject);
    socket.on('connect',()=>socket.end(JSON.stringify({method,path,body:body??null})));
    socket.on('end',()=>{socket.destroy();try{resolve(JSON.parse(raw));}catch(e){reject(e);}});
  });
  const start=async()=>{
    engine=spawn(binary!,['desktop'],{env,stdio:['ignore','ignore','pipe']});
    engine.stderr?.on('data',chunk=>{stderr+=String(chunk);});
    for(let i=0;i<150;i++) {
      if(engine.exitCode!==null)throw new Error(stderr);
      try {const reply=await socketRequest('GET','/v1/health');if(reply.ok)return;}catch{/* Startup. */}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Desktop startup timeout: '+stderr);
  };
  const stop=async()=>{if(engine && engine.exitCode===null){const closed=new Promise<void>(resolve=>engine!.once('exit',()=>resolve()));engine.kill('SIGTERM');await closed;}};
  const client=new Client({name:'desktop-test',version:'1'});
  try {
    await start();
    const bridge=join(dirname(fileURLToPath(import.meta.url)),'index.js');
    await client.connect(new StdioClientTransport({command:process.execPath,args:[bridge],env:{...process.env,CORTEX_STATE_DIR:root} as Record<string,string>}));
    const blocked=await client.callTool({name:'list_tasks',arguments:{}});assert.equal(blocked.isError,true);
    let settings=(await socketRequest('GET','/v1/settings')).data;
    const enabled=await socketRequest('PATCH','/v1/settings',{expected_version:settings.version,mcp_enabled:true});assert.equal(enabled.ok,true,enabled.error);
    const created=await client.callTool({name:'create_task',arguments:{id:'portable',title:'Desktop to harness'}});assert.notEqual(created.isError,true,JSON.stringify(created));
    const listed=await socketRequest('POST','/v1/workspace/list',{});assert.equal(listed.data.items[0].title,'Desktop to harness');
    const scheduled = await client.callTool({name:'create_schedule',arguments:{id:'desktop-reminder',schedule:{title:'Desktop reminder',timezone:'UTC',timing:{type:'daily',time:'08:00'},action:{type:'reminder',message:'Send resume'}}}});
    assert.notEqual(scheduled.isError,true,JSON.stringify(scheduled));
    const schedules=await socketRequest('POST','/v1/schedules/list',{});assert.equal(schedules.data.items[0].title,'Desktop reminder');
    const paused=await socketRequest('POST','/v1/schedules/pause',{schedule_id:'desktop-reminder',expected_revision:1});assert.equal(paused.ok,true,paused.error);
    await stop();await start();
    const recovered=await client.callTool({name:'get_schedule',arguments:{schedule_id:'desktop-reminder'}});assert.notEqual(recovered.isError,true,JSON.stringify(recovered));assert.match(JSON.stringify(recovered.content),/paused/);
    const pack=await client.callTool({name:'get_task_resume_pack',arguments:{task_id:'portable'}});assert.notEqual(pack.isError,true,JSON.stringify(pack));assert.match(JSON.stringify(pack.content),/Desktop to harness/);
    settings=(await socketRequest('GET','/v1/settings')).data;
    await socketRequest('PATCH','/v1/settings',{expected_version:settings.version,mcp_enabled:false});
    const disabled=await client.callTool({name:'list_tasks',arguments:{}});assert.equal(disabled.isError,true);
    const schedulesDisabled=await client.callTool({name:'list_schedules',arguments:{}});assert.equal(schedulesDisabled.isError,true);
  } finally {await client.close();await stop();await rm(root,{recursive:true,force:true});}
});
