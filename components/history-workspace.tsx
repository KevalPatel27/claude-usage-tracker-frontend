'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MessageSquareText, ArrowUpRight, Download, RefreshCw, FilterX, Clock3, Layers, Type } from 'lucide-react';
import { apiFetch, peopleApi, devicesApi, type Person, type Device } from '@/lib/api';
import { type HistoryData, turnDuration } from '@/lib/history-api';
import { Heading, ErrorBox } from './shared';
import { LoadingState } from './loading-state';
import { HistoryCharts } from './history-charts';
import { HistoryCollectionDiagnostics } from './history-diagnostics';

export function historyDates(days: number, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const to = `${parts.year}-${parts.month}-${parts.day}`, start = new Date(to + 'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

export function HistoryWorkspace() {
  const params = useSearchParams();
  const [filters, setFilters] = useState({ from: params.get('from') ?? '', to: params.get('to') ?? '', personId: params.get('personId') ?? '', deviceId: params.get('deviceId') ?? '', project: params.get('project') ?? '', timezone: params.get('timezone') ?? 'UTC' });
  const [search, setSearch] = useState(''), [settledSearch, setSettledSearch] = useState(''), [page, setPage] = useState(0), [days, setDays] = useState('30');
  const [people, setPeople] = useState<Person[]>([]), [devices, setDevices] = useState<Device[]>([]), [projects, setProjects] = useState<string[]>([]);
  const [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; data: HistoryData } | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettledSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([apiFetch<{ reportingTimezone: string }>('/dashboard/settings', { signal: controller.signal }), peopleApi.list(true), devicesApi.list(true)]).then(([settings, ps, ds]) => {
      if (controller.signal.aborted) return;
      setPeople(ps); setDevices(ds); setFilters(f => ({ ...f, timezone: f.timezone === 'UTC' && !params.get('timezone') ? settings.reportingTimezone : f.timezone, ...(!f.from && !f.to ? historyDates(30, settings.reportingTimezone) : {}) })); setReady(true); setError('');
    }).catch(e => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Unable to load your workspace.'); setLoading(false); } });
    return () => controller.abort();
  }, [attempt, params]);
  const query = new URLSearchParams({ ...filters, ...(settledSearch ? { search: settledSearch } : {}) }), qs = query.toString(), key = qs + '&page=' + page;
  const data = snapshot?.key === key ? snapshot.data : null;
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => {
      setLoading(true);
      apiFetch<HistoryData>('/history/overview?' + key, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) { setSnapshot({ key, data: result }); setProjects(old => [...new Set([...old, ...result.projects.map(p => p._id)])].sort()); setError(''); }
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load prompt history.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ready, key, refresh]);
  const retry = useCallback(() => { if (ready) setRefresh(n => n + 1); else { setError(''); setLoading(true); setAttempt(n => n + 1); } }, [ready]);
  function change(field: keyof typeof filters, value: string) { setFilters(f => ({ ...f, [field]: value })); setPage(0); }
  const time = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { timeZone: filters.timezone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Submission not received';
  return <>
    <Heading title="Sessions & prompts" description="Understand the requests behind your recorded usage."><button disabled={loading && ready} onClick={retry}><RefreshCw size={15}/>{loading ? 'Loading…' : 'Refresh'}</button><a className="button" href="#history-collection">Collection setup</a></Heading>
    <section className="filter-panel history-filters" aria-label="Prompt history filters"><div className="filter-topline"><div className="date-presets" role="group" aria-label="History date range">{['7', '30', '90'].map(d => <button key={d} aria-pressed={days === d} onClick={() => { setDays(d); setFilters(f => ({ ...f, ...historyDates(+d, f.timezone) })); setPage(0); }}>Last {d} days</button>)}</div><span className="filter-hint">Times in {filters.timezone}</span></div>
      <div className="history-filter-fields"><label>Search prompt words<input type="search" value={search} maxLength={120} placeholder="For example, login validation" onChange={e => { setSearch(e.target.value); setPage(0); }}/></label><label>Project<select value={filters.project} onChange={e => change('project', e.target.value)}><option value="">All projects</option>{[...new Set([...projects, ...(filters.project ? [filters.project] : [])])].map(p => <option key={p}>{p}</option>)}</select></label><label>Assigned person<select value={filters.personId} onChange={e => change('personId', e.target.value)}><option value="">All people</option>{people.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label><label>Device<select value={filters.deviceId} onChange={e => change('deviceId', e.target.value)}><option value="">All devices</option>{devices.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label><label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={e => { change('from', e.target.value); setDays('custom'); }}/></label><label>Through<input type="date" value={filters.to} min={filters.from || undefined} onChange={e => { change('to', e.target.value); setDays('custom'); }}/></label></div>
      {(search || filters.project || filters.personId || filters.deviceId) && <button className="reset-filters" onClick={() => { setSearch(''); setSettledSearch(''); setFilters(f => ({ ...f, project: '', personId: '', deviceId: '' })); setPage(0); }}><FilterX size={13}/>Clear search and filters</button>}
    </section>
    {error && <ErrorBox error={(data ? 'Refresh failed; displayed history may be stale. ' : '') + error} onRetry={retry}/>}
    {!data && (loading || ready && !error) && <LoadingState variant="profile" label="Loading prompt history…"/>}
    {data && <>
      <div className="report-strip"><span>Updated {new Date(data.generatedAt).toLocaleString(undefined,{timeZone:data.period.timezone})}</span><span>Missing reports are not confirmed zero activity.</span></div>
      <div className="history-stat-strip"><div><MessageSquareText size={18}/><span>Captured prompts<strong>{data.stats.prompts.toLocaleString()}</strong></span></div><div><Layers size={18}/><span>Sessions with history<strong>{data.stats.sessions.toLocaleString()}</strong></span></div><div><Type size={18}/><span>Average prompt length<strong>{data.stats.averageLength === null ? '—' : Math.round(data.stats.averageLength).toLocaleString()}<small>characters</small></strong></span></div><div><Clock3 size={18}/><span>Average observed turn<strong>{data.stats.averageDurationMs === null ? '—' : turnDuration(data.stats.averageDurationMs)}</strong></span></div></div>
      <p className="history-data-note">Captured input text. Automated notifications may also appear; this does not prove a person typed each entry. History is kept for {data.retentionDays} days; older token usage may still be available. {data.stats.incomplete > 0 && `${data.stats.incomplete} records do not have a valid matched duration.`}</p>
      <HistoryCharts data={data}/>
      <section className="panel history-list"><div className="section-title"><div><h2>Prompt history</h2><p className="section-description">Open a session to read its inputs and add a project tag</p></div><a className="button" href={'/api/history/export.csv?' + qs}><Download size={14}/>Export prompts CSV</a></div>
        {!data.rows.length ? <div className="history-empty"><MessageSquareText size={30}/><h3>{search || filters.project || filters.personId || filters.deviceId ? 'No matching prompts' : 'Your first captured prompt will appear here'}</h3><p>Prompt history starts after opt-in setup. Existing token reports cannot reconstruct past input text.</p><a className="button primary" href="#history-collection">Check collection setup</a><Link href="/overview">View recorded token usage</Link></div> : <div className="prompt-list">{data.rows.map(row => {
          const href = '/sessions/' + row.deviceId + '/' + encodeURIComponent(row.sessionId) + '?' + new URLSearchParams({ from: filters.from, to: filters.to, timezone: filters.timezone });
          return <Link className="prompt-list-row" key={row._id} href={href}><span className="prompt-list-icon"><MessageSquareText size={18}/></span><div className="prompt-list-content"><div className="prompt-list-meta"><time>{time(row.submittedAt)}</time><span>{row.personName}</span><span>{row.deviceName}</span>{row.project && <span className="project-tag">{row.project}</span>}</div><p>{row.submittedAt ? row.promptPreview || '(Empty input)' : 'Completion received without a captured submission'}</p><div className="prompt-list-foot"><span>{row.promptLength === null ? 'Length not available' : row.promptLength.toLocaleString() + ' characters'}{row.truncated ? ' · text truncated' : ''}</span><span>{row.durationMs === null ? 'Duration not available' : turnDuration(row.durationMs) + ' observed turn'}</span></div></div><ArrowUpRight size={17}/></Link>;
        })}</div>}
        <div className="session-pagination"><span>{data.stats.records ? `Page ${page + 1} · ${data.stats.records.toLocaleString()} retained records` : 'No retained records for these filters'}</span><div className="actions"><button disabled={loading || page === 0} onClick={() => setPage(n => n - 1)}>Previous</button><button disabled={loading || !data.hasMore} onClick={() => setPage(n => n + 1)}>Next</button></div></div>
      </section>
    </>}
    <HistoryCollectionDiagnostics/>
  </>;
}
