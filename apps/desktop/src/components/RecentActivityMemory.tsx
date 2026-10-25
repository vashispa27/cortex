import { useEffect, useRef, useState } from 'react';
import { recentMemory, searchMemory, type SearchData } from '../lib/api';
/** Uses the same activity API, evidence cards and coverage display as the existing Memory screen. */
export function RecentActivityMemory() {
  const [query, setQuery] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('query') : null) ?? '');
  const [data, setData] = useState<SearchData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = async (text: string) => {
    const request = ++generation.current;
    setBusy(true); setError('');
    try { const next = await (text.trim() ? searchMemory(text.trim()) : recentMemory()); if (request === generation.current) setData(next); }
    catch (e) { if (request === generation.current) setError(String(e)); }
    finally { if (request === generation.current) setBusy(false); }
  };
  useEffect(() => { void load(query); return () => { generation.current++; }; }, []);
  return <div>
    <form className="search-bar" onSubmit={e => { e.preventDefault(); void load(query); }}><input aria-label="Search recent activity memory" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a topic, person, or phrase" /><button type="submit" className="button button-primary" disabled={busy}>Search</button></form>
    <div className="results-top"><span>{data ? `${data.results.length} results` : 'Recent memory'}</span><button type="button" className="text-link" disabled={busy} onClick={() => { setQuery(''); void load(''); }}>Recent activity</button></div>
    {error && <p role="alert" className="callout warning">{error}</p>}
    {busy ? <p role="status">Searching…</p> : <div className="memory-list">{data?.results.map(hit => <article className="evidence-card" key={hit.snapshot_id}><div className="evidence-meta"><time>{new Date(hit.observed_ms).toLocaleString()}</time></div><h3>{hit.title || 'Activity'}</h3></article>)}{data?.results.length === 0 && <div className="empty-state"><h3>Nothing found yet</h3><p>The service may be offline, or this topic may not have been captured.</p></div>}</div>}
    {data && <div className="coverage-note">Coverage: {data.coverage.state}{data.coverage.reason ? ` · ${data.coverage.reason.replaceAll('_', ' ')}` : ''}</div>}
  </div>;
}
