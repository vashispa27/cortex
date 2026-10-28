import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Pause, Pencil, Play, Plus, RefreshCw, Upload, X } from 'lucide-react';
import {
  clearDesktopClaim, desktopSession, downloadWorkspaceFile, ownsDesktopTask, readDesktopClaims,
  saveDesktopClaim, transcriptBatches, workspaceRequest, type SharedTask, type TaskPack, type TaskStatus,
} from '../lib/workspace';

type TranscriptRecord = { sequence: number; harness: string; message: { role: string; content: unknown }; raw: unknown };
type TaskEvent = { id: number; action: string; at_ms: number; record: Partial<SharedTask> & { session_id?: string; inserted?: number; actor?: SharedTask['owner'] } };
type Props = {
  pack: TaskPack; sample: boolean; busy: boolean;
  mutate: (action: () => Promise<void>) => Promise<void>; onSelect: (id: string) => void;
};
const date = (at: number) => new Date(at).toLocaleString();
const textContent = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(part => typeof part === 'object' && part && 'text' in part ? String(part.text) : JSON.stringify(part, null, 2)).join('\n');
  return value == null ? '' : JSON.stringify(value, null, 2);
};
const editableFields = (task: SharedTask) => ({
  title: task.title, objective: task.objective, project: task.project, handoff: task.handoff,
  next_action: task.next_action, blockers: task.blockers, priority: task.priority,
  artifacts: task.artifacts.map(a => ({ ...a })), status: task.status,
});

