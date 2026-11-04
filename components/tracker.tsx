"use client";
import { LoadingState } from './loading-state';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Heading, ErrorBox } from './shared';
export { Heading, ErrorBox } from './shared';
const message = (e: unknown) => e instanceof Error ? e.message : 'Request failed. Try again.';
export { WorkspaceShell as Shell } from './workspace-shell';
export { KeyNotice } from './device-key';
export { Overview } from './overview';
export { People } from './people';
export { Connect } from './connect';
export function Administration() {
    const [attempt,setAttempt]=useState(0);
    const [settings, setSettings] = useState<{ reportingTimezone: string; retentionNote: string } | null>(null); const [error, setError] = useState('');
    useEffect(() => { apiFetch<{ reportingTimezone: string; retentionNote: string }>('/dashboard/settings').then(setSettings).catch(e => setError(message(e))); }, [attempt]);
    return <><Heading title="Administration" description="Reporting defaults, data handling and collection limits." />{error && <ErrorBox error={error} onRetry={()=>{setError('');setAttempt(n=>n+1);}} />}<section className="panel"><h2>Reporting defaults</h2>{!settings&&!error?<LoadingState variant="settings" label="Loading reporting defaults…"/>:settings&&<dl><dt>Default timezone</dt><dd>{settings?.reportingTimezone ?? 'Loading…'}</dd><dt>Data retention</dt><dd>{settings.retentionNote}</dd></dl>}<p>Change REPORTING_TIMEZONE in the backend environment and restart it to change the default. Per-view timezone filters also apply to CSV exports.</p></section><section className="panel"><h2>Collection reliability</h2><p>Reports go directly from each PC to the backend. Cumulative reporting can recover missed increments when the same counter lifetime later reports. Process exit during an outage can lose unreported usage. This tracker has no local durable queue.</p><p>Render free services can sleep after inactivity and take about a minute to start. A cold start may exceed an exporter timeout. A later successful cumulative export may recover usage, but delivery is not guaranteed.</p><p>The dashboard sends a best-effort backend health request every five minutes while this browser tab runs, with immediate checks after returning to the tab or reconnecting. Failed checks retry after 30 seconds up to three times before returning to the normal interval. Closing the browser, sleeping the PC or browser tab suspension stops reliable pings. This reduces idle cold starts; it does not guarantee uptime or delivery. Backend self-pinging is not used because a stopped process cannot wake itself.</p><p>Keep the backend and MongoDB available for collection. Closing this dashboard does not stop collection. Check collection diagnostics after configuring each PC.</p></section><section className="panel"><h2>What these numbers mean</h2><p>Token categories come from Claude Code’s built-in usage metrics. Estimated cost uses backend-configured per-model API rates; it is separate from Max subscription billing.</p><p>Attribution comes from the device key and its assignment. Shared devices do not identify the actual human. Prompt, response, tool content and transcripts are outside this tracker’s ingestion path.</p></section></>;
}
