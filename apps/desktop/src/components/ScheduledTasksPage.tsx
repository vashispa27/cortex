import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { BellRing, ChevronDown, Pause, Pencil, Play, Plus, Search, Sparkles, X } from 'lucide-react';
import { scheduleService, formatScheduleTime, type Schedule, type ScheduleRun, type ScheduleService, type ScheduleSpec, type ScheduleTiming } from '../lib/schedules';
import Modal from './Modal';
import './scheduled-tasks.css';
export interface ScheduledTasksPageProps { service?: ScheduleService }
type View = 'upcoming' | 'ended' | 'history';
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const initial = (): ScheduleSpec => ({ title: '', timezone: zone(), timing: { type: 'daily', time: '08:00', weekdays: [] }, action: { type: 'reminder', message: '' } });
const body = (spec: ScheduleSpec) => spec.action.type === 'reminder' ? spec.action.message : spec.action.prompt;
/** A short title from the message, so the create form only needs the message itself. */
const titleFrom = (text: string) => { const line = text.trim().split('\n')[0]; return line.length > 80 ? `${line.slice(0, 77)}…` : line; };
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
const everyN = (minutes: number) => minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const cadence = (timing: ScheduleTiming) => {
  if (timing.type === 'once') return 'One time';
  if (timing.type === 'monthly') return `${timing.day === -1 ? 'Last day' : `The ${ordinal(timing.day)}`} of each month at ${timing.time}`;
  const on = timing.weekdays?.length ? timing.weekdays.slice().sort().map(d => days[d - 1]).join(', ') : 'Every day';
  if (timing.type === 'interval') return `Every ${everyN(timing.every_minutes)}${timing.window_start && timing.window_end ? `, ${timing.window_start}–${timing.window_end}` : ''} · ${on}`;
  return timing.type === 'after_wake' ? `After waking, ${timing.time}–${timing.window_end} · ${on}` : `${on} at ${timing.time}`;
};

