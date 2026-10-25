import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ArrowUp, ChevronsUp, CornerDownRight, Plug, Plus, RefreshCw, Search } from 'lucide-react';
import { desktopSession, ownsDesktopTask, readDesktopClaims, workspaceRequest, type SharedTask, type TaskPack, type TaskStatus, type WorkspacePage } from '../lib/workspace';
import Modal from './Modal';
import TaskDetail from './TaskDetail';
import McpSetup from './McpSetup';
import './tasks.css';

const columns: { status: TaskStatus; label: string }[] = [
  { status: 'inbox', label: 'To do' }, { status: 'running', label: 'In progress' }, { status: 'blocked', label: 'Blocked' },
  { status: 'parked', label: 'Parked' }, { status: 'done', label: 'Done' }, { status: 'archived', label: 'Archived' },
];
const now = Date.now();
const sampleTasks: SharedTask[] = [
  { id: 'example', title: 'Make context portable', objective: 'Carry the plan and progress from one harness to the next.', project: 'cortex', parent_id: null, status: 'parked', priority: 'high', revision: 1, created_ms: now, updated_ms: now, handoff: 'The task model is outlined. Keep source transcripts attached to their original sessions.', next_action: 'Implement shared storage and MCP tools.', blockers: '', artifacts: [], owner: null, lease_until_ms: null },
  { id: 'example-2', title: 'Wire reminders into chat', objective: 'Let chat create schedules.', project: 'cortex', parent_id: null, status: 'running', priority: 'normal', revision: 1, created_ms: now, updated_ms: now, handoff: '', next_action: 'Add the decide tool.', blockers: '', artifacts: [], owner: { harness: 'claude', session_id: 'sample' }, lease_until_ms: now + 600_000 },
  { id: 'example-3', title: 'Notch drops focus on second open', objective: '', project: 'cortex', parent_id: 'example', status: 'inbox', priority: 'urgent', revision: 1, created_ms: now, updated_ms: now, handoff: '', next_action: '', blockers: '', artifacts: [], owner: null, lease_until_ms: null },
];
const leased = (task: SharedTask) => (task.lease_until_ms ?? 0) > Date.now();
const lockedByOther = (task: SharedTask) => task.status === 'running' && leased(task) && !ownsDesktopTask(task);

