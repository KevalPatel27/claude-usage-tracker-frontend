# Connect Windows, macOS and Linux

Each execution host/environment gets its own ingestion-only tracker key mapped to an assigned person. Device names are friendly labels. Shared devices do not identify the human using them. The dashboard's **Connect a PC → Device operating system** selector chooses downloads, commands, removal and restart guidance.

## Before starting

Install/sign in to Claude Code or an officially supported Claude Desktop app first. These scripts configure reporting; they do not install Claude, a background service or Python. On macOS/Linux, Bash and Python **3.8+** are required. If python3 is missing, use your organization's approved installation process. Run as the same ordinary user who runs Claude, **without sudo**. GUI Desktop sessions read user settings; this setup writes JSON rather than editing shell profiles or relying on exports from one terminal.

Official references: [settings and precedence](https://code.claude.com/docs/en/settings), [telemetry](https://code.claude.com/docs/en/monitoring-usage), [Linux Desktop beta](https://code.claude.com/docs/en/desktop-linux). As checked 2026-11-03, Linux Desktop is beta on supported Ubuntu/Debian versions; other distributions can use the Claude Code CLI. Cowork and cloud/SSH sessions are separate environments and are not configured by running the script on the local host. Run setup in the environment where local Code actually executes (WSL has its own Linux profile).

## Register and configure

1. Open the hosted dashboard, add/select the assigned person and register this device. Save its one-time key. Keys from an unrelated local database do not authorize your Atlas-backed deployment.
2. Select the actual OS and download its script. Review it before execution. Keep the original filename, or adjust the command to match your download.
3. Open a terminal in the folder containing the downloaded file. Use the hosted backend HTTPS origin, without /v1/metrics (the script adds that path). The examples below are placeholders; the dashboard copies your configured origin automatically.

Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\setup-pc.ps1" -BackendUrl "https://YOUR-BACKEND.onrender.com"
```

macOS Terminal:

```bash
bash "./setup-macos.sh" --backend-url "https://YOUR-BACKEND.onrender.com"
```

Linux Terminal:

```bash
bash "./setup-linux.sh" --backend-url "https://YOUR-BACKEND.onrender.com"
```

Enter the key at the hidden prompt. It never belongs in the copied command or shell history. If a terminal cannot hide input, setup refuses to read the key; use a normal interactive terminal. Managed automation can supply a key on stdin using --key-stdin; do not put literal credentials in scripts or command arguments.

## Verification and restart

- macOS: fully quit Desktop with Cmd+Q, reopen, then start a new **local Code** session. Terminal users must exit/restart Claude Code.
- Linux: exit/restart Claude Code; if using supported Desktop beta, quit/reopen that app and start a new local Code session. On other distributions use `claude` in Terminal.
- Windows: completely quit/reopen Desktop and start a new local Code session.
- Send a short prompt, wait at least 60 seconds, then use **Check for a usage report** in the dashboard. Health alone is insufficient. Inspect the assigned device/person and its readable session ID.

Managed settings, launcher environment or higher-priority environment values can override user settings. Corporate policy is not bypassed; ask your IT administrator to configure an approved telemetry destination if needed. A successful file write is not proof of Desktop delivery on that specific OS/version.

## What is changed

The shared macOS/Linux engine merges only ten telemetry keys under env in `~/.claude/settings.json`, or the configured CLAUDE_CONFIG_DIR/settings.json. --settings-path targets an explicit file if required; make sure the actual app reads that same location. Settings, ownership state and backups contain keys and are written owner-only (0600 on POSIX); new configuration directories use 0700. Existing unrelated JSON is preserved. Logs/traces are disabled; metrics use OTLP HTTP/JSON, cumulative counters, session IDs and a 60-second export interval.

The scripts validate URL/key/JSON/state before changing settings, reject duplicate JSON keys, symlink settings files and overlapping setup runs, and use atomic file replacement. Ownership state is saved first for recovery after interruption. A private byte-for-byte settings backup precedes each change. No account stores, shell profiles, system services or packages are changed, and setup makes no network requests. No metrics are fabricated or submitted as a test.

Preview macOS/Linux changes without a key or writes by appending `--dry-run`. Read the shown settings path. An interrupted run can leave a .usage-tracker.lock file; only remove that specific lock after confirming no setup is running. Do not remove unrelated files.

## Rotation and removal

Apply a newly rotated key by rerunning the same setup command; the original pre-install values remain available for removal. Keys remain private in the settings and ownership/backups.

```bash
bash "./setup-macos.sh" --remove
bash "./setup-linux.sh" --remove
```

Use only the matching OS command. Windows uses `.\setup-pc.ps1 -Remove`.

Removal restores only keys that still equal the script's installed values, preserving later user edits. It does not recreate a settings file the user deleted. Backups are deliberately retained for recovery and can contain old keys. Revoke the device key in the dashboard to invalidate reporting authorization, and restart sessions again.

## Development and verification evidence

`public/setup-posix.py` is the shared standard-library engine. `node scripts/generate-posix-setup.mjs` embeds it in two standalone OS-checked Bash downloads; users only download one .sh. Regenerate both after editing the engine. Run `python scripts/test_setup_posix.py` on development Windows or `python3 scripts/test_setup_posix.py` on macOS/Linux. Tests use isolated, ignored .local directories and synthetic keys, never real Claude settings.

Current evidence: 9 shared-engine preservation/privacy tests passed on Windows Python; Bash syntax checks passed for both downloads; existing Windows PowerShell preservation tests passed; frontend lint/build and local browser OS/download/command/mobile checks passed with registration writes mocked. POSIX-only permission/symlink assertions and actual native macOS/Linux execution/telemetry delivery are **not independently verified** on this Windows host. Existing WSL contained no Python/Bash and Docker engine was unavailable; no OS/packages were installed to conceal this gap. Validate one real company Mac and Linux device before broad rollout. Backend protocol is unchanged; its previous 81-test result is separate evidence, not a new native-platform test.
