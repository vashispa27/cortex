#!/usr/bin/env python3
"""Offline adapter smoke check: uses a disposable archive, capture OFF, no LLM.
Build first with `cargo build -p open-memory`. Uses OPEN_MEMORY_MODEL_DIR when
provided, otherwise the pinned model already cached by Rewind. No personal data
is ingested, queried, deleted, or sent to a provider.
"""
from pathlib import Path
import tempfile,sqlite3,subprocess,socket,json,os,time,shutil
root=Path(tempfile.mkdtemp(prefix='rw-',dir='/tmp')); state=root/'local-memory'
state.mkdir(); old=sqlite3.connect(root/'memory.sqlite3')
old.executescript('CREATE TABLE snapshots(id INTEGER PRIMARY KEY,app_id TEXT,title TEXT,url TEXT,body TEXT,first_seen_ms INTEGER,last_seen_ms INTEGER,window_session_id TEXT); CREATE TABLE observations(snapshot_id INTEGER,observed_ms INTEGER); CREATE TABLE settings(key TEXT,value_json TEXT);')
old.execute('INSERT INTO snapshots VALUES(1,?,?,?,?,?,?,?)',('test.mail','Travel discussion','https://example.test/mail/123','Mira postponed our appointment. The meeting will happen on Friday at 10 AM.',1792300000000,1792300000000,'mail-window'))
old.execute('INSERT INTO observations VALUES(1,1792300000000)');old.execute("INSERT INTO settings VALUES('capture_enabled','false')");old.commit();old.close()
env=os.environ.copy();env['OPEN_MEMORY_STATE_DIR']=str(state);env['REWIND_SETTINGS_DIR']=str(root)
env['OPEN_MEMORY_MODEL_DIR']=env.get('OPEN_MEMORY_MODEL_DIR') or str(Path.home()/'Library/Application Support/Open Memory/local-memory/models/1e5a03f8eeb2c98b928fbbd846f22f816360919f')
log=open(root/'engine.log','w');proc=subprocess.Popen([str(Path(__file__).resolve().parents[1]/'target/debug/open-memory'),'desktop'],env=env,stdout=log,stderr=log)
def req(method,path,body=None):
 c=socket.socket(socket.AF_UNIX);c.settimeout(60);c.connect(str(state/'capture.sock'));c.sendall(json.dumps({'method':method,'path':path,'body':body}).encode());c.shutdown(socket.SHUT_WR);data=b''
 while more:=c.recv(65536):data+=more
 c.close();v=json.loads(data);assert v['ok'],v;return v['data']
try:
 for _ in range(300):
  if proc.poll() is not None: raise RuntimeError((root/'engine.log').read_text())
  if (state/'capture.sock').exists():break
  time.sleep(.1)
 status=req('GET','/v1/status');print('STATUS',json.dumps(status))
 for query in ['When is the appointment with Mira?','Who delayed the meeting?','Who pushed our get-together back?']:
  result=req('POST','/v1/memory/retrieve',{'query':query})
  print('QUERY',query,'ENGINE',result['retrieval'],'ABSTAINED',result['abstained'],'HITS',[(h['title'],h['score']) for h in result['results']])
  assert result['retrieval']['engine']=='qdrant_edge_hybrid'
  assert result['results'] and result['results'][0]['title']=='Travel discussion'
  assert 'Friday' in result['sources'][0]['text']
 settings=req('GET','/v1/settings'); patched=req('PATCH','/v1/settings',{'expected_version':settings['version'],'capture_paused':True});assert patched['capture_paused']
 deleted=req('POST','/v1/privacy/delete',{'scope':'all','confirmation':'DELETE ALL LOCAL MEMORY'})
 assert deleted['deleted_snapshots']==1
 assert req('GET','/v1/status')['snapshot_count']==0
 assert not req('POST','/v1/memory/retrieve',{'query':'Mira appointment'})['results']
 assert sqlite3.connect(root/'memory.sqlite3').execute('SELECT COUNT(*) FROM snapshots').fetchone()[0]==0
 print('SMOKE_OK',root)
finally:
 proc.terminate();proc.wait(timeout=15);log.close();shutil.rmtree(root)
