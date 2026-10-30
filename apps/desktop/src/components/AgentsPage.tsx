import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Bot, FileText, Paperclip, Plus, RefreshCw, X } from 'lucide-react';
import {
  agentService, controlsFor, describeEvent, documentFrom, jobTitle, maxPromptLength, modelCallChoices, needsYou, responseFor, sortJobs, statusLabel,
  takeAgentDraft, terminal, type AgentDocument, type AgentEvent, type AgentJob, type AgentService,
} from '../lib/agents';
import { AnswerContent } from './AnswerContent';
import Modal from './Modal';
import './agents.css';

const ago = (iso: string) => {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
};

/** Start an agent, watch it work, and answer it when it needs you. */
export function AgentsPage({ service = agentService }: { service?: AgentService }) {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentJob | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [spawning, setSpawning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const refresh = useCallback(async () => {
    try {
      const list = await service.list();
      setJobs(sortJobs(list)); setError('');
      const id = selectedRef.current;
      if (id) {
        const [job, log] = await Promise.all([service.get(id), service.events(id)]);
        if (selectedRef.current === id) { setDetail(job); setEvents(log); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoaded(true); }
  }, [service]);

  useEffect(() => { void refresh(); }, [refresh, selected]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busyRef.current) void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // A chat in the notch can hand over a request; open the form with it filled in.
  useEffect(() => {
    const adopt = () => { const draft = takeAgentDraft(); if (draft !== null) setSpawning(draft); };
    adopt();
    window.addEventListener('cortex:agent-draft', adopt);
    return () => window.removeEventListener('cortex:agent-draft', adopt);
  }, []);

  const open = (id: string | null) => { setSelected(id); setDetail(null); setEvents([]); };
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await work(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); await refresh(); }
    finally { setBusy(false); }
  };

  const waiting = jobs.filter(job => needsYou(job.status)).length;

  return <div className="cx-page agents-page">
    <header className="cx-page-head">
      <div><h1>Agents</h1><p>Hand a job to a long-running agent. It plans first, asks when it is unsure, and waits for your approval before using tools or finishing.</p></div>
      <div className="cx-head-actions">
        <button type="button" className="icon-button" aria-label="Refresh agents" title="Refresh" onClick={() => void refresh()}><RefreshCw size={15}/></button>
        <button type="button" className="button button-primary" onClick={() => setSpawning('')}><Plus size={16}/> New agent</button>
      </div>
    </header>
    {error && <div role="alert" className="callout warning agents-callout">{error}</div>}
    {!error && waiting > 0 && <div role="status" className="callout neutral agents-callout">{waiting === 1 ? '1 agent needs you.' : `${waiting} agents need you.`}</div>}
    <div className="agents-layout">
      <section className="agents-list" aria-label="Agents">
        {jobs.map(job => <button type="button" key={job.task_id} className={`agent-row ${job.task_id === selected ? 'active' : ''}`} data-status={job.status} onClick={() => open(job.task_id)}>
          <span className="agent-row-title">{jobTitle(job)}</span>
          <span className="agent-row-meta"><span className={`agent-pill ${job.status}`}>{statusLabel(job.status)}</span><small>{ago(job.updated_at)}</small></span>
        </button>)}
        {loaded && !jobs.length && !error && <div className="agents-empty"><Bot size={28}/><h2>No agents yet</h2><p>Start one for work that takes a few minutes: research, a summary, a draft.</p><button type="button" className="button button-primary" onClick={() => setSpawning('')}><Plus size={15}/> New agent</button></div>}
        {!loaded && <p role="status" className="cx-hint">Loading agents…</p>}
      </section>
      <section className="agents-detail" aria-live="polite">
        {selected && !detail && <p role="status" className="cx-hint">Loading…</p>}
        {!selected && jobs.length > 0 && <p className="cx-hint agents-pick">Pick an agent to see what it is doing.</p>}
        {detail && <AgentDetail job={detail} events={events} service={service} busy={busy} act={act} />}
      </section>
    </div>
    {spawning !== null && <SpawnDialog initial={spawning} service={service} onClose={() => setSpawning(null)} onStarted={id => { setSpawning(null); open(id); }} />}
  </div>;
}

function AgentDetail({ job, events, service, busy, act }: { job: AgentJob; events: AgentEvent[]; service: AgentService; busy: boolean; act: (work: () => Promise<unknown>) => Promise<void> }) {
  const [text, setText] = useState('');
  const [artifact, setArtifact] = useState<{ name: string; body: string } | null>(null);
  useEffect(() => { setText(''); setArtifact(null); }, [job.task_id, job.pending_interaction?.id]);
  const pending = job.pending_interaction;
  const lines = events.map(event => ({ id: event.id, at: event.created_at, text: describeEvent(event) })).filter((line): line is { id: number; at: string; text: string } => !!line.text);

  const submit = (kind: 'approve' | 'reject' | 'text') => (event?: FormEvent) => {
    event?.preventDefault();
    if (!pending || (kind === 'text' && !text.trim())) return;
    void act(() => service.respond(job, responseFor(pending, { kind, text })));
  };

  return <article className="agent-detail">
    <header>
      <div><span className={`agent-pill ${job.status}`}>{statusLabel(job.status)}</span><h2>{jobTitle(job)}</h2></div>
      <div className="agent-controls">{controlsFor(job.status).map(action => <button type="button" key={action} className={`button ${action === 'cancel' ? 'button-quiet' : 'button-secondary'}`} disabled={busy} onClick={() => void act(() => service.control(job, action))}>{action[0].toUpperCase() + action.slice(1)}</button>)}</div>
    </header>

    {pending && needsYou(job.status) && <section className="agent-ask" aria-label={pending.kind === 'approval' ? 'Review' : 'Question'}>
      <span className="eyebrow">{pending.kind === 'approval' ? 'Review the plan' : 'The agent has a question'}</span>
      {pending.preview.markdown && <AnswerContent text={pending.preview.markdown}/>}
      {pending.kind === 'approval' ? <form onSubmit={submit('text')}>
        <textarea aria-label="Feedback" placeholder="Want something different? Say what to change." value={text} onChange={e => setText(e.target.value)} />
        <div className="agent-ask-actions">
          <button type="button" className="button button-primary" disabled={busy} onClick={submit('approve')}>Approve</button>
          <button type="submit" className="button button-secondary" disabled={busy || !text.trim()}>Request changes</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={submit('reject')}>Reject</button>
        </div>
      </form> : <form onSubmit={submit('text')}>
        <textarea aria-label="Your answer" placeholder="Your answer" value={text} onChange={e => setText(e.target.value)} />
        <div className="agent-ask-actions"><button type="submit" className="button button-primary" disabled={busy || !text.trim()}>Send answer</button></div>
      </form>}
    </section>}

    {job.outcome?.response && <section className="agent-result"><span className="eyebrow">{job.outcome.incomplete ? 'Partial result' : 'Result'}</span><AnswerContent text={job.outcome.response}/></section>}
    {job.outcome?.rejected && !job.outcome.response && <p className="cx-hint">You rejected this, so the agent stopped.</p>}
    {job.error && <div role="alert" className="callout warning">{job.error.message ?? job.error.error ?? 'The agent failed.'}</div>}

    {!!job.artifacts?.length && <section><span className="eyebrow">Files</span>
      <ul className="agent-files">{job.artifacts.map(item => <li key={item.id}><FileText size={14}/>
        <button type="button" className="text-link" onClick={() => void service.artifactText(job.task_id, item.id).then(body => setArtifact({ name: item.logical_name, body })).catch(e => act(() => Promise.reject(e)))}>{item.logical_name}</button></li>)}</ul>
    </section>}

    <details className="agent-log" open={!terminal(job.status)}>
      <summary>Activity ({lines.length})</summary>
      <ol>{lines.map(line => <li key={line.id}><span>{line.text}</span><time dateTime={line.at}>{ago(line.at)}</time></li>)}</ol>
      {!lines.length && <p className="cx-hint">Nothing yet.</p>}
    </details>
    {artifact && <Modal title={artifact.name} size="wide" onClose={() => setArtifact(null)}><pre className="agent-file">{artifact.body}</pre></Modal>}
  </article>;
}

function SpawnDialog({ initial, service, onClose, onStarted }: { initial: string; service: AgentService; onClose: () => void; onStarted: (id: string) => void }) {
  const [task, setTask] = useState(initial);
  const [calls, setCalls] = useState(16);
  const [documents, setDocuments] = useState<AgentDocument[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    try {
      const added = await Promise.all(files.map(async file => documentFrom(file.name, await file.text(), file.type)));
      setDocuments(old => [...old, ...added].slice(0, 20)); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { onStarted((await service.spawn({ task, maxModelCalls: calls, documents })).task_id); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return <Modal title="New agent" eyebrow="Long-running job" onClose={onClose} locked={busy}>
    <form className="cx-form" onSubmit={start}>
      <label className="cx-field">What should it do?
        <textarea autoFocus required rows={6} maxLength={maxPromptLength} value={task} onChange={e => setTask(e.target.value)} placeholder="Research the tradeoffs between Postgres and SQLite for a desktop app, and write me a one-page summary." />
      </label>
      <div className="cx-field">Files it can read (text only)
        <div className="agent-attach">
          <label className="button button-secondary"><Paperclip size={14}/> Attach<input type="file" multiple hidden accept=".txt,.md,.csv,.json,.log,text/*" onChange={e => void attach(e)} /></label>
          {documents.map(doc => <span key={doc.name} className="agent-chip">{doc.name}<button type="button" aria-label={`Remove ${doc.name}`} onClick={() => setDocuments(old => old.filter(d => d !== doc))}><X size={11}/></button></span>)}
        </div>
      </div>
      <label className="cx-field">Effort limit
        <select value={calls} onChange={e => setCalls(Number(e.target.value))}>{modelCallChoices.map(n => <option key={n} value={n}>{n} model calls{n === 16 ? ' (default)' : ''}</option>)}</select>
      </label>
      <p className="cx-hint">The agent shows you a plan first. Nothing runs with tools until you approve it, and it asks before going past this limit.</p>
      {error && <p role="alert" className="cx-error">{error}</p>}
      <div className="cx-modal-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={busy || !task.trim()}>{busy ? 'Starting…' : 'Start agent'}</button>
      </div>
    </form>
  </Modal>;
}

export default AgentsPage;
