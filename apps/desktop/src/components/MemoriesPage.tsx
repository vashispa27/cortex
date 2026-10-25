import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BookMarked, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { memoryService, type MemoryService, type PersonalFact, type FactInput } from '../lib/memories';
import Modal from './Modal';
import './memories.css';
import { RecentActivityMemory } from './RecentActivityMemory';
export type MemoriesPageProps = {
  service?: MemoryService;
  /** Mount the existing activity browsing/search component here, with its current state and callbacks. */
  recentActivity?: ReactNode;
};
const empty: FactInput = { subject: '', attribute: '', value: '', source: 'Manually saved by user', channel: 'desktop' };
const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export function MemoriesPage({ service = memoryService, recentActivity }: MemoriesPageProps) {
  const prefix = useId();
  const [tab, setTab] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null) === "recent" ? 1 : 0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState('');
  const [facts, setFacts] = useState<PersonalFact[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ editing: PersonalFact | null; draft: FactInput } | null>(null);
  const [formError, setFormError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const load = async (start = 0) => {
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await service.search({ query, offset: start });
      if (current !== generation.current) return;
      setFacts(previous => start ? [...previous, ...result.items] : result.items); setOffset(result.next_offset);
    } catch (e) { if (current === generation.current) setError(String(e)); }
    finally { if (current === generation.current) { setBusy(false); setLoaded(true); } }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), query ? 180 : 0); return () => { window.clearTimeout(timer); generation.current++; }; }, [service, query]);
  const save = async () => {
    if (!editor) return;
    setBusy(true); setFormError('');
    try {
      if (editor.editing) await service.update(editor.editing, editor.draft); else await service.remember(editor.draft);
      setEditor(null); await load();
    } catch (e) { setFormError(`${String(e)} Close and reopen to load the latest revision before retrying a conflicting edit.`); setBusy(false); }
  };
  const remove = async (fact: PersonalFact) => {
    setBusy(true); setError('');
    try { await service.delete(fact); await load(); }
    catch (e) { setError(String(e)); setBusy(false); }
  };
  const open = (editing: PersonalFact | null) => { setFormError(''); setEditor({ editing, draft: editing ? { ...editing, channel: 'desktop', source: 'Manually corrected by user' } : empty }); };
  return <div className="cx-page memories-page">
    <header className="cx-page-head">
      <div><h1>Memories</h1><p>Facts you’ve asked Cortex to keep, and activity captured on this Mac.</p></div>
      {tab === 0 && <button type="button" className="button button-primary" onClick={() => open(null)}><Plus size={16}/> Add memory</button>}
    </header>
    <div className="cx-toolbar">
      <div role="tablist" aria-label="Memory type" className="cx-segmented">
        {['Permanent', 'Recent activity'].map((label, index) => <button key={label} type="button" role="tab" id={`${prefix}-tab-${index}`} aria-controls={`${prefix}-panel-${index}`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} ref={node => { tabs.current[index] = node; }} onClick={() => setTab(index)} onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - index;
          setTab(next); tabs.current[next]?.focus();
        }}>{label}</button>)}
      </div>
      {tab === 0 && <><label className="cx-search"><Search size={14}/><input type="search" aria-label="Search permanent memory" placeholder="Search facts" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <span className="cx-count" aria-live="polite">{busy && !loaded ? 'Loading…' : `${facts.length}${offset !== null ? '+' : ''} ${facts.length === 1 ? 'fact' : 'facts'}`}</span></>}
    </div>
    <section role="tabpanel" id={`${prefix}-panel-0`} aria-labelledby={`${prefix}-tab-0`} hidden={tab !== 0}>
      {error && <div role="alert" className="callout warning memories-callout">{error} <button type="button" className="text-link" onClick={() => void load()}>Retry</button></div>}
      {facts.length > 0 && <div className="cx-list">{facts.map(fact => <article className="cx-list-row fact-row" key={fact.id}>
        <div className="fact-main">
          <div className="fact-key"><span className="fact-subject">{fact.subject}</span><span className="fact-attribute">{fact.attribute}</span></div>
          <p className="fact-value">{fact.value}</p>
          <div className="cx-meta" title={`Saved ${new Date(fact.created_ms).toLocaleString()} · revision ${fact.revision}`}><span>{fact.source}</span><span>via {fact.channel}</span><span>Updated {when(fact.updated_ms)}</span></div>
        </div>
        <div className="cx-row-actions">
          <button type="button" className="icon-button" title="Edit" disabled={busy} aria-label={`Edit ${fact.subject} ${fact.attribute}`} onClick={() => open(fact)}><Pencil size={15}/></button>
          <button type="button" className="icon-button danger" title="Delete" disabled={busy} aria-label={`Permanently delete ${fact.subject} ${fact.attribute}`} onClick={() => { if (window.confirm(`Permanently delete ${fact.subject} / ${fact.attribute}?`)) void remove(fact); }}><Trash2 size={15}/></button>
        </div>
      </article>)}</div>}
      {loaded && !busy && !error && facts.length === 0 && <div className="cx-empty"><BookMarked size={24}/><h3>{query ? 'No matching facts' : 'No permanent memories yet'}</h3><p>{query ? 'Try a name or attribute like “phone”.' : 'Add one here, or tell Cortex “remember my passport expires in March”.'}</p>{!query && <button type="button" className="button button-secondary" onClick={() => open(null)}><Plus size={15}/> Add memory</button>}</div>}
      {offset !== null && <button type="button" className="button button-quiet cx-more-button" disabled={busy} onClick={() => void load(offset)}>Load more</button>}
    </section>
    <section role="tabpanel" id={`${prefix}-panel-1`} aria-labelledby={`${prefix}-tab-1`} hidden={tab !== 1}>{recentActivity ?? <RecentActivityMemory />}</section>
    {editor && <Modal title={editor.editing ? 'Edit memory' : 'Add memory'} onClose={() => !busy && setEditor(null)} locked={busy}>
      <form className="cx-form" onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="cx-row">
          <label className="cx-field">About<input required maxLength={300} placeholder="Rajesh, or me" value={editor.draft.subject} onChange={e => setEditor({ ...editor, draft: { ...editor.draft, subject: e.target.value } })}/></label>
          <label className="cx-field">What<input required maxLength={300} placeholder="phone number" value={editor.draft.attribute} onChange={e => setEditor({ ...editor, draft: { ...editor.draft, attribute: e.target.value } })}/></label>
        </div>
        <label className="cx-field">Value<textarea required maxLength={8000} rows={2} placeholder="+91 98…" value={editor.draft.value} onChange={e => setEditor({ ...editor, draft: { ...editor.draft, value: e.target.value } })}/></label>
        <p className="cx-hint">Saving the same “about” and “what” again replaces the old value.</p>
        <details className="cx-more"><summary><ChevronDown size={14}/> More options</summary><div>
          <label className="cx-field">Source<input required maxLength={2000} value={editor.draft.source} onChange={e => setEditor({ ...editor, draft: { ...editor.draft, source: e.target.value } })}/></label>
        </div></details>
        {formError && <p role="alert" className="cx-error">{formError}</p>}
        <div className="cx-modal-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editor.editing ? 'Save' : 'Remember'}</button></div>
      </form>
    </Modal>}
  </div>;
}
