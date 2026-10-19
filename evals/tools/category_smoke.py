import argparse, json, os, pathlib, subprocess, tempfile, threading

parser = argparse.ArgumentParser(description="Exercise category ingest and routing with a mock local model and invented text")
parser.add_argument("--bin", default="target/debug/rewind", help="Path to the built rewind binary")
args = parser.parse_args()
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_POST(self):
  req=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  system=req['messages'][0]['content']; obj=json.loads(req['messages'][1]['content'])
  if 'Segment the screen' in system:
   lines=obj['lines']; result={'objects':[{'start_line':i+1,'end_line':i+1,'category':'post' if 'post:' in line['text'].lower() else 'message'} for i,line in enumerate(lines)]}
  else: result={'categories':['post']}
  data=json.dumps({'choices':[{'message':{'content':json.dumps(result)}}]}).encode()
  self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
server=HTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='rewind-category-smoke-') as root:
 p=pathlib.Path(root); (p/'corpus').mkdir(); (p/'pages').mkdir()
 fixture={'app_id':'com.example.Browser','title':'Feed','url':'https://example.org/','source_type':'browser','observed_ms':1792230000000,'roots':[{'role':'AXStaticText','name':'','value':'Post: Evals improve model quality','ancestor_path':[{'role':'AXMain','name':'main'}]},{'role':'AXStaticText','name':'','value':'Message: Dinner is at seven','ancestor_path':[{'role':'AXMain','name':'main'}]}]}
 (p/'corpus'/'mixed.json').write_text(json.dumps(fixture))
 gold={'id':'smoke','type':'keyword','split':'dev','query':'Which post says evals improve model quality','relevant':[{'fixture':'mixed','answer_text':'Evals improve model quality'}],'expect_abstain':False}
 (p/'gold.jsonl').write_text(json.dumps(gold)+'\n')
 env=os.environ.copy(); env.update({'REWIND_CATEGORY_ENABLED':'1','REWIND_CATEGORY_ROUTE':'0','REWIND_CATEGORY_STRICT':'1','REWIND_CATEGORY_URL':f'http://127.0.0.1:{server.server_port}/v1/chat/completions','REWIND_CATEGORY_MODEL':'mock'})
 cmd=[args.bin,'eval','--corpus',str(p/'corpus'),'--gold',str(p/'gold.jsonl'),'--facts',str(p/'pages'),'--param','category_route=off','--param','derived=off','--sweep','category_route=on','--out',str(p/'result.json')]
 proc=subprocess.run(cmd,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
 print('exit',proc.returncode); print(proc.stdout[-2500:]); print(proc.stderr[-1500:])
 if proc.returncode: raise SystemExit(proc.returncode)
 for f in sorted(p.glob('result*.json')):
  data=json.loads(f.read_text()); print(f.name, 'category_counts=',data['meta']['category_counts'],'route=',data['meta']['params']['category_route'])
  assert data['meta']['category_counts']=={'message':1,'post':1}
  if data['meta']['params']['category_route']:
   print('routed query filters:',json.dumps(data['queries'][0].get('filter'))); print('routed top chunks:',[x['text'] for x in data['queries'][0]['top5_chunks']]); assert all('Dinner is at seven' not in x['text'] for x in data['queries'][0]['top5_chunks']); assert any('Evals improve model quality' in x['text'] for x in data['queries'][0]['top5_chunks'])
server.shutdown()
