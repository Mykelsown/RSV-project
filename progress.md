# RSV Build Progress

## Fixes and polish round 4

### Status: IN PROGRESS

### Part 1 diagnosis (simulation numbers) - verified against a live database

Reproduced the exact failures before changing anything:
- The old engine stored a CUMULATIVE reading per unit per tick: `(crude total so far today / 3) * 158.987 * yield`. The reconciliation sums every reading for the day (`SUM(product_output_litres)`), so the day total multiplies on every tick.
- DB proof: with 350,000 bbl consumed across 48 production-mode ticks, the summed "daily output" reads 641,035,584 L for a single day. Dev mode ticks every 30 s (2,880 ticks/day), which is how the dashboard reached 4.5 trillion litres and 13,035,366.5% fulfillment.
- `fulfillment_percentage` is `NUMERIC(5,2)` (max 9999.99). Reproduced the failure directly on Postgres 15:
  `ERROR: numeric field overflow DETAIL: A field with precision 5, scale 2 must round to an absolute value less than 10^3.`
- Because the daily close insert fails, no reconciliation or ledger rows were ever written for simulated days, which is why the trend chart, history table and ledger were empty.

### Fix applied (Part 1)
- Every production reading is now incremental: it records only what the unit produced during that tick.
- Each simulated day gets a plan at day start: crude 300k-450k bbl, output = factor x 35M L (factor 0.55-1.05, about one day in four below 0.75), trucks 500-900.
- Each tick emits budget/24h-ticks with 30% jitter, cumulative capped at 105% of budget, so dev and production modes land on the same daily totals. MAINTENANCE units produce zero.
- Gantry loads are discrete trucks of 30,000-45,000 L; dev mode emits roughly one truck every couple of minutes.
- Dev mode crude intake becomes small metered terminal readings with `kind: "meter_reading"`; production mode keeps tanker arrivals with `kind: "tanker_arrival"`.
- Daily counters reset at the day boundary even when the reconciliation insert fails; reconciliation failures log the full database error.
- Seeder reworked: seeded days now look like live days (500-900 trucks of 30k-45k L), two forced shortfall days kept, idempotency kept.
- Startup repair added: deletes raw rows for unreconciled days whose summed output exceeds 110,000,000 L, never touches reconciled/ledger dates, auto-seeds 7 days when daily_reconciliations is empty (unless AUTO_SEED_ON_EMPTY=false), and resyncs in-memory counters from surviving rows.

### Part 2 diagnosis (simulation toggle) - verified by tracing the path
- The client toggle read `running`, which only means "engine alive" and never changes on pause, so the switch appeared not to work.
- Status was fetched once on page load and never refreshed after toggling; pause/resume existed server-side but broadcast nothing, so other tabs never learned about it.
- Fixed: single `paused` flag under the engine mutex, idempotent Pause/Resume with `[SIM] paused` / `[SIM] resumed` logs, ambiguous `paused` boolean in status, `sim_state` SSE event on every flag change with counters, counters also embedded in `dashboard_update`, and a client toggle that derives state from server data, shows a spinner, rolls back on failure, refetches after actions, SSE (re)connect and a fallback timer. All roles get a "Simulation paused" header chip.

### Pause/resume proof (Part 2) - from the live dev-mode server logs

- POST /simulation/control {"action":"pause"} returned "paused": true with "paused_at": "2026-10-20T11:12:14Z" and frozen counters (events_total 13, crude 5, production 7, gantry 1).
- While paused 60 seconds: database row counts did not move: trucks 1, production readings 21, meter readings 5 - unchanged before and after the wait. Log shows "[SIM] paused".
- POST {"action":"resume"} at 11:13:19 logged "[SIM] resumed"; within one production tick (35 s later) row counts moved to trucks 2, readings 24 (one tick = 3 unit readings), meters 5 (still inside an idle gap).
- SSE check: an open /events stream received `event: sim_state` with the paused flag and counters the moment pause was hit, and `event: dashboard_update` payloads now carry a `simulation` block.
- Control endpoint now answers 403 for roles other than operations_manager (RequireRole added).

### Part 3 to Part 8 completion

