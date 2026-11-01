# Public recruiter demo access

Status: **COMPLETED FOR PORTFOLIO/DEMO**. Branch: `develop`. The owner authorized final simplification, verification, commit and push to `develop`. No deployment or changes to `main` are authorized. The two compact KPI files are preserved byte-for-byte.

## Final simple-start release

- Ordinary development now uses exactly `cd server; npm run dev` and `cd client; npm run dev`, in separate terminals. The backend reads the normal ignored `server/.env`, whose private URI now targets the already populated `warrior_fitness_demo`. Existing JWT/bootstrap values and database passwords were not changed. The scheduler is disabled and public demo login is enabled for this database.
- Root cause: an old project demo process occupied port 5000 and returned 404 for `/api/auth/demo-login`; the normal `.env` still pointed at a different database. Only confirmed stale Warrior Fitness processes were stopped. The current ordinary backend serves the latest routes on port 5000. Vite stays on 5173 with a direct IPv4 proxy to that backend, rather than silently changing ports.
- Removed the separate demo launcher and standalone viewer-provisioning command/script. The existing viewer is reused; the guarded endpoint keeps its original insert-only fallback. The seeder remains an optional utility and was not run. No startup migration, seeding, account reset or business write was performed.
- Started **both actual `npm run dev` processes**. **9/9 live Chrome scenarios passed**, with real APIs and no mocked responses: desktop/mobile login, one-click demo, normal Admin Sign In using privately verified unchanged credentials, reload/navigation, 60 members, seven-day charts and collection comparisons, Front Desk reads, POS/equipment/finance/notification reads, and real server rejection of ten demo mutation categories.
- Verified **14 existing attendance dates**. Before/after fingerprints for **all 25 existing non-session collections** matched, including all staff/password and financial documents. Auth session creation/logout affected only the verification visitors' technical sessions; no existing business record changed. Normal Admin logout was not invoked, preserving its existing sessionVersion as well.
- Final checks: **815 backend + 396 frontend = 1,211 passing automated tests**, both builds, frontend lint, tracked/new-file whitespace and credential scans. The original database was never connected to or modified. No credentials or `.env` files are included in Git.
- Earlier verification sections below are retained as implementation history. The former special-launch instructions and pending-approval restrictions are superseded by this simple-start release. Hosted deployment remains a separate owner action; no deployment was attempted.

## Behavior and safety

- The existing Login page retains normal staff email/password sign-in. **Try Demo — Explore Warrior Fitness** starts a separate read-only visitor session and opens the existing dashboard; there is no preview application, public registration or exposed/shared Admin password.
- `DEMO_PUBLIC_LOGIN_ENABLED` is strictly validated and defaults to false. Actual connected database identity must be exactly `warrior_fitness_demo`, with a connected driver. An inherited URI, matching string alone, disconnected connection or other database cannot enable demo login. Existing demo sessions also fail closed when the flag is disabled or the database changes.
- The reserved staff identity has an immutable server-owned `isDemoViewer` marker. Its fixed ID/email are identifiers, not credentials. Insert-only provisioning rejects collisions, disabled/malformed reserved identities and overwrite attempts. A random unusable password hash is generated once; password login rejects the viewer. Staff Management and the shared security update filter protect the viewer from ordinary staff edits.
- `ADMIN` is retained for existing reporting reads. A demo JWT must also carry a valid per-visitor session identifier and match the persisted demo identity; neither claims nor request input can turn a normal account into a viewer or promote a viewer into a normal Admin. JWT signatures, account activity, sessionVersion and eight-hour expiry remain checked.
- Authentication rejects every business mutation method before business handlers, validation or persistence. Only explicitly audited GET/HEAD routes are allowed, so unknown/unusual GET endpoints fail closed too. Frontend write grants/actions are hidden or disabled; financial/maintenance permissions shared by read and write APIs retain their read navigation.
- Only technical authentication writes are exempt: inserting the reserved identity, creating a hashed per-visitor session, and deleting that visitor's own session on logout. The `public_demo_sessions` TTL collection is in the same database and cannot auto-create in normal databases. Expiration is checked on every request independently of delayed TTL cleanup. Normal Admin logout still atomically revokes that staff account's sessions; viewer logout never changes shared staff sessionVersion.
- Frontend restoration and session expiry use the existing auth provider and 401 handling. The header shows **Demo Mode — Read Only**. Public login has independent rate limiting (15 attempts/IP/15 minutes, successes included), exact frontend Origin validation, no-store responses and the same cookie architecture. Rate limiting is process-local, so a multi-instance deployment needs shared rate limiting before broader public use.

## Route side-effect audit

