# Product direction

Updated 2026-11-04. These are prioritized proposals, not completed features. Keep using the existing receiver, accounting and design; extend them one milestone at a time.

## Delivered navigation direction

Harbor palette: navy #122e3f, teal #0b7d83, canvas #f4f7f9, ink #183445, white surfaces and #dce5eb dividers. The desktop sidebar has an expanded mode and a compact 84px rail. The preference survives navigation/reload when browser storage is available; local fallback keeps the control usable when writes are blocked. Icon links retain accessible names and keyboard/hover labels. Mobile/tablet uses a native modal drawer rather than consuming the top of every page. It closes on navigation, Escape, backdrop click or switching to desktop. Browser health and page location remain visible above the content.

## Next: make sessions understandable

Create a dedicated session workspace with a detail timeline, model mix, cache composition and estimated cost. Add **manual session labels, project tags and notes**, such as “Customer portal / login fix”. That provides useful context without reading company prompts or source code. An ID alone cannot explain the task. Do not fabricate titles from token counts.

Implementation: add a separate session-annotations collection, unique on `(deviceId, sessionId)`, with bounded title/project/notes and edit timestamps. Keep annotations independent of immutable usage observations. Authenticated CRUD, exact-name deletion behavior, historical assignment rules and purge cleanup need tests. Missing historical session IDs remain explicit. Show first/last observed reports as observations, never exact task duration. Avoid conflating the same session ID on different devices.

Then add comparisons and cache insight from the existing records: current versus previous equivalent period; cost concentration by session/model; cache-read share of recorded input-side tokens, with an explicit denominator `input + cacheRead + cacheCreation`. This is a reuse share, not a request-level cache hit rate. Show “unavailable” for an empty denominator and keep unknown prices visible. Estimates remain separate from subscription billing.

## Additional signals that are documented

[Claude's monitoring documentation](https://code.claude.com/docs/en/monitoring-usage) lists session-start, active-time, modified-line, commit and pull-request counters. Repository attribution is opt-in and requires a compatible client. Request/error events offer latency and failure metadata through a separate logs export. Availability must be checked on real Windows Desktop, macOS and Linux clients.

Recommended collection order:

| Priority | Product outcome | Required work and limits |
| --- | --- | --- |
| 1 | Session labels, notes and project views | Manual metadata plus existing usage; no exporter change needed |
| 2 | Project attribution | Explicit approved project identifiers; optional repository metadata; do not expose private remote URLs unnecessarily |
| 3 | Activity and adoption | New typed metric collection and durable accounting; distinguish observed CLI activity from employee working time or productivity |
| 4 | Reliability diagnostics | Device/client version, last successful receipt, stale reports and collection gaps; receipt silence is not proof that a person was idle |
| 5 | Request latency and failure summaries | Separate authenticated OTLP logs parser, strict field allowlist, event identity/deduplication, bounded retention and opt-in rollout; exclude prompt/response/tool bodies |
| 6 | Administration at company scale | Viewer/admin roles, audit trail for assignment/key/deletion actions, estimated-cost thresholds and daily summaries; configure recipients before enabling delivery |

The current receiver **stores token usage only** and setup intentionally disables logs/traces. These proposals do not silently enable more collection. Metric expansion needs its own schema and unit handling: seconds/cost can be fractional, so do not reuse integer token fields. Extend durable checkpoints with metric identity and units, then test cumulative/delta semantics, resets, retries, concurrency and restart recovery before rollout. Do not count request-event tokens a second time alongside token metrics. New dimensions can change stream identity; plan rollout so an export cannot replay prior cumulative usage as a fresh stream.

For events, enforce approved fields before collection/export where possible, rather than relying only on dropping sensitive content after it crosses the network. Capture a sanitized real payload per supported environment and distinguish documented capability from verified implementation.

## Reliability work alongside features

Prioritize a durable device-side buffer before promising outage recovery. Add coordinated retention/archival, backup/restore proof, role enforcement and query budgets as company usage grows. Keep current replay protection and historical assignment snapshots. Acceptance for every milestone: isolated tests, API/dashboard/CSV agreement, desktop/mobile/keyboard review, then one real report from each relevant environment. No claims about Max-plan percentage, actual human identity on shared PCs, or lossless delivery.