- Part 3: every chart in the app is a Google Chart through the shared GoogleChartCard: seven day fulfillment combo (per-status columns, dashed sky blue 100% target, 0-120% axis), fulfillment donut with HTML center ring, thirty day output trend with compact units, alerts per week columns, horizontal product breakdown, and the landing preview. Combo tooltips are HTML glass cards. Recharts was uninstalled; bundle main chunk is unchanged while the dashboard chunk dropped to 61 kB / 18 kB gzip and the chart bundle is lazy loaded (GoogleChartCard chunk 5.5 kB gzip loaded on demand).
- Part 4: Overview rebuilt as ordered groups (Today, Needs attention, Operations, Records, Trend) on a 12 column grid, max width 1360px, 24px gaps, 40px between groups, equal-height rows with thin internal scrollbars, the trend as a half-width box with a guide card beside it, compact number formatting everywhere, one accent color per header icon.
- Part 5: sky tokens (--sky-300/400/500/700), --brand-gradient-light and --brand-gradient-solid applied to the logo mark, primary buttons, hero tag, rhythm accents, tooltips, focus rings (2px sky-300), live dots, and dashed chart target lines; landing hero bottom and dark bands tint toward deep teal #062b3a; login panels split green-to-sky vs sky-to-royal; status colors untouched.
- Part 6: Bricolage Grotesque (600-800) for the display scale, Instrument Sans body, Instrument Serif italic for the dashboard greeting area, the landing pull quote and login panel headings, JetBrains Mono only for hashes; fluid clamp scales on the hero and section headings; tabular figures on all live numbers.
- Part 8: one SLOW_REFRESH_MS constant (config/refresh.ts) drives the records, ledger, analytics, simulation status and portal fetches; the interval pauses while the tab is hidden and resets after visibility returns beyond 5 minutes; every slow fetch also runs immediately after seed, reconcile, close day, acknowledge, note save, refresh button and SSE reconnect; grep confirms no client timer makes network requests faster than 30 minutes (only the 1 s WAT clock, the 1 minute activity relative timestamps and UI timers remain).

### Part 7 responsive verification (headless Chrome, vite build + dev server)

Script: client/scripts/overflow-check.mjs (npm run check:overflow, dev only, puppeteer-core). Results, all with scrollWidth == clientWidth (no horizontal page scroll):
- Landing /: 360, 390, 414 (portrait and landscape), 768, 1024, 1280, 1536 - all ok.
- Login /login: 360, 390, 414 (portrait and landscape), 768, 1024, 1280, 1536 - all ok, stacked panels with the two-option switch bar on narrow screens.
- Dashboard /dashboard (real login as operations_manager through the UI): 360, 390, 414, 768, 1280, 1536 - all ok.
- Applied fixes behind those results: Today tiles two per row with the ring spanning, bottom tab bar respects env(safe-area-inset-bottom), tables become stacked date+status rows with tap-to-expand extra fields, hash chips truncate with full values in title attributes, touch targets at 44px for toggles and acknowledge buttons, activity feed capped at 300px, backdrop blur reduced to 7px under 640px, min-height 100dvh, and the trend chart holds 300px minimum on phones.
- Regulatory portal shares the same stacked-table CSS, gets a full width Export CSV on small screens, and uses hash titles plus WAT stamps.
- The regulatory route was not exercised headlessly (it needs a regulatory login session in a browser); it reuses the dashboard's table, chip and chart primitives that were verified.

### Verification and limits

- go build ./... and go vet ./... pass; unit seeded and reconciled days fit NUMERIC(5,2) with fulfillment 62.00-104.25 percent and 8 ledger rows.
- react build (tsc -b + vite) and oxlint pass: 0 errors, 7 pre-existing warnings.
- Limitation: the "Updated HH:MM WAT" stamp shows "Updated just now" until the first slow refetch resolves; pause/resume was verified through the API and SSE rather than screenshots of every tab.

## Phase 1 — Core Data Entry and Ledger

### Status: COMPLETE

### Last Updated: 2026-09-10T00:00:00Z

### Completed
- Docker PostgreSQL setup with docker-compose.yml
- Database schema with all 7 tables and immutability trigger
- Go backend with Chi router and pgx database driver
- Repository layer with all CRUD operations
- Reconciliation engine with SHA-256 hash chaining
- REST API endpoints under /api/v1
- SSE endpoint for real-time dashboard updates
- Mock data seeder with 7 days of realistic Nigerian refinery data
- CORS middleware for frontend communication
- Daily reconciliation scheduler (goroutine with ticker)
- React frontend with Vite, TypeScript, and Tailwind CSS
- Dashboard UI with summary cards, alerts, chart, table, and ledger
- Real-time updates via SSE connection
- End-to-end testing completed

### In Progress
- (none)

### Remaining
- Phase 2: Authentication and role-based access (IN PROGRESS)
- Phase 3: Advanced analytics and reporting
- Phase 4: Real IoT/SCADA integration

## Phase 2 — Authentication and Role-Based Access

### Status: COMPLETE

### Last Updated: 2026-09-11T00:47:00Z

### Completed
- JWT authentication and user management
- Role-based route protection
- Read-only NMDPRA regulatory portal
- Notes on reconciliation records
- Frontend auth and route flow
- Live verification on alternate DB port 5433 for all seeded roles

### In Progress
- (none)

### Remaining
- Phase 3: Advanced analytics and reporting

