import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, ArrowRight, Check, ListTodo, Plus, RefreshCw } from 'lucide-react';
import { workspaceRequest, type PermanentMemory, type SharedTask, type TaskPack, type TaskStatus, type WorkspacePage } from '../lib/workspace';
import TaskDetail from './TaskDetail';
import './tasks.css';

const date = (at: number) => new Date(at).toLocaleString();
const states: TaskStatus[] = ['inbox','running','blocked','parked','done','archived'];
const sampleTask: SharedTask = { id: 'example', title: 'Make context portable', objective: 'Carry the plan and progress from one harness to the next.', project: 'cortex', parent_id: null, status: 'parked', priority: 'high', revision: 1, created_ms: Date.now(), updated_ms: Date.now(), handoff: 'The task model is outlined. Keep source transcripts attached to their original sessions.', next_action: 'Implement shared storage and MCP tools.', blockers: '', artifacts: [], owner: null, lease_until_ms: null };

export default function TasksPage({ sample, onConnect }: { sample: boolean; onConnect: () => void }) {
  const [tab, setTab] = useState<'tasks'|'memories'>('tasks');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [memories, setMemories] = useState<PermanentMemory[]>([]);
  const [next, setNext] = useState<number|null>(null);
  const [selected, setSelected] = useState<string|null>(null);
  const [pack, setPack] = useState<TaskPack|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('');
  const [objective, setObjective] = useState('');
  const [memory, setMemory] = useState('');
  const [source, setSource] = useState('');
  const [memoryTaskId, setMemoryTaskId] = useState('');
  const [editing, setEditing] = useState<PermanentMemory|null>(null);
  const [confidence, setConfidence] = useState<PermanentMemory['confidence']>('user_provided');
  const generation = useRef(0);
  const detailGeneration = useRef(0);
  const currentSelected = useRef(selected);
  currentSelected.current = selected;
  const fetchList = useCallback(async (offset = 0) => {
    const request = ++generation.current;
    if (sample) { setTasks([sampleTask].filter(t => (!status || t.status === status) && t.title.toLowerCase().includes(query.toLowerCase()))); setMemories([]); setNext(null); return; }
    try {
      const body = { query, status: status || undefined, include_archived: archived, offset, limit: 30 };
      if (tab === 'tasks') {
        const page = await workspaceRequest<WorkspacePage<SharedTask>>('list', body);
        if (request !== generation.current) return;
        setTasks(old => offset ? [...old, ...page.items] : page.items); setNext(page.next_offset);
      } else {
        const page = await workspaceRequest<WorkspacePage<PermanentMemory>>('memories', { ...body, status: undefined });
        if (request !== generation.current) return;
        setMemories(old => offset ? [...old, ...page.items] : page.items); setNext(page.next_offset);
      }
    } catch (e) { if (request === generation.current) setError(String(e)); }
  }, [sample, tab, query, status, archived]);
  useEffect(() => { void fetchList(); return () => { generation.current++; }; }, [fetchList]);
  const fetchDetail = useCallback(async () => {
    if (currentSelected.current !== selected) return;
    const request = ++detailGeneration.current;
    if (!selected) { setPack(null); return; }
    if (sample) { setPack({ task: sampleTask, sessions: [], follow_ups: [], context_notice: 'Invented sample task.' }); return; }
    try { const value = await workspaceRequest<TaskPack>('resume', { task_id: selected }); if (request === detailGeneration.current && currentSelected.current === selected) setPack(value); }
    catch (e) { if (request === detailGeneration.current) setError(String(e)); }
  }, [selected, sample]);
  useEffect(() => { setPack(null); void fetchDetail(); return () => { detailGeneration.current++; }; }, [fetchDetail]);
  useEffect(() => {
    if (sample) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busy && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { void fetchList(); void fetchDetail(); } }, 15_000);
    return () => window.clearInterval(timer);
  }, [sample, busy, fetchList, fetchDetail]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await fetchList(); await fetchDetail(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  const create = (event: FormEvent) => { event.preventDefault(); void mutate(async () => {
    const task = await workspaceRequest<SharedTask>('create', { id: crypto.randomUUID(), title, objective: objective || title, project });
    setTitle(''); setObjective(''); setSelected(task.id); setNotice('Task saved. Any connected harness can pick it up.');
  }); };
  const saveMemory = (event: FormEvent) => { event.preventDefault(); void mutate(async () => {
    await workspaceRequest('remember', { content: memory, source: source || 'Saved in Cortex', project, confidence, task_id: memoryTaskId.trim() || null, memory_id: editing?.id, expected_revision: editing?.revision });
    setMemory(''); setSource(''); setMemoryTaskId(''); setEditing(null); setNotice('Memory saved.');
  }); };
  return <div className="page-content task-page">
    <div className="page-heading task-heading"><div><span className="eyebrow">A shared place to pick up where you left off</span><h1>Tasks & memory</h1><p>Your work carries across Claude, Codex, and OpenCode.</p></div><button className="button button-secondary" onClick={() => { void fetchList(); void fetchDetail(); }}><RefreshCw size={15}/> Refresh</button></div>
    <div className="task-tabs" role="group" aria-label="Workspace view"><button aria-pressed={tab === 'tasks'} onClick={() => {setTab('tasks');setQuery('');}}>Tasks</button><button aria-pressed={tab === 'memories'} onClick={() => {setTab('memories');setQuery('');}}>Permanent memories</button><button className="task-connect" onClick={onConnect}>Connect harnesses <ArrowRight size={14}/></button></div>
    {sample && <div className="callout neutral">Sample workspace · switch off sample data in Settings to save real tasks and memories.</div>}
    {error && <div role="alert" className="callout warning">{error}</div>}{notice && <div role="status" className="callout neutral">{notice}</div>}
    <div className="task-filters"><input aria-label="Search tasks and memories" placeholder={tab === 'tasks' ? 'Find a task or project…' : 'Find a saved fact…'} value={query} onChange={e => setQuery(e.target.value)}/>{tab === 'tasks' && <select aria-label="Task status" value={status} onChange={e => { setStatus(e.target.value); if (e.target.value === 'archived') setArchived(true); }}><option value="">All statuses</option>{states.map(s => <option key={s}>{s}</option>)}</select>}<label><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)}/> Show archived</label></div>
    <div className="task-layout"><section className="task-list" aria-label={tab === 'tasks' ? 'Tasks' : 'Memories'}>
      {tab === 'tasks' ? <>
        <details className="surface-card task-create-card"><summary><Plus size={16}/> New task</summary>
        <form className="surface-card stack-form task-create" onSubmit={create}><span className="eyebrow">Capture a loose end</span><label htmlFor="task-title">Task</label><input id="task-title" required maxLength={300} placeholder="What needs doing?" value={title} onChange={e => setTitle(e.target.value)}/><label htmlFor="task-project">Project or repository</label><input id="task-project" maxLength={2000} placeholder="Optional project or repo path" value={project} onChange={e => setProject(e.target.value)}/><label htmlFor="task-objective">Objective</label><textarea id="task-objective" maxLength={12000} placeholder="What would finished look like?" value={objective} onChange={e => setObjective(e.target.value)}/><button className="button button-primary" disabled={sample || busy || !title.trim()}><Plus size={15}/> Add task</button></form>
        </details>
        {tasks.map(task => <button className={`surface-card task-row ${selected === task.id ? 'selected' : ''}`} key={task.id} onClick={() => setSelected(task.id)}><div><span className={`task-state ${task.status}`}>{task.stale ? 'Needs handoff' : task.status}</span><small>{task.project || 'No project'}</small></div><h3>{task.title}</h3><p>{task.next_action || task.objective}</p><footer><span>{task.owner ? `${task.owner.harness} · ${task.stale ? 'claim expired' : 'claimed'}` : 'Ready for any harness'}</span><ArrowRight size={15}/></footer></button>)}
        {!tasks.length && <div className="surface-card task-empty"><ListTodo size={26}/><h3>A clear place for your work</h3><p>Add a task here, or ask a connected harness to create one in Cortex.</p></div>}
      </> : <>
        <form className="surface-card stack-form task-create" onSubmit={saveMemory}><span className="eyebrow">{editing ? 'Edit memory' : 'Keep something worth remembering'}</span><label htmlFor="permanent-content">Memory</label><textarea id="permanent-content" required maxLength={12000} value={memory} onChange={e => setMemory(e.target.value)} placeholder="A fact, preference, or decision to remember…"/><label htmlFor="memory-source">Source</label><input id="memory-source" maxLength={4000} value={source} onChange={e => setSource(e.target.value)} placeholder="Where did this come from?"/><label htmlFor="memory-project">Project (optional)</label><input id="memory-project" maxLength={2000} value={project} onChange={e => setProject(e.target.value)}/><label htmlFor="memory-task">Associated task ID (optional)</label><input id="memory-task" maxLength={100} value={memoryTaskId} onChange={e => setMemoryTaskId(e.target.value)} placeholder="Link this fact to a task"/><label htmlFor="memory-confidence">Basis</label><select id="memory-confidence" value={confidence} onChange={e => setConfidence(e.target.value as PermanentMemory['confidence'])}><option value="user_provided">User provided</option><option value="source_supported">Source supported</option><option value="inferred">Inferred</option></select><div className="task-actions"><button className="button button-primary" disabled={sample || busy || !memory.trim()}><Check size={15}/> Save memory</button>{editing && <button type="button" className="button button-quiet" onClick={() => { setEditing(null); setMemory(''); setSource(''); setMemoryTaskId(''); }}>Cancel edit</button>}</div></form>
        {memories.map(item => <article className="surface-card saved-memory" key={item.id}><span className="eyebrow">{item.status === 'archived' ? 'Archived' : item.confidence.replaceAll('_',' ')}{item.project && ` · ${item.project}`}</span><p>{item.content}</p><small>{item.source} · {date(item.updated_ms)}</small><div className="task-actions"><button className="text-link" disabled={busy} onClick={() => { setEditing(item); setMemory(item.content); setSource(item.source); setProject(item.project); setConfidence(item.confidence); setMemoryTaskId(item.task_id || ''); }}>Edit</button><button className="text-link" disabled={busy} onClick={() => void mutate(async () => { await workspaceRequest('forget', { memory_id: item.id, expected_revision: item.revision, restore: item.status === 'archived' }); })}><Archive size={14}/>{item.status === 'archived' ? 'Restore' : 'Archive'}</button></div></article>)}
        {!memories.length && <div className="surface-card task-empty"><h3>Remember it once</h3><p>Saved facts stay available to every connected harness, with their source and last update.</p></div>}
      </>}
      {next !== null && <button className="button button-secondary" onClick={() => void fetchList(next)}>Load more</button>}
    </section><aside className="task-detail">{tab === 'tasks' && pack ? <TaskDetail key={pack.task.id} pack={pack} sample={sample} busy={busy} mutate={mutate} onSelect={setSelected}/> : <div className="surface-card task-empty"><span className="task-connected">Claude <span>↔</span> Cortex <span>↔</span> Codex</span><h2>One thread through your work.</h2><p>{tab === 'tasks' ? 'Select a task to review its handoff, follow-ups, and original conversations.' : 'Permanent memories are explicitly saved facts. Captured activity remains available in Memory and Ask Cortex.'}</p><p>Enable Connected AI Apps in Settings and connect the Cortex MCP bridge to each harness.</p></div>}</aside></div>
  </div>;
}

