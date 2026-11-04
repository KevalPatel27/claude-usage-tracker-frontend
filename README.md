# Usage ledger — frontend

A responsive Next.js / React / TypeScript dashboard for Claude Code usage across Windows PCs. Backend: [claude-usage-tracker-backend](https://github.com/KevalPatel27/claude-usage-tracker-backend).

## Features

- Admin sign-in with HttpOnly cookies and a same-origin backend proxy.
- Date/timezone/person/device/model/session filters, token and estimated-cost charts, CSV export and collection diagnostics.
- Person/device profiles, assignment history, lifecycle controls, confirmed permanent deletion and one-time device keys.
- Guided Windows onboarding with a downloadable PowerShell script, configuration backups/removal and real-report verification.
- Original Usage ledger branding, favicon, mobile icons and share-preview artwork. Keyboard and mobile states are supported.

Device attribution does not prove who used a shared PC. API-equivalent estimates are separate from Max subscription billing and do not measure remaining allowance. No prompts/transcripts are collected by this dashboard.

## Local development

Requires Node.js 22 and the companion backend running with a MongoDB replica set.

```sh
npm ci
```

Copy `.env.example` to `.env.local` and configure:

| Variable | Purpose |
| --- | --- |
| BACKEND_URL | Backend origin used by the server API proxy, e.g. http://127.0.0.1:4000 |
| PUBLIC_INGESTION_URL | Backend origin used in Windows onboarding; use a reachable HTTPS address for other PCs |
| PUBLIC_SITE_URL | Public frontend origin for share-image URLs; optional Vercel production-domain fallback |

No MongoDB credentials, JWT secrets or device keys belong in frontend environment variables. BACKEND_URL is server-only; the browser calls `/api/*` on this frontend.

```sh
npm run dev
```

Open http://localhost:3000. Use the backend bootstrap secret once to create the first admin, then disable backend bootstrapping. For local HTTP development, the backend should use NODE_ENV=development. Never commit .env.local or generated credentials.

## Connect a Windows PC

1. In **Connect a PC**, register its assigned person and a friendly device label. The label need not match the Windows hostname.
2. Save its one-time key and download the script (`public/setup-pc.ps1`, served at `/setup-pc.ps1`).
3. Review it and run the dashboard's copied command on that PC, for example:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\setup-pc.ps1" -BackendUrl "https://YOUR-BACKEND.onrender.com"
```

4. Enter the device key in its hidden prompt. The script preserves other Claude settings, backs up changes and supports `-Remove`. It does not install Claude Desktop; install/sign in to Claude Desktop separately. Organization-enforced signing policies still apply.
5. Completely quit/reopen Desktop, start a new **local Code** session, use a short prompt and wait at least one export interval. Use Verify in the dashboard; backend health alone is insufficient.
6. Repeat with a separate key on PC 2. Normal Claude requests go directly to Anthropic; only metrics go to the backend. No extra tracking daemon is installed.

Existing session IDs are included by the setup configuration. Session drilldown and CSV show the readable ID when reported; unmatched history remains explicitly unavailable.

## Checks and production build

```sh
npm run lint
npm run build
npm start
```

Latest local verification: lint/build passed; browser checks covered desktop/tablet/360–390px mobile, real session IDs, token/cost/CSV agreement, onboarding, branding and mocked management writes. Browser evidence and private local credentials are intentionally not included. Local checks do not establish deployed HTTPS behavior.

## Vercel deployment

Import this repository using the Next.js preset and **repository root** (not a nested frontend directory). Set the environment variables above before building. Changing BACKEND_URL requires rebuilding. Add the exact Vercel frontend origin to backend ALLOWED_ORIGINS. Verify real HTTPS sign-in/logout, cookies, Windows script download and authenticated telemetry after deployment. `vercel.json` is included. Pushing this source does not itself authorize a new hosting deployment.

MongoDB remains backend-only. The dashboard can be closed while PCs report. Free/backend outages and cold starts can lose unexported usage; no lossless-delivery claim is made.

## Brand assets

Vector masters and reusable wordmark assets are in `public/brand`. Icons and Open Graph/Twitter images use Next metadata file conventions in `app`. Run `node scripts/generate-brand.mjs` after editing the vector masters, then rebuild. The app manifest supplies home-screen icons and theme metadata; it does not enable offline telemetry.

Windows setup preservation tests: `pwsh -File scripts/test-setup.ps1` (or Windows PowerShell). This uses isolated files under ignored `.local/setup-tests`, never your live Claude settings.

## Browser keep-alive and connection status

Every authenticated dashboard page mounts one backend health monitor. It requests `/api/backend-health` immediately and every five minutes after a completed check; Next rewrites that to BACKEND_URL/health. Responses and fetches bypass caching; the request sends no credentials or device key. The top bar shows checking/connected/unavailable/offline and lets you retry. Returning to a visible tab or reconnecting the network triggers another check. A 75-second timeout prevents hanging requests; failures retry after 30 seconds up to three times, then return to five-minute intervals. Logout removes the timer and aborts pending requests.

This is best effort while the browser tab runs. Closing the browser, PC sleep and tab suspension stop reliable pings. A stopped backend cannot run a self-ping to wake itself. Incoming telemetry also counts as traffic. Render can still restart/suspend a free instance or hit its usage limits; the feature does not provide lossless telemetry or 24/7 availability. Real deployed Render cold-start recovery has not been verified; local browser tests simulated failures/timeouts and verified scheduling, backoff, recovery and cleanup. Changing the proxy backend origin still requires a frontend rebuild.

## macOS and Linux onboarding

Connect a PC now has a Windows/macOS/Linux selector. The standalone `public/setup-macos.sh` and `public/setup-linux.sh` downloads require Bash + Python 3.8+, prompt for the key privately and preserve other settings. They use the shared `public/setup-posix.py` engine; regenerate downloads with `node scripts/generate-posix-setup.mjs`. Run without sudo. See [platform setup and verification](docs/SETUP-PLATFORMS.md) for commands, prerequisites, backups/removal, CLI/Desktop limitations and native verification status. Run `python3 scripts/test_setup_posix.py` for isolated preservation tests (Windows developers can use python).

### Loading and recovery

See [loading and recovery](docs/LOADING-AND-RECOVERY.md) for accessible skeletons, filter/result consistency, request timeouts, retry behavior and local browser checks.