/** Jira-style board over the shared workspace tasks; the existing TaskDetail opens in a dialog. */
export function AgentSpacePage({ sample = false, onConnect }: { sample?: boolean; onConnect?: () => void }) {
  const [tasks, setTasks] = useState<SharedTask[]>(() => sample ? sampleTasks : []);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [ownerHarness, setOwnerHarness] = useState('');
  const [ownership, setOwnership] = useState('all');
  const [archived, setArchived] = useState(false);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pack, setPack] = useState<TaskPack | null>(null);
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const generation = useRef(0);
  const detailGeneration = useRef(0);
  const currentSelected = useRef(selected);
  currentSelected.current = selected;

  const fetchList = useCallback(async () => {
    const request = ++generation.current;
    if (sample) { setTasks(sampleTasks); setMore(false); return; }
    try {
      const items: SharedTask[] = []; let offset: number | null = 0;
      while (offset !== null && items.length < 300) {
        const page: WorkspacePage<SharedTask> = await workspaceRequest('list', { query, project: project || undefined, owner_harness: ownerHarness || undefined, ownership, include_archived: archived, offset, limit: 100 });
        if (request !== generation.current) return;
        items.push(...page.items); offset = page.next_offset;
      }
      setTasks(items); setMore(offset !== null); setError('');
    } catch (e) { if (request === generation.current) setError(String(e)); }
  }, [sample, query, project, ownerHarness, ownership, archived]);
  useEffect(() => { const timer = window.setTimeout(() => void fetchList(), query ? 180 : 0); return () => { window.clearTimeout(timer); generation.current++; }; }, [fetchList]);

  const fetchDetail = useCallback(async () => {
    if (currentSelected.current !== selected) return;
    const request = ++detailGeneration.current;
    if (!selected) { setPack(null); return; }
    if (sample) { const task = sampleTasks.find(t => t.id === selected)!; setPack({ task, sessions: [], follow_ups: sampleTasks.filter(t => t.parent_id === task.id), context_notice: 'Invented sample task.' }); return; }
    try { const value = await workspaceRequest<TaskPack>('resume', { task_id: selected }); if (request === detailGeneration.current && currentSelected.current === selected) setPack(value); }
    catch (e) { if (request === detailGeneration.current) setError(String(e)); }
  }, [selected, sample]);
  useEffect(() => { setPack(null); void fetchDetail(); return () => { detailGeneration.current++; }; }, [fetchDetail]);
  useEffect(() => {
    if (sample) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busy && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) { void fetchList(); void fetchDetail(); } }, 15_000);
    return () => window.clearInterval(timer);
  }, [sample, busy, fetchList, fetchDetail]);

  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); await fetchList(); await fetchDetail(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  const move = (task: SharedTask, status: TaskStatus) => {
    if (task.status === status || status === 'running' || lockedByOther(task) || sample) return;
    setTasks(old => old.map(t => t.id === task.id ? { ...t, status } : t));
    void mutate(async () => { await workspaceRequest('update', { task_id: task.id, expected_revision: task.revision, status, lease_token: ownsDesktopTask(task) ? readDesktopClaims()[task.id]?.token : undefined }); });
  };
  const drop = (status: TaskStatus) => (event: DragEvent) => {
    event.preventDefault(); setOver(null);
    const task = tasks.find(t => t.id === event.dataTransfer.getData('text/plain'));
    if (task) move(task, status);
  };

  const projects = useMemo(() => [...new Set(tasks.map(t => t.project).filter(Boolean))].sort(), [tasks]);
  const harnesses = useMemo(() => [...new Set(tasks.flatMap(t => t.owner ? [t.owner.harness] : []))].sort(), [tasks]);
  const titles = useMemo(() => new Map(tasks.map(t => [t.id, t.title])), [tasks]);
  const visible = columns.filter(c => c.status !== 'archived' || archived);
  const dragged = tasks.find(t => t.id === dragging);
  const filtered = !!(query || project || ownerHarness || ownership !== 'all');

  return <div className="cx-page agent-board-page">
    <header className="cx-page-head">
      <div><h1>Agent Space</h1><p>Shared tasks and handoffs for Claude, Codex, OpenCode and other MCP harnesses. Saving a handoff lets another harness pick it up; it does not launch an agent.</p></div>
      <div className="cx-head-actions">
        <button type="button" className="button button-secondary" onClick={() => onConnect ? onConnect() : setConnecting(true)}><Plug size={15}/> Connect harnesses</button>
        <button type="button" className="button button-primary" disabled={sample} onClick={() => setCreating('inbox')}><Plus size={16}/> Create task</button>
      </div>
    </header>
    {sample && <div className="callout neutral board-callout">Sample workspace · switch off sample data in Settings to manage real tasks.</div>}
    {error && <div role="alert" className="callout warning board-callout">{error}</div>}
    <div className="cx-toolbar board-toolbar">
      <label className="cx-search"><Search size={14}/><input type="search" aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <select aria-label="Filter project" value={project} onChange={e => setProject(e.target.value)}><option value="">All projects</option>{[...new Set([...projects, ...(project ? [project] : [])])].map(p => <option key={p} value={p}>{p}</option>)}</select>
      <select aria-label="Owner harness" value={ownerHarness} onChange={e => setOwnerHarness(e.target.value)}><option value="">Any harness</option>{[...new Set([...harnesses, ...(ownerHarness ? [ownerHarness] : [])])].map(h => <option key={h} value={h}>{h}</option>)}</select>
      <select aria-label="Task ownership filter" value={ownership} onChange={e => setOwnership(e.target.value)}><option value="all">All ownership</option><option value="claimed">Live claims</option><option value="unclaimed">Unclaimed</option><option value="expired">Expired claims</option></select>
      <label className="board-check"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)}/> Archived</label>
      {filtered && <button type="button" className="text-link" onClick={() => { setQuery(''); setProject(''); setOwnerHarness(''); setOwnership('all'); }}>Clear</button>}
      <button type="button" className="icon-button board-refresh" aria-label="Refresh" title="Refresh" onClick={() => { void fetchList(); void fetchDetail(); }}><RefreshCw size={15}/></button>
    </div>
    <div className="board" role="list" aria-label="Task board">
      {visible.map(column => {
        const items = tasks.filter(t => t.status === column.status);
        const accepts = !!dragged && column.status !== 'running' && dragged.status !== column.status;
        return <section key={column.status} role="listitem" aria-label={`${column.label} column`} className={`board-column ${column.status} ${over === column.status && accepts ? 'drop-target' : ''} ${dragged && !accepts ? 'drop-disabled' : ''}`}
          onDragOver={e => { if (accepts) { e.preventDefault(); setOver(column.status); } }} onDragLeave={() => setOver(null)} onDrop={drop(column.status)}>
          <header className="board-column-head"><span className="board-dot"/><h2>{column.label}</h2><span className="board-count">{items.length}</span>
            {column.status !== 'running' && column.status !== 'archived' && !sample && <button type="button" className="icon-button" aria-label={`Add task to ${column.label}`} title="Add task" onClick={() => setCreating(column.status)}><Plus size={14}/></button>}
          </header>
          <div className="board-cards">
            {items.map(task => {
              const locked = lockedByOther(task);
              return <button type="button" key={task.id} className={`board-card ${dragging === task.id ? 'dragging' : ''}`} draggable={!locked && !sample} onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; setDragging(task.id); }} onDragEnd={() => { setDragging(null); setOver(null); }} onClick={() => setSelected(task.id)}>
                {task.parent_id && <span className="board-parent"><CornerDownRight size={11}/>{titles.get(task.parent_id) ?? 'Follow-up'}</span>}
                <h3>{task.title}</h3>
                {(task.blockers && task.status === 'blocked' ? task.blockers : task.next_action) && <p>{task.blockers && task.status === 'blocked' ? task.blockers : task.next_action}</p>}
                <footer>
                  {task.project && <span className="board-project" title={task.project}>{task.project.split('/').filter(Boolean).pop()}</span>}
                  {(task.priority === 'high' || task.priority === 'urgent') && <span className={`board-priority ${task.priority}`} title={`${task.priority} priority`}>{task.priority === 'urgent' ? <ChevronsUp size={13}/> : <ArrowUp size={13}/>}</span>}
                  <span className="board-spacer"/>
                  {task.owner ? <span className={`board-owner ${task.stale || !leased(task) ? 'stale' : ''}`} title={`${task.owner.harness} · ${task.stale || !leased(task) ? 'claim expired' : 'claimed'}`}>{task.owner.harness.slice(0, 2)}</span> : <span className="board-owner empty" title="Unclaimed"/>}
                </footer>
              </button>;
            })}
            {!items.length && <div className="board-empty">{dragged && accepts ? 'Drop here' : column.status === 'inbox' && !filtered ? 'Nothing to do yet' : ''}</div>}
          </div>
        </section>;
      })}
    </div>
    {more && <p className="cx-hint board-more">Showing the first 300 tasks. Narrow the filters to find older work.</p>}
    {selected && <Modal title={pack?.task.title ?? 'Task'} eyebrow={pack?.task.project || undefined} size="wide" onClose={() => setSelected(null)}>
      {pack ? <TaskDetail key={pack.task.id} pack={pack} sample={sample} busy={busy} mutate={mutate} onSelect={setSelected}/> : <p role="status" className="cx-hint">Loading task…</p>}
    </Modal>}
    {creating && <CreateTask status={creating} busy={busy} projects={projects} defaultProject={project} onClose={() => setCreating(null)} onCreate={(title, taskProject, objective) => mutate(async () => {
      const task = await workspaceRequest<SharedTask>('create', { id: crypto.randomUUID(), title, objective: objective || title, project: taskProject, harness: 'cortex', session_id: desktopSession() });
      if (creating !== 'inbox') await workspaceRequest('update', { task_id: task.id, expected_revision: task.revision, status: creating });
      setCreating(null);
    })}/>}
    {connecting && <Modal title="Connect your harnesses" size="wide" onClose={() => setConnecting(false)}>
      <section aria-label="Agent Space MCP setup"><p className="cx-hint">Enable Settings → Connected AI apps → Allow Cortex MCP access before connecting.</p><McpSetup/></section>
    </Modal>}
  </div>;
}

function CreateTask({ status, busy, projects, defaultProject, onClose, onCreate }: { status: TaskStatus; busy: boolean; projects: string[]; defaultProject: string; onClose: () => void; onCreate: (title: string, project: string, objective: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(defaultProject);
  const [objective, setObjective] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); void onCreate(title.trim(), project.trim(), objective.trim()); };
  return <Modal title="Create task" eyebrow={columns.find(c => c.status === status)?.label} onClose={onClose} locked={busy}>
    <form className="cx-form" onSubmit={submit}>
      <label className="cx-field">Title<input required maxLength={300} placeholder="What needs doing?" value={title} onChange={e => setTitle(e.target.value)}/></label>
      <label className="cx-field">Project<input maxLength={2000} list="agent-space-projects" placeholder="Optional project or repo path" value={project} onChange={e => setProject(e.target.value)}/><datalist id="agent-space-projects">{projects.map(p => <option key={p} value={p}/>)}</datalist></label>
      <label className="cx-field">Done looks like<textarea maxLength={12000} rows={3} placeholder="Optional" value={objective} onChange={e => setObjective(e.target.value)}/></label>
      <div className="cx-modal-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create'}</button></div>
    </form>
  </Modal>;
}

export default AgentSpacePage;
