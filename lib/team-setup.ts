export type SetupPlatform = 'windows' | 'macos' | 'linux';
export type SetupAudience = 'new' | 'update';
export const platformNames: Record<SetupPlatform, string> = { windows: 'Windows', macos: 'Mac', linux: 'Linux' };
export function setupOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) || !/^[a-zA-Z0-9.:[\]-]+$/.test(url.hostname)) return null;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
export function localSetupOrigin(value: string) { const origin = setupOrigin(value); return !!origin && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname); }
export function teamSetupMessage({ platform, audience, deviceId, deviceName, backendUrl, siteUrl, history }: { platform: SetupPlatform; audience: SetupAudience; deviceId: string; deviceName: string; backendUrl: string; siteUrl: string; history: boolean }) {
  const backend = setupOrigin(backendUrl), site = setupOrigin(siteUrl);
  if (!backend || !site || !/^[a-f0-9]{24}$/i.test(deviceId)) return null;
  const file = platform === 'windows' ? 'setup-pc.ps1' : `setup-${platform}.sh`;
  const options = platform === 'windows' ? (history ? ` -DeviceId "${deviceId}"` : ' -NoHistory') : (history ? ` --device-id "${deviceId}"` : ' --no-history');
  const metrics = platform === 'windows' ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\setup-pc.ps1" -BackendUrl "${backend}"${options}` : `bash "./${file}" --backend-url "${backend}"${options}`;

  const steps: string[] = [];
  const add = (text: string) => steps.push(`${steps.length + 1}. ${text}`);
  add(`Use your normal ${platformNames[platform]} user account${platform === 'windows' ? ', not a different administrator account' : ', without sudo'}. Claude Code must already be installed. Close local Code sessions and fully quit Desktop before running setup. Python 3.8+ is required (${platform === 'windows' ? 'python' : 'python3'} must work).`);
  add(`${audience === 'update' ? 'Replace the old downloaded installer with this latest copy' : 'Download this single installer'} and save it in Downloads:\n${site}/${file}\nKeep its filename exactly ${file}, replacing any older copy. If your browser adds (1) to the filename, rename the new download before using the command below. Review the file before running it. No second installer is needed.`);
  add(`Open ${platform === 'windows' ? 'PowerShell' : 'Terminal'} in the folder containing the downloaded file, then run this one plain-text command:\n\n${metrics}\n\n${audience === 'update' ? 'The installer reuses your saved device key for this same backend. If it asks, enter the SAME existing device key.' : 'Enter the device key your admin provides privately once if asked.'} Do not put keys in commands or group chats. It updates metrics${history ? ' and installs/updates the bundled input-history helper automatically' : ' only; previously installed owned history hooks and queued input are removed'}. Do not register another device or create another key. If the key is unavailable, contact your admin.${platform === 'windows' ? ' ExecutionPolicy Bypass applies only to this setup process; organization policy still takes precedence.' : ''}`);
  add(`${platform === 'macos' ? 'Fully quit Claude Desktop with Cmd+Q and reopen it.' : platform === 'windows' ? 'Completely quit Claude Desktop, including its tray icon, and reopen it.' : 'Exit existing Claude Code sessions and reopen your supported local Code app.'} Terminal users must restart Claude Code too. Start a NEW local Code session, send a harmless prompt and let it finish. Wait at least 60 seconds.`);
  add(`Reply to your admin with “Setup complete”, your device label and the approximate time you sent the test prompt. Your admin will verify ${history ? 'both input history and token reports' : 'a new positive token report'} in the dashboard. A setup success message alone does not prove reports arrived. Never send your key or private settings/backups.`);
  return [`Claude Code tracker — ${audience === 'update' ? 'update your existing setup' : 'first-time setup'} (${platformNames[platform]})`, `Device label: ${deviceName.replace(/[\r\n]/g, ' ')}`, `Device ID: ${deviceId}`, `Reporting backend: ${backend}`, '', audience === 'update' ? 'Already installed? Use this latest installer for the SAME registered device and SAME key. Keep your existing device record; this does not require a new registration or key rotation.' : 'Your admin has registered this device. Use only the device/key assigned to this PC; do not share it with another PC.', '', history ? 'Collection notice: token usage plus captured input text, session IDs, character counts and observed turn duration. Automated notifications and pasted private content may appear; authorship is not guaranteed. Assistant-response/tool-output fields and transcript files are not read. Ask your admin before proceeding if you have questions about collection.' : 'Collection notice: token usage and session identifiers only; this setup does not enable input-text history.', '', ...steps.flatMap(step => [step, '']), 'Existing unrelated Claude settings are preserved and changes are backed up. Keep backups private. This is a one-time setup/update, not an automatic updater. Outages or process exit can leave reporting gaps.'].join('\n');
}
