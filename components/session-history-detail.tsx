'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, Download, RefreshCw, Tag, Trash2, MessageSquareText } from 'lucide-react';
import { apiFetch, type OverviewData } from '@/lib/api';
import { type HistorySession, type PromptRow, turnDuration } from '@/lib/history-api';
import { Heading, ErrorBox } from './shared';
import { LoadingState } from './loading-state';
import { UsageTrend, TokenMix, count, money } from './usage-charts';
import { CacheInsights } from './cache-insights';

export function SessionHistoryDetail({ deviceId, sessionId }: { deviceId: string; sessionId: string }) {
  const params = useSearchParams(), query = new URLSearchParams();
  for (const key of ['from', 'to', 'timezone']) { const value = params.get(key); if (value) query.set(key, value); }
  query.set('deviceId', deviceId); query.set('sessionId', sessionId);
  const qs = query.toString(), base = '/history/sessions/' + deviceId + '/' + encodeURIComponent(sessionId);
  const [page, setPage] = useState(0), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<{ key: string; history: HistorySession; usage: OverviewData } | null>(null);
  const [project, setProject] = useState(''), [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<PromptRow | null>(null), [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [deleteError, setDeleteError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const key = qs + '&page=' + page, current = snapshot?.key === key ? snapshot : null;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([apiFetch<HistorySession>(base + '?' + key, { signal: controller.signal }), apiFetch<OverviewData>('/dashboard/overview?' + qs, { signal: controller.signal })]).then(([history, usage]) => {
        if (!controller.signal.aborted) { setSnapshot({ key, history, usage }); setProject(history.project); setError(''); }
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load this session.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, key, qs, refresh]);
  async function saveProject(e: FormEvent) {
    e.preventDefault(); setSaving(true); setNotice('');
    try { await apiFetch(base, { method: 'PATCH', body: JSON.stringify({ project: project.trim() }) }); setNotice(project.trim() ? 'Project tag saved.' : 'Project tag removed.'); setRefresh(n => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Project tag could not be saved.'); }
    finally { setSaving(false); }
  }
  async function erase(e: FormEvent) {
    e.preventDefault(); if (!deleting) return; setBusy(true); setDeleteError('');
    try { await apiFetch('/history/prompts/' + deleting._id, { method: 'DELETE', body: JSON.stringify({ confirmation }) }); dialog.current?.close(); setNotice('Prompt permanently deleted. Token usage was preserved.'); setRefresh(n => n + 1); }
    catch (e) { setDeleteError(e instanceof Error ? e.message : 'Prompt could not be deleted.'); }
    finally { setBusy(false); }
  }
  const time = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { timeZone: current?.history.period.timezone ?? 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : 'Not received';
  return <>
    <Link className="history-back" href={'/sessions?' + query}><ArrowLeft size={15}/>All sessions & prompts</Link>
    <Heading title="Session details" description="Read captured user inputs alongside the session’s recorded usage."><button disabled={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={15}/>Refresh</button></Heading>
    <div className="history-session-id"><span>Session ID</span><code>{sessionId}</code><button aria-label="Copy session ID" onClick={() => void navigator.clipboard.writeText(sessionId).then(() => setNotice('Session ID copied.')).catch(() => setNotice('Copy unavailable. Select the session ID to copy it.'))}><Copy size={14}/></button></div>
    <p className="field-help" role="status">{notice}</p>
    {error && <ErrorBox error={(current ? 'Refresh failed; displayed data may be stale. ' : '') + error} onRetry={() => setRefresh(n => n + 1)}/>}
    {!current && loading && <LoadingState variant="profile" label="Loading session details…"/>}
    {current && <>
      <section className="panel history-session-context"><div><h2><Link href={'/devices/' + deviceId}>{current.history.device.name}</Link></h2><p className="section-description">{current.history.total} retained prompt records in the selected period · {current.history.period.timezone}</p><p className="field-help">{new Date(current.history.period.from).toLocaleDateString(undefined, {timeZone:current.history.period.timezone})} through {new Date(new Date(current.history.period.to).getTime() - 1).toLocaleDateString(undefined, {timeZone:current.history.period.timezone})}</p></div><form onSubmit={saveProject}><label><Tag size={14}/>Project tag<input maxLength={80} placeholder="For example, Customer portal" value={project} onChange={e => setProject(e.target.value)}/></label><button className="primary" disabled={saving || loading}>{saving ? 'Saving…' : 'Save tag'}</button></form></section>
      <div className="history-stat-strip"><div><span>Session tokens<strong>{count(current.usage.totalsByType.reduce((n, r) => n + r.total, 0))}</strong></span></div><div><span>Models reported<strong>{new Set(current.usage.byModel.map(r => r._id.model)).size}</strong></span></div><div><span>Estimated API cost<strong>{current.usage.estimatedCostUsd === null ? 'Unavailable' : money(current.usage.estimatedCostUsd)}</strong></span></div><div><span>Last token report<strong className="history-time-value">{time(current.usage.lastReportAt)}</strong></span></div></div>
      <p className="history-data-note">Usage covers this device and session within the selected dates. It cannot be assigned exactly to an individual prompt. API estimates are separate from subscription billing. <Link href={'/overview?' + qs}>View models, pricing and usage CSV</Link></p>
      {current.usage.recordCount > 0 ? <><div className="analytics-grid"><UsageTrend data={current.usage}/><TokenMix data={current.usage}/></div><CacheInsights data={current.usage}/></> : <div className="session-notice">No token reports match this session and period yet. Prompt reports and token exports arrive separately.</div>}
      <section className="panel history-timeline"><div className="section-title"><div><h2>Captured input timeline</h2><p className="section-description">Open an input to read its text. Automated notifications may also appear.</p></div><a className="button" href={'/api/history/export.csv?' + qs}><Download size={14}/>Export prompts CSV</a></div>
        {!current.history.rows.length ? <div className="history-empty"><MessageSquareText size={28}/><h3>No captured inputs for this period</h3><p>History starts after opt-in setup and expires after {current.history.retentionDays} days. Past token reports do not contain prompt text.</p><Link className="button primary" href={'/connect?deviceId=' + deviceId + '&history=1'}>Set up prompt history</Link></div> : <ol>{current.history.rows.map((row, i) => <li key={row._id}><span className="timeline-marker" aria-hidden="true">{page * 25 + i + 1}</span><div className="timeline-entry"><div className="timeline-meta"><time>{time(row.submittedAt)}</time><span>{row.personName}</span><span className={'badge ' + (row.durationMs === null ? 'stale' : 'recent')}>{row.durationMs === null ? 'Duration unavailable' : turnDuration(row.durationMs) + ' observed'}</span></div><details><summary>{row.submittedAt ? (row.promptText?.slice(0, 180) || '(Empty input)') : 'Completion received without a captured submission'}</summary><div className="prompt-text">{row.promptText ?? 'No submission text received.'}</div></details><div className="timeline-footer"><span>{row.promptLength === null ? 'Length unavailable' : count(row.promptLength) + ' characters'}{row.truncated ? ' · first 16,000 captured' : ''}</span><button className="quiet" aria-label={'Delete prompt ' + row.promptId} onClick={e => { opener.current = e.currentTarget; setDeleting(row); setConfirmation(''); setDeleteError(''); dialog.current?.showModal(); }}><Trash2 size={14}/>Delete prompt</button></div><details className="prompt-metadata"><summary>Report details</summary><dl><dt>Prompt ID</dt><dd>{row.promptId}</dd><dt>Completion observed</dt><dd>{time(row.completedAt)}</dd></dl></details></div></li>)}</ol>}
        <div className="session-pagination"><span>Page {page + 1} · {current.history.total} retained records</span><div className="actions"><button disabled={loading || page === 0} onClick={() => setPage(n => n - 1)}>Previous</button><button disabled={loading || !current.history.hasMore} onClick={() => setPage(n => n + 1)}>Next</button></div></div>
        <p className="footnote">Duration runs from observed submission to a matching completion callback. Missing or inconsistent pairs show no duration. Waiting and tool activity may be included; this is not working time.</p>
      </section>
    </>}
    <dialog className="delete-dialog" ref={dialog} aria-labelledby="delete-prompt-title" onCancel={e => { if (busy) e.preventDefault(); }} onClose={() => { setDeleting(null); opener.current?.focus(); }}><form onSubmit={erase}><h2 id="delete-prompt-title">Permanently delete this prompt?</h2><p>Its captured text, length and timing will be erased. Recorded token usage stays available. This cannot be undone.</p><label>Type DELETE PROMPT to confirm<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" autoFocus/></label>{deleteError && <ErrorBox error={deleteError}/>}<div className="actions"><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button disabled={busy || confirmation !== 'DELETE PROMPT'}>{busy ? 'Deleting…' : 'Delete prompt permanently'}</button></div></form></dialog>
  </>;
}
