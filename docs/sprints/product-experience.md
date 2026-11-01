# Product Experience & Command Center 2.0

## Final portfolio/demo release verification

The owner authorized completion and release of the accumulated Product Experience, Front Desk, demo seeder and UI/UX simplification work. Status: **COMPLETED FOR PORTFOLIO/DEMO**. Earlier test counts, database population results and preservation notes below are implementation history; this final verification supersedes pending-review/Git restrictions for this release only.

- Six Admin KPI cards use three columns/two rows on desktop (1366/1440px), two columns on tablet (768/1024px), and one column on mobile (320/390px). Emerald, orange, blue, amber, violet and cyan tints, borders, subtle shadows and icon chips strengthen the existing charcoal theme.
- Dashboard remains the overview; Front Desk remains the fast check-in workspace; Attendance remains history/reporting. Seven grouped navigation entries preserve all existing permitted routes. Financial sources, charts, permissions and demo data are preserved.
- Final backend verification: **737 tests passed** across 28 files; build passed. Final frontend verification: **361 tests passed** across 19 files; build and lint passed. **1,098 total automated tests passed**. New deployment tests verify exact-origin CORS, mutation-origin protection, production cookies, HTTPS configuration and the public API URL without database/network access.
- Final mocked Chrome acceptance: **19/19 scenarios passed**, with no runtime errors or unexpected external/backend requests. Includes all six KPI breakpoints/colors, charts and exact source figures, Front Desk simulated check-in/keyboard flow, history-only Attendance, navigation, restricted Receptionists, failure/retry and refresh. Screenshots/reports remain temporary local artifacts outside Git. Simulated browser writes are in-memory only.
- Frontend build entry is approximately **284.78 kB (90.12 kB gzip)**; routes remain split and there is no large-chunk warning. A Vercel-mode build rejects a missing API URL; a separate build with a fictional HTTPS API URL successfully embeds that public URL. No provider or database was contacted by these build checks.
- Deployment is **PREPARED, NOT DEPLOYED**: no authenticated Vercel/Render CLI, provider token or linked project was available. See [deployment.md](../deployment.md) for exact provider commands, private environment settings, cookie limitations, smoke checks and retained demo-seeder instructions. Production changes include the public Axios URL, SPA fallback, HTTPS origin validation, Secure cross-site cookies, CSRF origin enforcement, Render binding, Node 24 settings and sanitized connection/bootstrap errors.
- No real database was accessed, reset or modified during this finalization. Historical seed/read-only demo verification is recorded separately; live rollback, injected failures, concurrent financial writes and production financial approval remain outstanding. Hosted login/cookies and physical scanner/printer checks remain manual. Notifications remain SIMULATED.

Status: **COMPLETED FOR PORTFOLIO/DEMO**.

## Scope and Git preparation

- Started with a clean `develop` at the verified POS merge `f09ecbbc47892252acddc557d17d5c976fcf0048`. Fetched origin, updated with `git pull --ff-only origin develop`, and created `feature/product-experience`.
- Enhances the existing Daily Operations dashboard, connects existing workflows, improves keyboard/responsive presentation, and splits route code. Completed sprint history is preserved.
- The initial Product Experience implementation changed no dependencies, environment settings, database models, financial calculations, writes, transaction rules, authentication rules or permission defaults. The final production-hosting configuration is described in the release verification above. The initial implementation used mocked APIs. The later UI simplification includes read-only checks against the already running dedicated demo backend; see `ui-ux-simplification.md`. No Atlas troubleshooting was performed. The initial implementation stopped for review; finalization is now authorized as recorded above.

## Dashboard behavior

The latest UI uses six compact KPIs: active coverage, combined collections, attendance, outstanding balances (including overdue), expiring memberships and due follow-ups. One keyboard-accessible tabbed member queue replaces three simultaneous panels. Admins now also see equipment readiness and prioritized unresolved faults, low/out-of-stock products, recent retail receipts, reminder automation health, and the day's cash-closing status. Safety issues and recorded automation failures lead the attention list, ahead of overdue maintenance and routine queues. Each alert links to an existing permitted module. Queues are deliberately bounded; their displayed record count is not substituted for a summary total.

Seven-day attendance uses a responsive bar chart. Financial trends show separate **membership and POS collections** line/area series from their existing dated APIs, with exact accessible daily-value tables. There is no summed seven-day series or profit figure. Membership visuals show reported new purchases and renewals, not an invented active/inactive population. Today's combined card separately labels membership and POS collections.