Reviewed all **15 route files**, registering **51 GET routes and 37 POST/PUT/PATCH routes**, including authentication and health. Read policy is centralized in `server/src/modules/auth/demo-access.ts`; an automated inventory check requires explicit coverage of every current business GET. GET handlers and their invoked services were checked for persistence and aggregation write stages.

| Routes / source paths | Read behavior and mutation boundary |
| --- | --- |
| `server/src/modules/auth/auth.routes.ts`, `server/src/modules/health/health.routes.ts` | `/me` restores validated identity; health reads connection status. Only explicit authentication POSTs manage cookies/technical sessions. |
| `server/src/modules/members/`, `membership-plans/`, `memberships/` route/controller files | Directory, profile, plan and membership reads do not save or create records; all enrollment, renewal, profile, plan and status writes are blocked. |
| `server/src/modules/billing/invoice.routes.ts`, `invoice.controller.ts`, `invoice.list.controller.ts`, `payment.routes.ts`, `payment.controller.ts` | Invoice/payment history and summaries are reads. Invoice generation occurs only in POST, not during invoice viewing. All invoice/payment mutations are blocked. |
| `server/src/modules/attendance/attendance.routes.ts`, reporting/search controllers; `server/src/modules/attention/attention.routes.ts` and controllers | History, summaries, searches and queues are reads. Check-in and follow-up creation are blocked. |
| `server/src/modules/reports/` route/controller files | Reports use find/aggregate reads without `$out`/`$merge`, data rewrites or snapshot backfills. |
| `server/src/modules/financial/financial.routes.ts`, `financial.service.ts` | Expense/history reads are immutable. The day preview uses a read-only snapshot transaction without `lockOpenFinancialDay`; it does not create a financial day or closing. Expense creation, closing and unsupported edit/delete methods are blocked. |
| `server/src/modules/retail/retail.routes.ts`, `retail.service.ts`; `server/src/modules/equipment/` routes/services/alerts | Inventory, dashboards, sale/receipt, stock movement, equipment and maintenance histories are reads. Checkout, stock, product, asset, fault, work-order and expense-link mutations are blocked. |
| `server/src/modules/notifications/notification.routes.ts`, `notification.service.ts`, `notification.scheduler-status.ts` | Overview, consent and scheduler status do not run simulations or write logs. Consent writes/manual simulations are blocked. Keep the process scheduler disabled for the published demo. |
| `server/src/modules/staff/staff.routes.ts`, `staff.service.ts` | Directory, catalogue and audit reads do not create success audit records. Account/profile/permission/status/password mutations are blocked. |

No existing side-effecting business GET was found. Future routes must be audited before adding them to the allowlist. Database scripts, server initialization and the scheduler are not public viewer operations; demo viewers cannot invoke them through APIs.

## Initial public-demo database verification

- Connected identity verified as **`warrior_fitness_demo`** before any authorized identity write. Used only the existing ignored `.env.demo.local`; the normal `.env` was unchanged.
- One dedicated viewer was inserted. A real repeat provisioning run created zero additional identities and verified existing staff/password documents and all existing non-staff collection counts were unchanged.
- **30 live API smoke checks passed** against an ephemeral local instance of the real application using the same verified database. Two independently issued demo sessions read the existing **60 members**, membership and collection reports, attendance, retail dashboard, equipment, expenses, day preview and automation status. Ten business mutation categories returned 403. Logout invalidated one visitor's old cookie while the second remained signed in; both test sessions were then signed out.
- Before/after fingerprints confirmed existing staff documents (including password hashes) and financial documents unchanged; existing collection counts were unchanged. The normal gym database was never accessed. No seeding, reset, financial posting, closing, reminder simulation or existing-account edit was performed.

## Files changed

