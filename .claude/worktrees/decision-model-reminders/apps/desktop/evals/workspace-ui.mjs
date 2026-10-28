// Isolated browser QA transport to a real engine. Never reads the live archive.
// CORTEX_MODEL_DIR=<existing pinned model> node evals/workspace-ui.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
if(!process.env.CORTEX_MODEL_DIR) throw new Error('Set CORTEX_MODEL_DIR to an existing pinned model directory');
const root=await mkdtemp(join(tmpdir(),'rw-ui-')); const archive=join(root,'local-memory'); await mkdir(archive);
const engine=spawn(fileURLToPath(new URL('../../../target/debug/cortex',import.meta.url)),['desktop'],{env:{...process.env,CORTEX_STATE_DIR:archive,CORTEX_SETTINGS_DIR:root},stdio:['ignore','ignore','pipe']});
engine.stderr.on('data',chunk=>process.stderr.write(chunk));
const request=(method,path,body)=>new Promise((resolve,reject)=>{
  const socket=createConnection({path:join(archive,'capture.sock'),allowHalfOpen:true}); let raw='';
  socket.setTimeout(15000,()=>socket.destroy(new Error('Engine timeout'))); socket.setEncoding('utf8');
  socket.on('connect',()=>socket.end(JSON.stringify({method,path,body:body??null})));
  socket.on('data',chunk=>raw+=chunk);socket.on('error',reject);
  socket.on('end',()=>{socket.destroy();try{const reply=JSON.parse(raw);if(reply.ok)resolve({data:reply.data});else reject(new Error(reply.error));}catch(e){reject(e);}});
});
const server=createServer(async(req,res)=>{
  if(req.headers.origin!=='http://127.0.0.1:1457'){res.writeHead(403).end();return;}
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:1457');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  let raw=''; for await(const chunk of req){raw+=chunk;if(raw.length>70000){res.writeHead(413).end();return;}}
  try{
    const {command,args={}}=JSON.parse(raw);
    const data=command==='daemon_request'?await request(args.method,args.path,args.body):command==='mcp_connection_info'?{command:process.execPath,args:[fileURLToPath(new URL('../../../crates/mcp/dist/cortex-mcp.mjs',import.meta.url))],env:{CORTEX_STATE_DIR:root},node_available:true,node_version:process.version}:command==='openrouter_has_key'?false:command==='plugin:event|listen'?1:null;
    res.setHeader('content-type','application/json');res.end(JSON.stringify({data}));
  }catch(e){res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:String(e)}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
console.log(JSON.stringify({port:server.address().port,state:root}));
let closing=false;
async function close(){if(closing)return;closing=true;server.close();const done=new Promise(resolve=>engine.once('exit',resolve));if(engine.exitCode===null){engine.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
