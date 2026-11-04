# Loading and recovery

The existing navy/teal design now has layout-shaped placeholders for usage totals/charts, people, profiles, sessions, setup and administration. Placeholders are decorative (`aria-hidden`); a single status label announces loading and `aria-busy` marks the waiting region. Reduced-motion users get static placeholders. They contain no invented token or cost values.

Client fetch loading and Next.js route loading are separate: `components/loading-state.tsx` covers actual API waits, while `(dashboard)/loading.tsx` covers route suspense. `(dashboard)/error.tsx` contains unexpected view failures and offers Retry; navigation stays available.

- Initial failures show recovery controls rather than a false empty workspace.
- Changing overview filters hides the previous totals/charts and disables CSV export until a matching response arrives. An obsolete response is cancelled.
- A failed refresh of the same filters preserves results with an explicit stale warning. Try again reissues the request.
- Automatic polls skip an in-flight request, allowing a slow backend to wake. This does not prove that Render will stay awake or that telemetry is lossless.
- API requests use no-store, caller cancellation and a 90-second deadline. Reads offer retry; failed writes warn that the save outcome may be unknown. No mutation is automatically retried. Check the record before repeating creation, rotation or deletion after a connection failure.
- Session page changes clear previous-page rows; pagination stays disabled while loading.

## Local verification

Run `npm run lint` and `npm run build`. The local browser runner `scripts/check-loading-ui.cjs` uses a running localhost:3000 app/backend and the existing private `../.local/local-admin.json` from this workspace. It never prints credentials and blocks mutations after sign-in. Supply `PLAYWRIGHT_MODULE` if Playwright is provided by a separate installation. It uses installed Chrome on Windows; adapt the executable path for other QA hosts.

The runner intercepts delayed/failed API reads and a deliberate malformed response. It checks skeleton accessibility, reduced motion, desktop/390/360px layout, settings retry, filter/result coherence, stale refresh retry, polling during a slow request, 90-second timeout and render-boundary retry. The intentionally injected failures can appear in Chrome console output. Screenshots/report are stored under private `../.local/loading-ui`; no fixtures enter MongoDB. Existing management checks separately compare real local profile and CSV totals and intercept lifecycle writes.

This covers local behavior, not a complete accessibility audit or deployed Vercel/Render acceptance. Native macOS/Linux setup still needs one real report per platform before company rollout; use [platform setup](SETUP-PLATFORMS.md).