| Files | Purpose |
| --- | --- |
| `server/src/config/env.ts`; `server/src/modules/auth/demo-access.ts` | Validated flag, actual-database checks and reviewed GET/HEAD policy |
| `server/src/modules/auth/demo-login.service.ts`, `demo-session.model.ts` | Collision-safe identity provisioning and individual eight-hour session records/digests/TTL |
| `server/src/modules/auth/staff.model.ts`, `token.ts`; `server/src/types/express.d.ts` | Server-owned viewer marker, public readOnly flag and signed demo-session discriminator |
| `server/src/modules/auth/auth.routes.ts`, `server/src/middlewares/auth.middleware.ts` | Narrow rate-limited demo endpoint; authoritative request guard; independent logout; no-store reads |
| `server/src/modules/auth/staff-security.service.ts`, `server/src/modules/staff/staff.service.ts` | Protect dedicated identity from security/profile/password mutations while preserving normal compare-and-increment updates |
| `server/src/scripts/demo/demo.config.ts`, `server/package.json` | Preserve the optional seeder configuration; remove special demo launch/provision commands; no dependency changes |
| `server/src/server.ts`, `server/src/config/db.ts`, `client/vite.config.ts` | Normal `.env` startup, sanitized port errors, verified database logging and stable frontend port/proxy |
| `server/src/scripts/runDemoServer.ts` | Removed obsolete separate launcher; no replacement launcher is required |
| `client/src/api/auth.api.ts`, `client/src/auth/auth-context.ts`, `AuthProvider.tsx` | Same Axios/cookie/provider flow for one-click login and restoration |
| `client/src/api/api.ts` | Leaves `/me` 401 handling to revision-checked restoration, preventing a stale anonymous refresh from cancelling a newer successful login; other protected 401 handling is unchanged |
| `client/src/pages/LoginPage.tsx`, `client/src/components/AppLayout.tsx` | Secondary demo button, loading/retry feedback and discreet read-only indicator |
| `client/src/auth/permissions.ts`, `client/src/components/ProtectedRoute.tsx`, `client/src/App.tsx` | Deny demo write actions and mutation-only routes while retaining read access |
| `client/src/pages/ExpenseManagementPage.tsx`, `DailyCashClosingPage.tsx`, `StaffManagementPage.tsx`, `NotificationsPage.tsx`, `MemberProfilePage.tsx`, `PlansPage.tsx`, `RetailProductsPage.tsx`, `EquipmentPage.tsx`, `EquipmentDetailPage.tsx` | Hide/disable corresponding mutation controls without changing services/calculations/read filters |
| `client/src/components/notifications/ConsentPanel.tsx`, `client/src/components/equipment/EquipmentUI.tsx` | Read-only consent and maintenance forms without misleading saving feedback |
| `server/tests/public-demo.test.ts`, `session-security.test.ts`, `staff.management.test.ts` | Endpoint/database/session/write-policy tests; existing assertions updated only for added protected-identity filter |
| `client/tests/public-demo.test.tsx`, `dashboard.test.tsx`, `financial.test.tsx`, `notifications.test.tsx`, `helpers/auth.tsx` | Login/provider/navigation/action/read-only dashboard/finance/consent coverage and context fixture |
| `README.md`, `docs/deployment.md`, `render.yaml`, this tracker | Single-database configuration, safe default-disabled Blueprint, local commands, audit and limitations |

`client/src/components/dashboard/DashboardWidgets.tsx` and `client/src/pages/DashboardPage.tsx` are the approved compact KPI changes, preserved without further edits and included in this release. Both private environment files remain ignored/untracked. Ordinary startup reads only the normal `.env`; the seeder's `.env.demo.local` is optional-tool configuration.

## Verification and remaining review

- Backend `npm test`: **815 passed**, 29 files. Frontend `npm test -- --maxWorkers=2`: **396 passed**, 20 files. **1,211 automated tests passed** in total, preserving the original 1,098 cases and adding 113. Existing security-write expectations additionally assert the protected-viewer exclusion; version comparisons, atomic increments and other expectations are retained.
- Both `npm run build` commands and frontend `npm run lint` passed. Tracked/new-file whitespace checks, private-value scans and ignored-environment checks passed. No credentials or `.env` files are staged; nothing is staged.
- **9/9 mocked Chrome scenarios passed**: desktop/mobile Login, one-click login, reload, real API-shaped dashboard values, Front Desk reads, finance/reconciliation with disabled writes, equipment/retail histories, Reports/Attendance, mutation-route redirects, logout, unchanged normal Admin actions, and unavailable/loading/retry feedback. No external/backend/database traffic occurred in these browser checks. Screenshots and a sanitized report are local temporary artifacts outside Git.
- Browser verification identified an older anonymous `/me` refresh racing a fresh login. The response interceptor now delegates those 401s to the existing revision-aware auth provider. A focused regression test verifies the fresh demo session survives; existing expired/revoked protected-session and focus-refresh tests continue passing.
- Initial KPI preservation and normal `.env` fingerprints matched. In the final simplification, only the explicitly approved normal `.env` database target/public-demo/scheduler settings changed privately; KPI files and `main` stayed unchanged. The initial 30 API checks and subsequent nine real Chrome scenarios are distinct from mocked transaction/concurrency coverage.

Automated suites use explicit database/API mocks and isolation guards; the separately described live smoke checks are not part of Vitest and do not claim transaction failure/concurrency verification.

Local commands and deployment environment settings: [deployment.md](../deployment.md#one-click-public-demo-login). Local Admin password login has now been verified live without printing credentials or changing the account. Hosted HTTPS/cookies and provider deployment remain future deployment checks. Existing financial production-use and physical scanner/printer limitations are unchanged. Final commit/push is authorized after successful verification; do not deploy, merge, reset data or begin another feature.
