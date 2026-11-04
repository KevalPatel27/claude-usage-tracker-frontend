'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Monitor, RefreshCw, Plug, Pause } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { HistoryDiagnostics } from '@/lib/history-api';
import { ErrorBox } from './shared';
import { LoadingState } from './loading-state';

function needsUpdate(actual: string | null, required: string) {
  if (!actual) return false;
  const a = actual.split('.').map(Number), b = required.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
  return false;
}
export function HistoryCollectionDiagnostics() {
  const [data, setData] = useState<HistoryDiagnostics | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(async () => { try { setData(await apiFetch<HistoryDiagnostics>('/history/diagnostics')); setError(''); } catch { setError('Collection diagnostics could not load.'); } }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function pause(id: string) {
    setBusy(id);
    try { await apiFetch('/devices/' + id + '/prompt-history', { method: 'PATCH', body: JSON.stringify({ enabled: false }) }); await load(); }
    catch { setError('Could not pause history. Check the connection and try again.'); }
    finally { setBusy(''); }
  }
  return <section className="panel history-diagnostics" id="history-collection"><div className="section-title"><div><h2>Collection diagnostics</h2><p className="section-description">Prompt reporting is separate from token reporting</p></div><button onClick={() => void load()}><RefreshCw size={14}/>Refresh status</button></div>
    {error && <ErrorBox error={error} onRetry={() => void load()}/>}
    {!data && !error && <LoadingState variant="table" label="Loading collection status…"/>}
    {data && <>{data.devices.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Prompt collection status"><table><thead><tr><th>Device</th><th>Prompt history</th><th>Last history report</th><th>Setup / last queue report</th><th>Action</th></tr></thead><tbody>{data.devices.map(d => {
      const outdated = needsUpdate(d.historySetupVersion, data.requiredSetupVersion);
      const blocked = !!(d.revokedAt || d.archivedAt), stale = !!d.lastHistoryReportAt && new Date(data.generatedAt).getTime() - new Date(d.lastHistoryReportAt).getTime() > 10 * 60000;
      return <tr key={d._id}><td><Link href={'/devices/' + d._id}><Monitor size={14}/>{d.name}</Link><small>{d.personId?.name ?? 'Unassigned'}</small></td><td><span className={'badge ' + (blocked || !d.promptCollectionEnabled ? 'revoked' : !d.lastHistoryReportAt ? 'never' : stale ? 'stale' : 'recent')}>{blocked ? 'Reporting revoked' : !d.promptCollectionEnabled ? 'Not enabled' : !d.lastHistoryReportAt ? 'Needs setup' : stale ? 'No recent prompts' : 'Receiving reports'}</span></td><td>{d.lastHistoryReportAt ? new Date(d.lastHistoryReportAt).toLocaleString() : 'None received'}</td><td>{d.historySetupVersion ? `Setup ${d.historySetupVersion}${outdated ? ' · update required' : ' · current'}` : 'Version not reported'}<small>{d.historyPlatform ?? 'Platform not reported'}</small>{d.historyPendingCount !== null && d.historyPendingCount !== undefined && <small>{d.historyPendingCount} queued · {d.historyDroppedCount ?? 0} dropped, as last reported by client</small>}</td><td><div className="history-device-actions">{!blocked && <><Link className="button" href={'/connect?deviceId=' + d._id + '&history=1'}><Plug size={14}/>{d.lastHistoryReportAt ? 'Update setup' : 'Set up history'}</Link>{d.promptCollectionEnabled && <button disabled={busy === d._id} onClick={() => void pause(d._id)}><Pause size={14}/>{busy === d._id ? 'Pausing…' : 'Pause history'}</button>}</>}{blocked && <Link href={'/devices/' + d._id}>Manage device</Link>}</div></td></tr>;
    })}</tbody></table></div> : <p className="muted">No devices yet. Connect a PC to start collecting usage.</p>}
    {data.truncated && <p className="footnote">Showing the first 500 devices. Open device management to find another device.</p>}
    <p className="footnote">No recent prompt is not proof that a PC is offline. Queue values are the client’s last report, not a live reading. Pausing rejects new history reports; remove the history hooks on the PC to stop local capture. Stored history is retained for {data.retentionDays} days unless deleted sooner.</p></>}
  </section>;
}
