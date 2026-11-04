'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Users, Plug, Settings, LogOut, ChevronRight, ShieldCheck, PanelLeftClose, PanelLeftOpen, Menu, X, MessageSquareText } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCollapsedNavigation } from '@/lib/navigation-preference';
import { apiFetch } from '@/lib/api';
import { BrandMark } from './brand-mark';
import { BackendConnection } from './backend-connection';

const destinations = [
  ['/overview', 'Usage', 'Tokens, trends and sessions', Activity],
  ['/sessions', 'Sessions & prompts', 'Inputs, projects and turn activity', MessageSquareText],
  ['/people', 'People & devices', 'Assignments and reporting keys', Users],
  ['/connect', 'Connect a PC', 'Set up Windows, Mac or Linux', Plug],
  ['/admin', 'Administration', 'Reporting and data settings', Settings],
] as const;

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter(), path = usePathname();
  const [collapsed, toggle] = useCollapsedNavigation();
  const [dataMode, setDataMode] = useState('collected');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false), [error, setError] = useState('');
  const drawer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (isAuthenticated) apiFetch<{dataMode: string}>('/dashboard/settings', { signal: controller.signal }).then(s => setDataMode(s.dataMode)).catch(() => {});
    return () => controller.abort();
  }, [isAuthenticated]);
  useEffect(() => { if (!isLoading && !isAuthenticated) router.replace('/login'); }, [isLoading, isAuthenticated, router]);
  useEffect(() => { drawer.current?.close(); }, [path]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const wide = window.matchMedia('(min-width: 900px)');
    const resize = () => { if (wide.matches && drawer.current?.open) { drawer.current.close(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.desktop-navigation .navigation-toggle')?.focus()); } };
    wide.addEventListener('change', resize);
    return () => { document.body.style.overflow = previous; wide.removeEventListener('change', resize); };
  }, [mobileOpen]);

  if (isLoading || !isAuthenticated) return <main className="center" role="status">Checking admin session…</main>;
  const active = (href: string) => path === href || (href === '/sessions' && path.startsWith('/sessions/')) || (href === '/people' && (path.startsWith('/people/') || path.startsWith('/devices/')));
  const current = path.startsWith('/devices/') ? 'Device details' : path.startsWith('/people/') ? 'Person details' : destinations.find(([href]) => active(href))?.[1] ?? 'Workspace';
  const close = () => drawer.current?.close();
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setError('');
    try { await logout(); close(); }
    catch { setError('Sign out failed. Check the connection and try again.'); }
    finally { setSigningOut(false); }
  }
  function links(mobile = false) {
    return <nav id={mobile ? 'mobile-workspace-navigation' : 'workspace-navigation'} aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>{destinations.map(([href, label, description, Icon]) =>
      <Link key={href} href={href} aria-label={label} aria-current={active(href) ? 'page' : undefined} onClick={mobile ? close : undefined}>
        <span className="navigation-icon"><Icon size={20} aria-hidden="true"/></span><span className="navigation-label"><strong>{label}</strong><small>{description}</small></span><ChevronRight className="navigation-chevron" size={14} aria-hidden="true"/>
        {!mobile && <span className="navigation-tooltip" aria-hidden="true">{label}</span>}
      </Link>)}</nav>;
  }
  const brand = <><span className="brand-icon"><BrandMark size={36}/></span><span className="brand-label">Usage ledger<small>Claude Code workspace</small></span></>;
  return <div className={'app-shell nav-shell' + (collapsed ? ' navigation-collapsed' : '')}>
    <a className="skip" href="#content">Skip to content</a>
    <aside className="sidebar desktop-navigation" aria-label="Workspace sidebar">
      <div className="sidebar-header"><Link href="/overview" className="brand" aria-label="Usage ledger home">{brand}</Link><button type="button" className="navigation-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-navigation" onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button></div>
      <div className="sidebar-section-label">Workspace</div>{links()}
      <div className="sidebar-note"><ShieldCheck size={19} aria-hidden="true"/><p>Private by design<small>Device keys report usage. Claude requests go directly to Anthropic.</small></p></div>
      <div className="sidebar-bottom"><button className="quiet" aria-label="Sign out" title={collapsed ? 'Sign out' : undefined} disabled={signingOut} onClick={() => void signOut()}><LogOut size={18}/><span className="navigation-label">{signingOut ? 'Signing out…' : 'Sign out'}</span></button></div>
    </aside>
    <div className="app-content"><header className="utility-bar"><div className="utility-location"><button type="button" className="mobile-menu-button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={mobileOpen} aria-controls="navigation-drawer" onClick={() => { drawer.current?.showModal(); setMobileOpen(true); }}><Menu size={20}/></button><span className="workspace-breadcrumb">Workspace<ChevronRight size={13} aria-hidden="true"/></span><strong>{current}</strong></div><BackendConnection/></header>
      <main id="content" tabIndex={-1} className="workspace">{error && <div className="error" role="alert">{error}<button onClick={() => void signOut()} disabled={signingOut}>Try sign out again</button></div>}{dataMode === 'synthetic' && <div className="key-notice" role="status">Synthetic verification data — not real collected usage. Separate local QA database.</div>}{children}<footer>Device-attributed usage · API cost estimates are separate from your subscription · No plan-limit enforcement</footer></main>
    </div>
    <dialog id="navigation-drawer" className="navigation-drawer" ref={drawer} aria-labelledby="navigation-title" onClose={() => setMobileOpen(false)} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="drawer-content"><div className="drawer-header"><Link href="/overview" className="brand" aria-label="Usage ledger home" onClick={close}>{brand}</Link><button type="button" className="navigation-toggle" aria-label="Close navigation" onClick={close} autoFocus><X size={20}/></button></div><h2 id="navigation-title">Your workspace</h2>{links(true)}<div className="drawer-footer"><p>Usage belongs to a configured device and its assigned person.</p><button className="quiet" disabled={signingOut} onClick={() => void signOut()}><LogOut size={18}/>{signingOut ? 'Signing out…' : 'Sign out'}</button></div></div>
    </dialog>
  </div>;
}