Receptionists receive only permitted attendance, membership-assistance, balance/follow-up queues and practical quick actions. Checkout requires both `retail.read` and `retail.checkout`. With `retail.sales.read`, they can see their own recent receipts using the existing cashier-scoped sales API. They never request Admin Reports, cash-closing, retail-management, maintenance-management or automation-status APIs, including when their supplied grants contain forged Admin-only keys. An explicitly empty permission list results in no business data requests or actions.

Every source retains independent loading, empty, error and retry states through `useDashboardResource`. Shared data is fetched once per source (for example, stock and recent sales share the retail resource). A partial failure warns that the priority list may be incomplete; it does not imply healthy operations or zero collections. Refresh updates the Colombo date and all permitted resources. Request cancellation and keyed results hide old Admin data immediately after an account/permission change.

## Financial presentation and compatibility

- `GET /api/cash-closings/day/:date` is the single authoritative source for today's membership, retail and combined collections. Its existing read-only transactional preview already obtains all three ledgers consistently; it does not lock/write a financial day or create a closing.
- The client adds payment-method amounts for display from that **one response**, validating safe nonnegative whole LKR, the requested date, and agreement between each method's source breakdown and combined amount. It does not add independently fetched Reports and POS-dashboard totals. The POS summary amount is deliberately different in the test fixture to detect accidental double-counting.
- Closed days use the existing immutable stored closing snapshot. A legacy snapshot without either source breakdown remains membership-only and is labelled explicitly; retail is shown as zero for that legacy record, without backfilling or modifying it. A partially missing current/source breakdown produces an error, rather than an inferred zero.
- Outstanding balances include overdue amounts; those figures must not be added together. Collections are never labelled profit. Expenses, payments, retail checkout and all closing protections are unchanged.

## API reuse and focused additions

| Source | Existing API / use |
| --- | --- |
| Membership coverage | `reportsApi.getActiveMembers()` / `/api/reports/memberships/active` |
| Membership payment trend | `reportsApi.getCollections()` / `/api/reports/revenue/collections` |
| Outstanding/overdue snapshot | `reportsApi.getReceivables()` / `/api/reports/revenue/receivables` for Admin; existing Attention summary for permitted Receptionists |
| Attendance | `attendanceApi.getSummary()` / `/api/attendance/summary` |
| Expiry, balances, follow-ups | Existing `attentionApi` expiring, outstanding and due-follow-up endpoints |
| Combined collections and closing | `financialApi.getDay()` / `/api/cash-closings/day/:date` |
| Equipment service/unavailability | `equipmentApi.dashboard()` / `/api/equipment/maintenance` |
| Retail stock and recent sales | `retailApi.dashboard()` / `/api/retail/dashboard` for Admin; `retailApi.sales()` / `/api/retail/sales` for permitted Receptionist own receipts |

Only two read-only endpoints are added:

1. `GET /api/equipment/alerts`: authenticated Admin + `equipment.manage`. Reads the existing incident ledger for OPEN/ACKNOWLEDGED faults, orders CRITICAL/HIGH/MEDIUM/LOW then oldest, limits to five before a minimal equipment-name/asset-ID join, and projects only alert fields. A missing asset profile is labelled unavailable. This provides severity-first operational context without repeatedly fetching separate status pages or financial/technician details. No incident or asset state is changed.
2. `GET /api/notifications/automation-status`: authenticated Admin + `settings.manage`. Reuses `getAutomaticScheduleStatus()` rather than running reminder eligibility scans or retrieving reminder bodies/phone numbers from the full overview. History unavailable, failed, running/unconfirmed, disabled and successful simulation states stay distinct. This read neither schedules jobs nor creates/sends notifications.

Existing backend middleware and service-level equipment authorization protect both reads. No frontend-only protection substitutes for API authorization.

## Connected workflows and shared experience

- Expiry alert → member profile → existing membership/renewal screen, preserving both route prerequisites.
- Out/low stock → filtered product queue; a product-specific Restock link selects the existing product and focuses `#retail-restock` after loading. It never submits a stock change.
- Fault → equipment profile `#equipment-history`; preventive service → `#equipment-actions`, where existing maintenance controls remain permission-protected.
- Automation failure → Notification Center `#automation-status`. Simulation-only/manual behavior is preserved.
- Recent sale → existing immutable receipt; retail history links retain cashier scope.
- Financial overview → Daily Cash Closing with the selected date, plus existing Closing History.
- Known workflow anchors scroll and focus once per navigation, after permitted content loads; refresh does not steal focus. Unknown fragments are ignored.
- The shell now has a keyboard skip link, consistent focus-visible outlines, responsive padding and safe long-name wrapping. Existing charcoal/orange styling, sidebar groups and mobile Escape/focus-return behavior are preserved. A stale member-profile notice claiming completed modules were unimplemented was removed.

