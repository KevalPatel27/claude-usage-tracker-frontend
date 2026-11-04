'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileText, Monitor, Laptop, Terminal } from 'lucide-react';
import { localSetupOrigin, platformNames, setupOrigin, teamSetupMessage, type SetupAudience, type SetupPlatform } from '@/lib/team-setup';

export function TeamSetupInstructions({ device, backendUrl, siteUrl, history, existing }: { device: { id: string; name: string } | null; backendUrl: string; siteUrl: string; history: boolean; existing: boolean }) {
  const [audience, setAudience] = useState<SetupAudience>(existing ? 'update' : 'new'), [downloadSite, setDownloadSite] = useState(siteUrl);
  const [copied, setCopied] = useState<SetupPlatform | null>(null), [error, setError] = useState(''), [expanded, setExpanded] = useState<SetupPlatform | null>(null);
  const previews = useRef<Partial<Record<SetupPlatform, HTMLTextAreaElement | null>>>({});
  useEffect(() => { if (!siteUrl) { const timer = setTimeout(() => setDownloadSite(window.location.origin), 0); return () => clearTimeout(timer); } }, [siteUrl]);
  const site = setupOrigin(downloadSite), backend = setupOrigin(backendUrl), local = localSetupOrigin(downloadSite) || localSetupOrigin(backendUrl);
  const enabled = !!device && !!site && !!backend;
  const message = (platform: SetupPlatform) => device ? teamSetupMessage({ platform, audience, deviceId: device.id, deviceName: device.name, siteUrl: downloadSite, backendUrl, history }) : null;
  async function copy(platform: SetupPlatform) {
    const text = message(platform); if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(platform); setError(''); }
    catch { setCopied(null); setExpanded(platform); setError('Clipboard access is unavailable. Select and copy the instruction text below, or download its text file.'); requestAnimationFrame(() => { previews.current[platform]?.focus(); previews.current[platform]?.select(); }); }
  }
  function download(platform: SetupPlatform) {
    const text = message(platform); if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `claude-tracker-${audience}-${platform}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section id="team-instructions" className="panel team-setup" aria-labelledby="team-setup-title">
    <div className="section-title"><div><h2 id="team-setup-title"><FileText size={20}/>Send instructions to your team</h2><p className="section-description">Copy a complete message or download a text file for the employee’s operating system.</p></div><span className="badge">Keys are never included</span></div>
    {!device && <p className="session-notice">Register a device above, or select an existing device and continue. Its details will be added to each message. <a href="#device-connection">Choose a device</a></p>}
    <div className="team-setup-controls"><div className="segmented" role="group" aria-label="Team instruction type"><button aria-pressed={audience === 'new'} onClick={() => { setAudience('new'); setCopied(null); }}>New installation</button><button aria-pressed={audience === 'update'} onClick={() => { setAudience('update'); setCopied(null); }}>Update an existing PC</button></div><label>Setup download website<input type="url" value={downloadSite} onChange={e => { setDownloadSite(e.target.value); setCopied(null); }} placeholder="https://your-dashboard.vercel.app" aria-describedby="team-site-help"/></label></div>
    <p id="team-site-help" className="field-help">Use the frontend website that serves the latest setup downloads. Reporting uses <strong>{backendUrl || 'the configured public backend'}</strong>. Confirm both addresses and the backend update are available before sending instructions.</p>
    {(!site || !backend) && <p role="status" className="session-notice">Enter a plain HTTPS download website without a path. The public backend must also be configured; loopback HTTP is supported for local tests.</p>}
    {local && <p className="session-notice">A local address works only on this PC. These instructions are not ready for a teammate until both the website and reporting backend are reachable from their PC. Configure PUBLIC_SITE_URL and PUBLIC_INGESTION_URL for a shared installation.</p>}
    {(site?.includes('.trycloudflare.com') || backend?.includes('.trycloudflare.com')) && <p className="field-help">Temporary Cloudflare links can change or stop when the local tunnel closes. Confirm they still work before sharing.</p>}
    <div className="team-update-note"><strong>{audience === 'update' ? 'Already installed? Keep the same device and key.' : 'Send each employee the instructions for their own device.'}</strong><p>{audience === 'update' ? history ? 'The latest single installer updates metrics and history together, preserving this device and its saved key. The employee runs one file once; if prompted, they enter the same existing key.' : 'The update message refreshes metrics settings with the same existing key. It does not register another PC or enable input history.' : 'Provide the newly generated device key privately and separately. The message explains setup, restart and how to confirm completion.'}</p><span>{history ? 'Includes opted-in captured-input history and its collection notice.' : 'Metrics only. Enable captured-input history above before generating history setup instructions.'}</span></div>
    {device && <p className="field-help">These messages are for <strong>{device.name}</strong> only. Generate separate instructions for every registered PC; do not forward one device’s message to the whole team.</p>}
    <div className="team-platform-grid">{(['windows', 'macos', 'linux'] as const).map(platform => {
      const Icon = platform === 'windows' ? Monitor : platform === 'macos' ? Laptop : Terminal;
      return <article key={platform} className="team-platform-card"><div className="team-platform-heading"><span><Icon size={21}/></span><div><h3>{platformNames[platform]}</h3><p>{platform === 'windows' ? 'PowerShell' : 'Terminal'} + Python 3.8+</p></div></div><p>{audience === 'update' ? 'Latest installer, same device, same key.' : 'Downloads, commands and first-report steps.'}</p><button className="primary" disabled={!enabled} onClick={() => void copy(platform)} aria-label={'Copy ' + platformNames[platform] + ' instructions'}>{copied === platform ? <Check size={15}/> : <Copy size={15}/>}Copy instructions</button><button disabled={!enabled} onClick={() => download(platform)} aria-label={'Download ' + platformNames[platform] + ' instructions'}><Download size={15}/>Download .txt</button><details open={expanded === platform} onToggle={e => { if (e.currentTarget.open) setExpanded(platform); else setExpanded(current => current === platform ? null : current); }}><summary>Preview message</summary><textarea aria-label={platformNames[platform] + ' instruction preview'} ref={element => { previews.current[platform] = element; }} readOnly value={message(platform) ?? 'Choose a registered device and valid addresses to generate its instructions.'}/></details></article>;
    })}</div>
    <p role="status" className="field-help">{copied ? platformNames[copied] + ' instructions copied. Paste the message into your team chat or email; provide keys separately.' : error || 'You send the message yourself. Copying instructions does not install software or send anything to your team.'}</p>
  </section>;
}