export default function TaskDetail({ pack, sample, busy, mutate, onSelect }: Props) {
  const task = pack.task;
  const [draft, setDraft] = useState(() => editableFields(task));
  const [editRevision, setEditRevision] = useState(task.revision);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [followup, setFollowup] = useState('');
  const [session, setSession] = useState('');
  const [harness, setHarness] = useState('claude');
  const [records, setRecords] = useState<TranscriptRecord[]>([]);
  const [sequence, setSequence] = useState<number | null>(0);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [eventCursor, setEventCursor] = useState<number | null>(0);
  const [releaseStatus, setReleaseStatus] = useState<'parked' | 'blocked' | 'done'>('parked');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [now, setNow] = useState(Date.now());
  const file = useRef<HTMLInputElement>(null);
  const own = !sample && ownsDesktopTask(task);
  const expired = (task.lease_until_ms ?? 0) <= now;
  const otherOwner = task.status === 'running' && !expired && !own;
  const disabled = sample || busy || otherOwner;
  const conflict = editRevision !== task.revision;

  const loadLatest = useCallback(() => { setDraft(editableFields(task)); setEditRevision(task.revision); setDirty(false); }, [task]);
  useEffect(() => { if (!dirty) loadLatest(); }, [dirty, loadLatest]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (sample) return;
    let cancelled = false;
    void workspaceRequest<{ items: TaskEvent[]; next_after_id: number | null }>('events', { task_id: task.id })
      .then(page => { if (!cancelled) { setEvents(page.items); setEventCursor(page.next_after_id); } })
      .catch(error => { if (!cancelled) setNotice(`Could not load handoff history: ${String(error)}`); });
    return () => { cancelled = true; };
  }, [task.id, task.revision, sample]);
  const change = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => { setDraft(old => ({ ...old, [key]: value })); setDirty(true); };
  const token = () => readDesktopClaims()[task.id]?.token;
  const payload = () => ({
    task_id: task.id, expected_revision: editRevision, lease_token: own ? token() : undefined,
    ...draft, ...(draft.status === 'running' ? { status: undefined } : {}),
  });
  const acceptSaved = (saved: SharedTask) => { setDraft(editableFields(saved)); setEditRevision(saved.revision); setDirty(false); };
  const save = () => mutate(async () => {
    const saved = await workspaceRequest<SharedTask>('update', payload());
    if (saved.status !== 'running') clearDesktopClaim(task.id);
    acceptSaved(saved); setEditing(false); setNotice('Task saved.');
  });
  const claim = () => mutate(async () => {
    const sessionId = desktopSession();
    const result = await workspaceRequest<SharedTask & { lease_token: string }>('claim', {
      task_id: task.id, expected_revision: task.revision, harness: 'cortex', session_id: sessionId,
      lease_token: own ? token() : undefined, lease_seconds: 900,
    });
    saveDesktopClaim({ taskId: task.id, token: result.lease_token, sessionId });
    acceptSaved(result); setNotice('Claimed in Cortex for 15 minutes. Use Renew while you continue working.');
  });
  const release = () => mutate(async () => {
    const result = await workspaceRequest<SharedTask>('release', { ...payload(), status: releaseStatus });
    clearDesktopClaim(task.id); acceptSaved(result); setNotice('Handoff saved. Another harness can now claim this task.');
  });
  const chooseSession = (id: string, sourceHarness: string) => { setSession(id); setHarness(sourceHarness); setRecords([]); setSequence(0); };

  return <div className="surface-card task-editor" aria-label="Task details">
    <div className="task-detail-head"><span className={`task-state ${task.status}`}>{task.status === 'running' && expired ? 'Claim expired' : task.status}</span><div className="task-actions compact">
      <button className="text-link" onClick={() => void mutate(async () => { await navigator.clipboard.writeText(JSON.stringify(pack, null, 2)); setNotice('Resume pack copied.'); })}><Copy size={14}/> Copy handoff</button>
      <button className="text-link" onClick={() => downloadWorkspaceFile(`cortex-task-${task.id}.json`, JSON.stringify(pack, null, 2))}><Download size={14}/> Export</button>
    </div></div>
    <p className="fine-print">Task ID <code>{task.id}</code> · Updated {date(task.updated_ms)}</p>
    {task.origin && <p className="fine-print">Origin: {task.origin.harness} · {task.origin.session_id}</p>}
    {notice && <div className="callout neutral" role="status">{notice}</div>}

    <section className="task-ownership" aria-label="Task ownership">
      <h3>{own ? 'Working here in Cortex' : task.owner ? `Claimed by ${task.owner.harness}` : 'Ready to pick up'}</h3>
      <p>{task.owner ? `${task.owner.session_id} · ${expired ? 'Claim expired' : `Until ${date(task.lease_until_ms!)}`}` : 'Start here, or let a connected harness pick up this task.'}</p>
      {otherOwner && <p>This session can inspect the task. The owning harness can save and release it; takeover becomes available after expiry.</p>}
      <div className="task-actions">
        {task.status !== 'done' && task.status !== 'archived' && !otherOwner && <button className="button button-secondary" disabled={sample || busy || dirty} onClick={() => void claim()}>{own ? <RefreshCw size={15}/> : <Play size={15}/>} {own ? 'Renew 15 minutes' : task.owner && expired ? 'Take over in Cortex' : 'Start in Cortex'}</button>}
      </div>
      {dirty && <small>Save your edits before starting or renewing ownership.</small>}
    </section>

    {conflict && <div className="callout warning">Another session changed this task. Your edits remain below. <button className="text-link" onClick={loadLatest}>Discard edits and load latest</button></div>}
    {!editing && !dirty ? <section className="task-read" aria-label="Task summary">
      <div className="task-read-head"><div className="task-read-pills"><span className="task-state">{task.priority} priority</span>{task.project && <code>{task.project}</code>}</div>
        <button type="button" className="button button-secondary" disabled={disabled} onClick={() => setEditing(true)}><Pencil size={14}/> Edit</button></div>
      {([['Objective', task.objective], ['Next action', task.next_action], ['Blockers', task.blockers], ['Handoff', task.handoff]] as const).map(([label, value]) => value.trim() && value !== task.title ? <div className="task-read-field" key={label}><h4>{label}</h4><p>{value}</p></div> : null)}
      {!task.objective.trim() && !task.next_action.trim() && !task.handoff.trim() && <p className="fine-print">No objective or handoff yet. Edit to add what done looks like.</p>}
      {task.artifacts.length > 0 && <div className="task-read-field"><h4>Artifacts</h4>{task.artifacts.map((a, i) => <p key={i}><strong>{a.name}</strong> · <code>{a.location}</code></p>)}</div>}
      {own && <div className="task-release"><label>After handing off<select value={releaseStatus} disabled={busy} onChange={e => setReleaseStatus(e.target.value as typeof releaseStatus)}><option value="parked">Park for later</option><option value="blocked">Blocked</option><option value="done">Completed</option></select></label><button type="button" className="button button-secondary" disabled={disabled} onClick={() => void release()}><Pause size={15}/> Release</button></div>}
    </section> : <form className="stack-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor="edit-task-title">Task</label><input id="edit-task-title" required maxLength={300} disabled={disabled} value={draft.title} onChange={e => change('title', e.target.value)}/>
      <label htmlFor="edit-task-project">Project or repository</label><input id="edit-task-project" maxLength={2000} disabled={disabled} value={draft.project} onChange={e => change('project', e.target.value)}/>
      <label htmlFor="edit-objective">Objective</label><textarea id="edit-objective" maxLength={12000} disabled={disabled} value={draft.objective} onChange={e => change('objective', e.target.value)}/>
      <div className="task-field-pair"><label>Status<select value={draft.status} disabled={disabled} onChange={e => change('status', e.target.value as TaskStatus)}>{['inbox', ...(task.status === 'running' ? ['running'] : []), 'blocked', 'parked', 'done', 'archived'].map(s => <option key={s}>{s}</option>)}</select></label><label>Priority<select value={draft.priority} disabled={disabled} onChange={e => change('priority', e.target.value as SharedTask['priority'])}>{['low', 'normal', 'high', 'urgent'].map(s => <option key={s}>{s}</option>)}</select></label></div>
      <label htmlFor="task-handoff">Handoff · progress, decisions, verification</label><textarea id="task-handoff" className="handoff-input" maxLength={16000} disabled={disabled} value={draft.handoff} onChange={e => change('handoff', e.target.value)} placeholder="What has been done? What should the next harness know?"/>
      <label htmlFor="task-next">Next action</label><textarea id="task-next" maxLength={4000} disabled={disabled} value={draft.next_action} onChange={e => change('next_action', e.target.value)}/>
      <label htmlFor="task-blockers">Blockers</label><textarea id="task-blockers" maxLength={4000} disabled={disabled} value={draft.blockers} onChange={e => change('blockers', e.target.value)}/>

      <fieldset className="task-artifacts" disabled={disabled}><legend>Artifacts</legend><p className="fine-print">Link plans, diffs, documents, or files the next harness needs.</p>
        {draft.artifacts.map((artifact, index) => <div className="task-artifact-row" key={index}>
          <input aria-label={`Artifact ${index + 1} name`} required maxLength={300} placeholder="Name" value={artifact.name} onChange={e => change('artifacts', draft.artifacts.map((a, i) => i === index ? { ...a, name: e.target.value } : a))}/>
          <input aria-label={`Artifact ${index + 1} location`} required maxLength={2000} placeholder="File path or URL" value={artifact.location} onChange={e => change('artifacts', draft.artifacts.map((a, i) => i === index ? { ...a, location: e.target.value } : a))}/>
          <button type="button" className="icon-button" aria-label={`Remove artifact ${index + 1}`} onClick={() => change('artifacts', draft.artifacts.filter((_, i) => i !== index))}><X size={15}/></button>
        </div>)}
        <button type="button" className="text-link" disabled={disabled || draft.artifacts.length >= 20} onClick={() => change('artifacts', [...draft.artifacts, { name: '', location: '' }])}><Plus size={14}/> Add artifact</button>
      </fieldset>
      <button className="button button-primary" disabled={disabled || conflict || !draft.title.trim()}><Check size={15}/> Save task</button>
      {own && <div className="task-release"><label>After handing off<select value={releaseStatus} disabled={busy} onChange={e => setReleaseStatus(e.target.value as typeof releaseStatus)}><option value="parked">Park for later</option><option value="blocked">Blocked</option><option value="done">Completed</option></select></label><button type="button" className="button button-secondary" disabled={disabled || conflict || !draft.title.trim() || draft.artifacts.some(a => !a.name.trim() || !a.location.trim())} onClick={() => void release()}><Pause size={15}/> Save & release</button></div>}
      {(task.status === 'archived' || task.status === 'done') && <p className="fine-print">Set status to inbox and save to reopen this task.</p>}
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => { loadLatest(); setEditing(false); }}>Cancel</button>
    </form>}

    <section className="task-section"><h3>Follow-ups</h3>{pack.follow_ups.map(child => <button className="task-child" key={child.id} onClick={() => onSelect(child.id)}>{child.title}<span>{child.status}</span></button>)}<form className="inline-form" onSubmit={e => { e.preventDefault(); void mutate(async () => { await workspaceRequest('create', { id: crypto.randomUUID(), title: followup, parent_id: task.id, project: task.project, harness: 'cortex', session_id: desktopSession() }); setFollowup(''); }); }}><input aria-label="New follow-up" maxLength={300} value={followup} onChange={e => setFollowup(e.target.value)} placeholder="Park a bug or missing feature…"/><button className="button button-secondary" aria-label="Add follow-up" disabled={sample || busy || !followup.trim()}><Plus size={15}/></button></form></section>

    <section className="task-section"><h3>Source conversations</h3><p className="fine-print">Select a source session to read it, or import a JSONL file. Importing the same file and session again safely adds new records.</p>
      {pack.sessions.map(s => <button className={`task-child ${session === s.session_id ? 'selected' : ''}`} disabled={busy} key={s.session_id} onClick={() => chooseSession(s.session_id, s.harness)}>{s.harness} · {s.session_id}<span>{s.records} records</span></button>)}
      <label htmlFor="transcript-harness">Harness</label><select id="transcript-harness" value={harness} disabled={busy} onChange={e => setHarness(e.target.value)}>{['claude', 'codex', 'opencode', 'cortex'].map(h => <option key={h}>{h}</option>)}</select>
      <label htmlFor="transcript-session">Source session ID</label><input id="transcript-session" disabled={busy} maxLength={200} value={session} onChange={e => chooseSession(e.target.value, harness)} placeholder="Original session ID"/>
      <input ref={file} type="file" accept=".jsonl" hidden onChange={e => {
        const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return;
        void mutate(async () => {
          try {
            if (selected.size > 32 * 1024 * 1024) throw new Error('Choose a transcript under 32MB');
            const batches = transcriptBatches(await selected.text());
            for (let i = 0; i < batches.length; i++) { setProgress(`Importing ${i + 1} of ${batches.length} batches…`); await workspaceRequest('transcript', { task_id: task.id, session_id: session, harness, ...batches[i] }); }
            setNotice(`Imported ${selected.name}. Existing records were preserved.`); setRecords([]); setSequence(0);
          } finally { setProgress(''); }
        });
      }}/>
      <div className="task-actions"><button className="button button-secondary" disabled={sample || busy || !session.trim()} onClick={() => file.current?.click()}><Upload size={15}/> Import / sync JSONL</button>
        {session && sequence !== null && <button className="button button-secondary" disabled={sample || busy} onClick={() => void mutate(async () => {
          const page = await workspaceRequest<{ records: TranscriptRecord[]; next_sequence: number | null }>('history', { task_id: task.id, session_id: session, start_sequence: sequence });
          setRecords(old => [...old, ...page.records]); setSequence(page.next_sequence);
        })}>Load {records.length ? 'more messages' : 'conversation'}</button>}
      </div>{progress && <p role="status">{progress}</p>}
      {records.length > 0 && <div className="task-conversation">{records.map(record => <article key={record.sequence}><header>{record.message.role} <small>· {record.harness} · #{record.sequence}</small></header><p>{textContent(record.message.content) || 'Source event (expand to inspect)'}</p><details><summary>Original source record</summary><pre className="task-history">{JSON.stringify(record.raw, null, 2)}</pre></details></article>)}</div>}
      {sequence === null && <p className="fine-print">End of this imported conversation.</p>}
    </section>

    <section className="task-section"><h3>Handoff history & activity</h3>{events.length > 0 && <ol className="task-events">{events.map(event => <li key={event.id}><strong>{event.action.replaceAll('_', ' ')}</strong><time>{date(event.at_ms)}</time>{(event.record.actor || event.record.owner) && <p className="fine-print">{(event.record.actor || event.record.owner)!.harness} · {(event.record.actor || event.record.owner)!.session_id}</p>}
        {event.record.status && <span className={`task-state ${event.record.status}`}>{event.record.status}</span>}
        {event.record.handoff && <p><strong>Handoff: </strong>{event.record.handoff}</p>}
        {event.record.next_action && <p><strong>Next action: </strong>{event.record.next_action}</p>}
        {event.record.blockers && <p><strong>Blockers: </strong>{event.record.blockers}</p>}
        {event.record.artifacts?.map((artifact, index) => <p key={index}><strong>{artifact.name}: </strong><code>{artifact.location}</code></p>)}
        {!event.record.handoff && <p>{event.record.title || (event.record.session_id ? `${event.record.session_id} · ${event.record.inserted ?? 0} records imported` : '')}</p>}<details><summary>Details</summary><pre className="task-history">{JSON.stringify(event.record, null, 2)}</pre></details></li>)}</ol>}
      {eventCursor !== null && <button className="text-link" disabled={sample || busy} onClick={() => void mutate(async () => {
        const page = await workspaceRequest<{ items: TaskEvent[]; next_after_id: number | null }>('events', { task_id: task.id, after_id: eventCursor });
        setEvents(old => [...old, ...page.items]); setEventCursor(page.next_after_id);
      })}>Load {events.length ? 'more history' : 'history'}</button>}{eventCursor === null && <p className="fine-print">All history loaded.</p>}
    </section>
  </div>;
}