## Route loading and bundle measurements

All 30 page components now use `React.lazy` and a page-level `Suspense` boundary inside existing guards. The navigation/header stay mounted during loading. Denied routes do not render/download their lazy page. A local error boundary presents a safe reload action when page code fails, and resets on page-path navigation so another module remains available. Query/fragment changes preserve in-page form state; a regression test covers this. No warning threshold was increased and no bundler dependency/configuration was added.

Measurements are production builds from the same local environment; sizes below are decimal kB. Gzip uses Node's default `zlib.gzipSync` consistently for before/after comparison.

| Measurement | Baseline | Product Experience |
| --- | ---: | ---: |
| Entry script, raw | 832.873 kB | 282.947 kB |
| Entry script, gzip | 221.456 kB | 88.746 kB |
| Largest JS chunk, raw | 832.873 kB | 282.947 kB |
| All emitted JS combined, raw | 856.329 kB | 902.567 kB |
| Vite >500 kB chunk warning | Present | Absent |

The entry script is **66.0% smaller**. This is deferred loading, not removal of all application code: total emitted JavaScript grows with the added functionality and split-chunk overhead. The mocked Chrome first Admin dashboard visit requested 19 JS chunks totalling 396.482 kB before navigating to another page; unused Staff, Reports and other page chunks were deferred. This is not a production network/latency benchmark. Final output has 80 JS chunks; repeat navigation normally uses browser/module caching. The final acceptance run disabled the HTTP cache to verify denied-page download boundaries explicitly.

## Changed files

| Path | Change |
| --- | --- |
| `client/src/pages/DashboardPage.tsx` | Extends existing metrics/queues, permission-aware POS action, priority alerts and connected panels |
| `client/src/components/dashboard/CommandCenterPanels.tsx` | New alert, closing, automation, maintenance, fault, stock and receipt panels |
| `client/src/hooks/useCommandCenter.ts` | New independently loaded, permission-gated typed resources |
| `client/src/utils/command-center.ts` | New validated collection presentation and alert/automation state helpers |
| `client/src/api/equipment.api.ts` | Typed alert read |
| `client/src/types/equipment.ts` | Minimal fault-alert response definition |
| `client/src/api/notifications.api.ts` | Typed automation-status read |
| `server/src/modules/equipment/equipment.alerts.ts` | New bounded, read-only fault projection |
| `server/src/modules/equipment/equipment.routes.ts` | Admin-guarded alert route |
| `server/src/modules/notifications/notification.routes.ts` | Admin-guarded minimal automation-status route |
| `client/src/App.tsx` | Lazy page imports and boundaries within existing route guards |
| `client/src/components/AsyncPage.tsx` | New page loading and safe failure/reload boundary |
| `client/src/components/AppLayout.tsx` | Skip link, responsive padding, long-name layout and current platform footer |
| `client/src/index.css` | Shared keyboard focus and disabled-button feedback |
| `client/src/hooks/useWorkflowAnchor.ts` | New allowlisted asynchronous scroll/focus behavior |
| `client/src/pages/RetailProductsPage.tsx` | Existing restock workflow anchor |
| `client/src/pages/EquipmentDetailPage.tsx` | Existing action/history workflow anchors |
| `client/src/pages/NotificationsPage.tsx` | Existing automation-status workflow anchor |
| `client/src/pages/MemberProfilePage.tsx` | Removes obsolete placeholder notice |
| `client/tests/dashboard.test.tsx` | Preserves original dashboard coverage and adds integrated sources, permissions, failures, refresh and cancellation tests |
| `client/tests/command-center-values.test.ts` | New source consistency, legacy snapshots, whole LKR, unsafe amounts and priority/automation-state tests |
| `client/tests/page-experience.test.tsx` | New lazy loading/recovery, denied-loader and workflow focus tests |
| `client/tests/fixtures/command-center.ts` | New fictional typed API fixtures; never imported into application code |
| `client/tests/equipment.test.tsx` | Waits for the lazy maintenance page before existing navigation assertions |
| `client/tests/retail.test.tsx` | Waits for the lazy checkout page before existing navigation assertions |
| `client/tests/notifications.test.tsx` | Waits for lazy Notification Center before existing data/navigation assertions |
| `client/tests/staff.test.tsx` | Waits for lazy Staff Management before existing data/navigation assertions |
| `server/tests/command-center.test.ts` | New real-router authentication/role checks with mocked storage, minimal reads and error cases |
| `docs/sprints/product-experience.md` | Scope, implementation, measurements, verification and review limitations |