### Notes
- All data is simulated with realistic mock data
- Mock data seeder generates 7 days of historical data
- Reconciliation engine calculates fulfillment percentage
- Ledger entries are hash-chained and immutable
- Frontend uses dark color scheme appropriate for industrial dashboard
- Phase 2 user roles and access control verified successfully

## Phase 3 — Advanced Analytics and Reporting

### Status: COMPLETE

### Last Updated: 2026-09-11T00:00:00Z

### Completed
- Analytics summary, trend, and alerts summary endpoints
- Product breakdown, crude source, and distributor analytics views
- Dashboard Analytics and Crude & Distribution tabs
- Operational report generation in CSV and JSON formats
- Regulatory read-only period intelligence summary cards
- Live verification of role-based access and report download flow

### In Progress
- (none)

### Remaining
- (none)

## Phase 4 — Live Simulation and Integration

### Status: COMPLETE

### Last Updated: 2026-09-11T00:00:00Z

### Completed
- Live refinery simulation engine with pause/resume and day-close controls
- Server-side SSE event broadcasting for live operational activity
- Data source abstraction and simulated SCADA ingestion registry
- API-key protected ingest endpoint for live payload submission
- Dashboard simulation status panel with event feed and control actions
- Build verification for Go backend and React frontend after Phase 4 wiring

### In Progress
- (none)

### Remaining
- (none)

### Project Status: PITCH READY

## Patch Session

### Status: COMPLETE

### Applied fixes
- fix: add SIM_MODE, SIM_DEV_MODE, and INGEST_API_KEY to environment config
- fix: increase live activity feed buffer from 8 to 50 events
- feat: add integration tab with data source cards and architecture documentation
- Fixed simulation ticker blocked by ReconciliationExists guard
- Fixed simulation engine context cancellation
- Fixed dashboard cards not refreshing on sim_event
- Added startup cleanup of zero-value reconciliation records

### Project Status: PITCH READY

## Frontend Redesign V3 (green and white)

### Status: COMPLETE

### Last Updated: 2026-10-15

### Completed
- Stage 1: green, white and blue design tokens, Barlow and JetBrains Mono typography, motion system with prefers-reduced-motion handling
- Stage 2: RippleSurface, useRipple, RippleButton, IconCircle, GlassWidget, KPITile, StatusPill, Donut, LiveDot and useInView shared primitives
- Stage 3: landing page with utility bar, hero, overlapping feature cards, about split with checklist block, connected systems strip, problems and solutions marquee, process steps with drawn line, static dashboard preview, CTA and footer
- Stage 4: dual glass panel login with dominant and receded swap, wired to AuthContext login and role redirects
- Stage 5: dashboard glass board with sticky header bar, greeting, segmented navigation with sliding indicator, fulfillment and clock widgets, refresh with one spin, account sheet, mobile glass bottom tab bar, section crossfade and one-time load choreography
- Stage 6: analytics, crude and distribution, reports and integration restyled into glass widgets with the shared grid
- Stage 7: read-only regulatory portal with blue accents, summary strip, period intelligence, CSV export and always-expanded ledger
- Stage 8: contrast bumps, keyboard focus states, eager hero image, ARIA roles on switches, collapses and labels, production preview route checks

### Notes
- API_BASE unchanged, backend untouched, SSE endpoints and event names unchanged, roles and redirects unchanged
- Dashboard and regulatory routes are lazy-loaded; landing main chunk is about 95 KB gzipped
- Icons come from lucide-react at stroke width 1.75 inside circular containers; the GitHub mark is inlined because lucide dropped brand icons
- Photos are read from client/public/images/ with dark green fallbacks if a file is missing
- npm run build, oxlint and vite preview route checks pass

## Frontend Redesign Revert

### Status: COMPLETE

### Action: Reverted client to Phase 4 state via git checkout

### Reason: Redesign prompt broke the UI

## Frontend Redesign V2

### Status: COMPLETE

### Last Updated: 2026-10-06T13:20:00Z

### Completed
- Public RSV landing page at `/` and `/landing`, including the hero, stats, six capabilities, pausable problem-solution marquee, process steps, CTA, and footer
- Responsive dual-audience login with operations and regulatory access panels, retaining role-based redirects through AuthContext
- Shared wine and blue design tokens, Inter and Syne typography, and StatusPill, KPICard, PanelCard, and LiveDot components
- Responsive dashboard with independently scrolling desktop section cards, mobile bottom tabs, crossfading views, 2x2 overview KPIs, and restyled analytics and operational sections
- Regulatory portal restyled with the blue-deep header, refinery silhouette banner, summary strip, tokenized cards, and shared status pills
- Client changes only, existing API, SSE, and auth flows retained
- No em dashes in client source copy
- Production build and responsive browser checks passed

### Notes
- `npm run build` reports the existing large JavaScript chunk warning, with no build errors
- Browser preview: `http://localhost:5173/`