export function ScheduledTasksPage({ service = scheduleService }: ScheduledTasksPageProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [nextSchedules, setNextSchedules] = useState<number | null>(null);
  const [nextRuns, setNextRuns] = useState<number | null>(null);
  const [view, setView] = useState<View>('upcoming');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ editing: Schedule | null; spec: ScheduleSpec } | null>(null);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loaded = useRef({ schedules: 100, runs: 50 });
  // Keep the same creation id after an uncertain network failure so a retry cannot duplicate it.
  const creationId = useRef(crypto.randomUUID());
  const refresh = useCallback(async () => {
    const loadSchedules = async () => {
      const items: Schedule[] = []; let offset: number | null = 0;
      while (offset !== null && items.length < loaded.current.schedules) {
        const page = await service.list({ limit: 100, offset }); items.push(...page.items); offset = page.next_offset;
      }
      return { items, next: offset };
    };
    const loadRuns = async () => {
      const items: ScheduleRun[] = []; let offset: number | null = 0;
      while (offset !== null && items.length < loaded.current.runs) {
        const page = await service.history({ limit: 50, offset }); items.push(...page.items); offset = page.next_offset;
      }
      return { items, next: offset };
    };
    const [list, history] = await Promise.all([loadSchedules(), loadRuns()]);
    setError(''); setSchedules(list.items); setRuns(history.items); setNextSchedules(list.next); setNextRuns(history.next);
  }, [service]);
  useEffect(() => {
    let mounted = true;
    const load = () => { if (!busyRef.current) void refresh().catch(e => { if (mounted) setError(String(e)); }).finally(() => { if (mounted) setLoading(false); }); };
    load(); const timer = window.setInterval(load, 15000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [refresh]);
  const perform = async (fn: () => Promise<unknown>, reload = true, report: (message: string) => void = setError) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(''); setFormError('');
    try { await fn(); if (reload) await refresh(); return true; } catch (e) { report(e instanceof Error ? e.message : String(e)); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const open = (editing: Schedule | null) => { setFormError(''); setEditor({ editing, spec: editing ? { title: editing.title, timezone: editing.timezone, timing: editing.timing, action: editing.action } : initial() }); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    const spec = { ...editor.spec, title: editor.spec.title.trim() || titleFrom(body(editor.spec)) };
    void perform(async () => {
      if (editor.editing) await service.update(editor.editing, spec); else await service.create(creationId.current, spec);
      creationId.current = crypto.randomUUID(); setEditor(null);
    }, true, setFormError);
  };

  const matches = (s: Schedule) => !query.trim() || `${s.title} ${body(s)}`.toLowerCase().includes(query.trim().toLowerCase());
  const upcoming = schedules.filter(s => (s.status === 'active' || s.status === 'paused') && matches(s)).sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || (a.next_due_ms ?? Infinity) - (b.next_due_ms ?? Infinity));
  const ended = schedules.filter(s => (s.status === 'completed' || s.status === 'cancelled') && matches(s));
  const shownRuns = runs.filter(r => matches(r.schedule));
  const shown = view === 'upcoming' ? upcoming : ended;
  const loadMoreSchedules = () => void perform(async () => { const page = await service.list({ offset: nextSchedules!, limit: 100 }); loaded.current.schedules += page.items.length; setSchedules(old => [...old, ...page.items]); setNextSchedules(page.next_offset); }, false);

  return <section className="cx-page scheduled-page" aria-labelledby="scheduled-title">
    <header className="cx-page-head">
      <div><h1 id="scheduled-title">Reminders</h1><p>Reminders notify you with your message. Scheduled answers ask Cortex to write something when they run.</p></div>
      <button type="button" className="button button-primary" onClick={() => open(null)}><Plus size={16}/> New reminder</button>
    </header>
    <div className="cx-toolbar">
      <div className="cx-segmented" role="tablist" aria-label="Reminder view">
        {([['upcoming', `Scheduled · ${schedules.filter(s => s.status === 'active' || s.status === 'paused').length}`], ['ended', 'Ended'], ['history', 'Run history']] as const).map(([id, label]) =>
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{label}</button>)}
      </div>
      <label className="cx-search"><Search size={14}/><input type="search" aria-label="Search reminders" placeholder="Search reminders" value={query} onChange={e => setQuery(e.target.value)}/></label>
    </div>
    {error && <div role="alert" className="callout warning schedule-callout">{error} <button type="button" className="text-link" onClick={() => void perform(refresh)}>Retry</button></div>}
    {loading ? <p role="status" className="cx-hint">Loading reminders…</p> : view !== 'history' ? <>
      {shown.length ? <div className="cx-list">{shown.map(s => <article className="cx-list-row schedule-row" key={s.id}>
        <div className="schedule-main">
          <span className={`schedule-icon ${s.action.type}`}>{s.action.type === 'task' ? <Sparkles size={15}/> : <BellRing size={15}/>}</span>
          <div>
            <h3>{s.title}</h3>
            {body(s) && body(s) !== s.title && <p className="schedule-body">{body(s)}</p>}
            <div className="cx-meta">
              <span>{cadence(s.timing)}</span>
              {s.status !== 'cancelled' && s.next_due_ms !== null && <span>{s.timing.type === 'after_wake' ? 'Eligible' : 'Next'} {formatScheduleTime(s.next_due_ms, s.timezone)}</span>}
              {s.timezone !== zone() && <span>{s.timezone}</span>}
              {s.status !== 'active' && <span className={`cx-pill ${s.status}`}>{s.status}</span>}
              {s.action.type === 'task' && <span className="cx-pill task">Answer</span>}
            </div>
          </div>
        </div>
        {s.status !== 'cancelled' && s.status !== 'completed' && <div className="cx-row-actions">
          <button type="button" className="icon-button" title="Edit" aria-label={`Edit ${s.title}`} disabled={busy} onClick={() => open(s)}><Pencil size={15}/></button>
          {s.status === 'active' && <button type="button" className="icon-button" title="Pause" aria-label={`Pause ${s.title}`} disabled={busy} onClick={() => void perform(() => service.pause(s))}><Pause size={15}/></button>}
          {s.status === 'paused' && <button type="button" className="icon-button" title="Resume" aria-label={`Resume ${s.title}`} disabled={busy} onClick={() => void perform(() => service.resume(s))}><Play size={15}/></button>}
          <button type="button" className="icon-button danger" title="Cancel reminder" aria-label={`Cancel ${s.title}`} disabled={busy} onClick={() => { if (window.confirm(`Cancel “${s.title}”? It will stop running.`)) void perform(() => service.cancel(s)); }}><X size={15}/></button>
        </div>}
      </article>)}</div>
      : !error && <div className="cx-empty"><BellRing size={24}/><h3>{query ? 'No matching reminders' : view === 'upcoming' ? 'Nothing scheduled' : 'No ended reminders'}</h3>
        <p>{view === 'upcoming' ? 'Create one here, or just tell Cortex “remind me tomorrow at 9 to call Rajesh”.' : 'Finished and cancelled reminders show up here.'}</p>
        {view === 'upcoming' && !query && <button type="button" className="button button-secondary" onClick={() => open(null)}><Plus size={15}/> New reminder</button>}</div>}
      {nextSchedules !== null && <button type="button" className="button button-quiet cx-more-button" disabled={busy} onClick={loadMoreSchedules}>Load more</button>}
    </> : <>
      {shownRuns.length ? <div className="cx-list">{shownRuns.map(run => <details className="cx-list-row schedule-run" key={run.id}>
        <summary>
          <div><h3>{run.schedule.title}</h3><div className="cx-meta"><span>{formatScheduleTime(run.started_ms, run.schedule.timezone)}</span><span className={`cx-pill ${run.status}`}>{run.status}</span><span>Notification {run.delivery_status}</span></div></div>
          <ChevronDown size={16} className="schedule-chevron"/>
        </summary>
        <div className="schedule-output">{run.error && <p className="cx-error">{run.error}</p>}<ReactMarkdown>{run.output || 'No answer recorded.'}</ReactMarkdown></div>
      </details>)}</div>
      : !error && <div className="cx-empty"><h3>No runs yet</h3><p>Each time a reminder fires, its delivery and any generated answer are kept here.</p></div>}
      {nextRuns !== null && <button type="button" className="button button-quiet cx-more-button" disabled={busy} onClick={() => void perform(async () => { const page = await service.history({ offset: nextRuns, limit: 50 }); loaded.current.runs += page.items.length; setRuns(old => [...old, ...page.items]); setNextRuns(page.next_offset); }, false)}>Load more runs</button>}
    </>}
    <p className="cx-hint schedule-note">Keep the Cortex engine running and allow notifications. Missed recurring times after sleep collapse into one catch-up run.</p>
    {editor && <ScheduleEditor value={editor.spec} editing={editor.editing} busy={busy} error={formError} onChange={spec => setEditor({ ...editor, spec })} onSubmit={submit} onClose={() => !busy && setEditor(null)}/>}
  </section>;
}

function ScheduleEditor({ value: spec, editing, busy, error, onChange, onSubmit, onClose }: {
  value: ScheduleSpec; editing: Schedule | null; busy: boolean; error: string;
  onChange: (spec: ScheduleSpec) => void; onSubmit: (event: FormEvent) => void; onClose: () => void;
}) {
  const setTiming = (timing: ScheduleTiming) => onChange({ ...spec, timing });
  const time = 'time' in spec.timing ? spec.timing.time : '08:00';
  const repeat = (type: ScheduleTiming['type']) => setTiming(type === 'once' ? { type: 'once', local_at: '' }
    : type === 'daily' ? { type: 'daily', time, weekdays: [] }
    : type === 'monthly' ? { type: 'monthly', day: 1, time }
    : type === 'interval' ? { type: 'interval', every_minutes: 120, start_local: localInput(new Date()), weekdays: [] }
    : { type: 'after_wake', time: '06:00', window_end: '12:00', weekdays: [] });
  const task = spec.action.type === 'task';
  return <Modal title={editing ? 'Edit reminder' : 'New reminder'} onClose={onClose} locked={busy}>
    <form className="cx-form" onSubmit={onSubmit}>
      <label className="cx-field">{task ? 'Ask Cortex to' : 'Remind me to'}<textarea required maxLength={12000} rows={2} placeholder={task ? 'Summarise what changed in my repos today' : 'Call Rajesh about the invoice'} value={body(spec)} onChange={e => onChange({ ...spec, action: task ? { ...spec.action, prompt: e.target.value } as ScheduleSpec['action'] : { type: 'reminder', message: e.target.value } })}/></label>
      <div className="cx-field"><span>Repeat</span><div className="cx-segmented" role="group" aria-label="Repeat">
        {([['once', 'Once'], ['daily', 'Recurring'], ['monthly', 'Monthly'], ['interval', 'Every few hours'], ['after_wake', 'After I wake']] as const).map(([type, label]) => <button key={type} type="button" aria-pressed={spec.timing.type === type} onClick={() => spec.timing.type !== type && repeat(type)}>{label}</button>)}
      </div></div>
      {spec.timing.type === 'once' ? <label className="cx-field">When<input required type="datetime-local" value={spec.timing.local_at} onChange={e => setTiming({ type: 'once', local_at: e.target.value })}/></label>
      : spec.timing.type === 'monthly' ? <MonthlyFields timing={spec.timing} onChange={setTiming}/>
      : spec.timing.type === 'interval' ? <IntervalFields timing={spec.timing} onChange={setTiming}/>
      : <>
        <div className="cx-row">
          <label className="cx-field">{spec.timing.type === 'after_wake' ? 'Earliest' : 'Time'}<input required type="time" value={spec.timing.time} onChange={e => (spec.timing.type === 'daily' || spec.timing.type === 'after_wake') && setTiming({ ...spec.timing, time: e.target.value })}/></label>
          {spec.timing.type === 'after_wake' && <label className="cx-field">Latest<input required type="time" value={spec.timing.window_end} onChange={e => spec.timing.type === 'after_wake' && setTiming({ ...spec.timing, window_end: e.target.value })}/></label>}
        </div>
        <DayPicker timing={spec.timing} onChange={setTiming}/>
      </>}
      <details className="cx-more" open={task || undefined}>
        <summary><ChevronDown size={14}/> More options</summary>
        <div>
          <div className="cx-field"><span>When it runs</span><div className="cx-segmented" role="group" aria-label="Delivery type">
            <button type="button" aria-pressed={!task} onClick={() => task && onChange({ ...spec, action: { type: 'reminder', message: body(spec) } })}>Notify me</button>
            <button type="button" aria-pressed={task} onClick={() => !task && onChange({ ...spec, action: { type: 'task', prompt: body(spec), requires_live_sources: true } })}>Generate an answer</button>
          </div></div>
          {task && <p className="cx-hint">Scheduled answers use the engine’s own provider setup, not the chat model. Setup and network failures appear in run history.</p>}
          <div className="cx-row">
            <label className="cx-field">Title<input maxLength={300} placeholder="From the message" value={spec.title} onChange={e => onChange({ ...spec, title: e.target.value })}/></label>
            <label className="cx-field">Timezone<input required placeholder="Asia/Kolkata" value={spec.timezone} onChange={e => onChange({ ...spec, timezone: e.target.value })}/></label>
          </div>
        </div>
      </details>
      {error && <p role="alert" className="cx-error">{error}</p>}
      <div className="cx-modal-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || !body(spec).trim()}>{busy ? 'Saving…' : editing ? 'Save' : 'Create'}</button></div>
    </form>
  </Modal>;
}

type Weekly = Extract<ScheduleTiming, { weekdays?: number[] }>;
function DayPicker({ timing, onChange }: { timing: Weekly; onChange: (timing: ScheduleTiming) => void }) {
  const list = timing.weekdays || [];
  return <div className="cx-field"><span>Days <small className="cx-hint">· none means every day</small></span><div className="cx-days" role="group" aria-label="Days">{days.map((day, i) => {
    const on = list.includes(i + 1);
    return <button key={day} type="button" aria-pressed={on} onClick={() => onChange({ ...timing, weekdays: on ? list.filter(d => d !== i + 1) : [...list, i + 1] })}>{day}</button>;
  })}</div></div>;
}
function MonthlyFields({ timing, onChange }: { timing: Extract<ScheduleTiming, { type: 'monthly' }>; onChange: (timing: ScheduleTiming) => void }) {
  const last = timing.day === -1;
  return <div className="cx-row">
    <label className="cx-field">Day of month<input type="number" min={1} max={31} required={!last} disabled={last} value={last ? '' : timing.day} onChange={e => onChange({ ...timing, day: Number(e.target.value) })}/></label>
    <label className="cx-field">Time<input required type="time" value={timing.time} onChange={e => onChange({ ...timing, time: e.target.value })}/></label>
    <label className="cx-field cx-check"><input type="checkbox" checked={last} onChange={e => onChange({ ...timing, day: e.target.checked ? -1 : 1 })}/> Last day of the month</label>
    <small className="cx-hint">A day a short month lacks (the 31st in February) runs on that month’s last day.</small>
  </div>;
}
function IntervalFields({ timing, onChange }: { timing: Extract<ScheduleTiming, { type: 'interval' }>; onChange: (timing: ScheduleTiming) => void }) {
  const hours = timing.every_minutes % 60 === 0;
  const windowed = timing.window_start !== undefined && timing.window_end !== undefined;
  return <>
    <div className="cx-row">
      <label className="cx-field">Every<input type="number" min={1} required value={hours ? timing.every_minutes / 60 : timing.every_minutes} onChange={e => onChange({ ...timing, every_minutes: Number(e.target.value) * (hours ? 60 : 1) })}/></label>
      <label className="cx-field">Unit<select value={hours ? 'hours' : 'minutes'} onChange={e => onChange({ ...timing, every_minutes: (hours ? timing.every_minutes / 60 : timing.every_minutes) * (e.target.value === 'hours' ? 60 : 1) })}><option value="minutes">minutes (15 minimum)</option><option value="hours">hours</option></select></label>
      <label className="cx-field">Starting<input required type="datetime-local" value={timing.start_local} onChange={e => onChange({ ...timing, start_local: e.target.value })}/></label>
    </div>
    <div className="cx-row">
      <label className="cx-field cx-check"><input type="checkbox" checked={windowed} onChange={e => onChange(e.target.checked ? { ...timing, window_start: '09:00', window_end: '21:00' } : { ...timing, window_start: undefined, window_end: undefined })}/> Only between</label>
      {windowed && <><label className="cx-field">From<input required type="time" value={timing.window_start} onChange={e => onChange({ ...timing, window_start: e.target.value })}/></label>
        <label className="cx-field">Until<input required type="time" value={timing.window_end} onChange={e => onChange({ ...timing, window_end: e.target.value })}/></label></>}
    </div>
    <DayPicker timing={timing} onChange={onChange}/>
  </>;
}

export default ScheduledTasksPage;