## Automated verification

The original 888 test cases remain; existing dashboard collection expectations now reflect the approved combined source. Four existing route-entry tests explicitly await the newly asynchronous page before checking its original content, without weakening permission or data assertions. New coverage adds 12 backend and 43 frontend cases.

- Backend `npm test`: 659 tests, 23 files; passed.
- Frontend `npm test`: 284 tests, 14 files; passed.
- Total: **943 passing tests**, including the original 888.
- Backend and frontend `npm run build`: passed.
- Frontend `npm run lint`: passed.
- `git diff --check`: passed; new files also checked separately because ordinary diff omits untracked files.

All tests use existing isolation guards and explicit API/model mocks. They do not connect to MongoDB or exercise real database transactions. Initial frontend route-entry timing failures during parallel checks prompted the explicit page-readiness waits described above; the final full run passed.

## Mocked Chrome acceptance

**19/19 scenarios passed**, using the built client, an isolated temporary Chrome profile, a local static-only server and intercepted fictional API responses. No backend process, environment configuration or database was used. All browser API calls were GETs. There were no unexpected runtime errors, off-origin requests or unintercepted API fallbacks. One page-download failure was intentionally injected for recovery testing.

Verified: exact single-ledger membership/POS/combined totals; safety/failure/service priority; refresh; product-to-restock focus; fault-to-history/maintenance controls; failure-to-automation focus and simulation notice; receipt navigation; Daily Cash Closing navigation; member-profile-to-renewal navigation; independent source error/retry; loading/empty states; legacy closed snapshot; Receptionist own receipts/no Admin requests; restricted/forged grants and denied module download; explicit deny-all; unauthenticated redirect; desktop/tablet/mobile layouts at 1440, 1024, 768, 390 and 320 px, including long staff names and drawer Escape/focus return; persistent shell during delayed page download; failed-chunk reload recovery; native Tab/Enter skip-link focus.

Screenshots and the request/result report are local temporary review artifacts, outside Git, at `C:/Users/niwan/AppData/Local/Temp/warrior-product-browser-6Fd2iV/`. Desktop and mobile screenshots were inspected visually. Temporary Chrome harnesses and fictional fixture exports were not added to the repository.

## Review limitations and manual checks

- Read-only dashboard/directory/history results have now been compared against the populated `warrior_fitness_demo` backend. Aggregation load/performance, transaction/rollback/concurrency guarantees and real session revocation remain outside this UI verification. Existing financial production-use restrictions remain in force; this dashboard does not supply production financial approval.
- Operational panels are independently fetched snapshots, not one cross-module database snapshot. Refresh is explicit; it also advances the gym date after Colombo midnight. There is no automatic polling or background refresh.
- The fault queue shows five incidents; maintenance, stock, expiry and follow-up queues are bounded and link to full modules. Priority membership alerts are based on returned queue records, not a newly calculated global final-day count.
- Scheduler health reflects recorded state only. A RUNNING record without completion is labelled unconfirmed, not assumed failed. The existing scheduler runs only with the backend process and delivery remains simulation-only.
- This adds no summed seven-day collections series, profit estimate, financial write, approval workflow or new staff/mobile functionality.
- Before live release, an authorized reviewer should compare the Admin combined card with Daily Cash Closing for an open and closed Colombo date, check real role restrictions via Network tools, and follow expiry→profile→renewal, product→restock, equipment→maintenance, notification→status and sale→receipt. Browser checks here exercised navigation and mocked reads, not real restocking, renewal or financial submissions.
- Verify deployment serves the SPA fallback for deep links and retains current hashed assets during rollout. The failed-chunk recovery path is verified with an injected download failure, not a real deployment outage.

The initial implementation awaited review. Portfolio/demo completion and Git finalization are now authorized; no additional feature is authorized.

## UI/UX simplification follow-up

Status is **COMPLETED FOR PORTFOLIO/DEMO**. See [ui-ux-simplification.md](ui-ux-simplification.md) for the current layout, chart sources, primary Front Desk flow, seven-group navigation, changed-file inventory and latest verification. Earlier verification above is retained as implementation history. The demo seeder and its populated records are preserved.
