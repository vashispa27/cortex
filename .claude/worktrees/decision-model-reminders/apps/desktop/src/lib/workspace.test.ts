import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDesktopClaim, ownsDesktopTask, saveDesktopClaim, transcriptBatches, type SharedTask } from './workspace';

describe('portable transcript batching', () => {
  it('preserves large records and stable sequence offsets without splitting unicode', () => {
    const original = {message:{role:'assistant',content:'🪷\n"'.repeat(16000)}};
    const batches = transcriptBatches(`${JSON.stringify(original)}\n{}\n`);
    const records = batches.flatMap(b => b.jsonl.split('\n').map(line=>JSON.parse(line)));
    expect(JSON.parse(records.filter(r=>r._cortex_transcript_fragment).map(r=>r.text).join(''))).toEqual(original);
    let offset=0;
    for(const batch of batches) {expect(batch.start_sequence).toBe(offset);offset+=batch.jsonl.split('\n').length;expect(new TextEncoder().encode(batch.jsonl).length).toBeLessThan(28000);}
  });
  it('validates the entire import before uploading batches', () => {
    expect(()=>transcriptBatches('{}\nnot json')).toThrow('record 2');
    expect(()=>transcriptBatches('[]')).toThrow('must be an object');
  });
});

describe('desktop ownership', () => {
  afterEach(()=>vi.unstubAllGlobals());
  it('retains tokens only for the matching Cortex session and clears on release', () => {
    const data=new Map<string,string>();
    vi.stubGlobal('sessionStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
    saveDesktopClaim({taskId:'task',token:'secret',sessionId:'desktop-session'});
    const task={id:'task',owner:{harness:'cortex',session_id:'desktop-session'}} as SharedTask;
    expect(ownsDesktopTask(task)).toBe(true);
    expect(ownsDesktopTask({...task,owner:{harness:'claude',session_id:'another'}})).toBe(false);
    clearDesktopClaim('task'); expect(ownsDesktopTask(task)).toBe(false);
  });
});
