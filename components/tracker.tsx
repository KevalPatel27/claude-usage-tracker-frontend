"use client";
import { LoadingState } from './loading-state';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Users, Plug, Settings, LogOut, ChevronRight, ShieldCheck } from 'lucide-react';
import { BackendConnection } from './backend-connection';
import { BrandMark } from './brand-mark';
import { apiFetch } from '@/lib/api';
import { Heading, ErrorBox } from './shared';
export { Heading, ErrorBox } from './shared';
import { useAuth } from '@/lib/auth-context';
const message = (e: unknown) => e instanceof Error ? e.message : 'Request failed. Try again.';
export function Shell({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading, logout } = useAuth(); const router = useRouter(); const path = usePathname();
 const [dataMode,setDataMode]=useState('collected');
 useEffect(()=>{if(isAuthenticated) apiFetch<{dataMode:string}>('/dashboard/settings').then(s=>setDataMode(s.dataMode)).catch(()=>{});},[isAuthenticated]);
    useEffect(() => { if (!isLoading && !isAuthenticated) router.replace('/login'); }, [isLoading, isAuthenticated, router]);
    if (isLoading || !isAuthenticated) return <main className="center" role="status">Checking admin session…</main>;
    const nav = [['/overview', 'Usage', Activity], ['/people', 'People & devices', Users], ['/connect', 'Connect a PC', Plug], ['/admin', 'Administration', Settings]] as const;
    const active = (href:string) => path===href || (href==='/people'&&(path.startsWith('/people/')||path.startsWith('/devices/')));
    const current = nav.find(([href]) => active(href))?.[1] ?? 'Workspace';
    return <div className="app-shell"><a className="skip" href="#content">Skip to content</a>
      <aside className="sidebar"><Link href="/overview" className="brand"><span className="brand-icon"><BrandMark size={40}/></span><span>Usage ledger<small>Claude Code workspace</small></span></Link>
        <nav aria-label="Main navigation">{nav.map(([href,label,Icon])=><Link key={href} href={href} aria-current={active(href)?'page':undefined}><Icon size={19}/><span>{label}</span>{active(href)&&<ChevronRight size={14}/>}</Link>)}</nav>
        <div className="sidebar-note"><ShieldCheck size={20}/><p>One key for each PC.<small>Usage is attributed to the device’s assigned person.</small></p></div>
        <div className="sidebar-bottom"><button className="quiet" onClick={()=>void logout().catch(e=>alert(message(e)))}><LogOut size={16}/>Sign out</button></div>
      </aside>
      <div className="app-content"><div className="utility-bar"><span>Workspace <ChevronRight size={13}/><strong>{current}</strong></span><BackendConnection/></div>
        <main id="content" className="workspace">{dataMode==='synthetic'&&<div className="key-notice" role="status">Synthetic verification data — not real collected usage. Separate local QA database.</div>}{children}<footer>Device-attributed usage · API cost estimates are separate from your subscription · No plan-limit enforcement</footer></main>
      </div>
    </div>;
}
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
