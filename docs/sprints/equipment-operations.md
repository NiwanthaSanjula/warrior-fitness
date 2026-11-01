# Equipment & Maintenance Operations

Status: **COMPLETED FOR PORTFOLIO/DEMO — approved by the Project Manager.**

Final approval authorizes committing, pushing and merging this feature into `develop`, while preserving the feature branch and leaving `main` unchanged. This portfolio/demo approval does not establish production readiness: live MongoDB verification and physical QR scanning/printing checks remain outstanding, and the existing Vite bundle-size warning remains documented below.

## Scope and Git

- Started with a clean `develop`, fetched origin, updated with `git pull --ff-only origin develop` and created `feature/equipment-operations` from `b140b553ca5bba9192be2d037df4d5dcd0c18df4` (Smart Notifications merge).
- This task adds equipment inventory, authenticated QR labels, breakdown reporting, preventive schedules, maintenance work orders, downtime history and read-only Finance expense references.
- Existing financial calculations, membership rules, authentication/session revocation, notification delivery and completed sprint history are preserved. No live database, financial records or environment configuration was accessed or modified. Final release operations are limited to the approved Equipment Operations commit, feature push and merge into `develop`.

## Implemented workflows

- `/equipment`: searchable, filtered, paginated directory with global status statistics, Admin registration and profile links. Asset IDs are normalized to uppercase, unique, permanent and backed by a unique index. Inventory covers category, brand/model/serial, section, purchase date/whole-LKR price, warranty and preventive interval/next date.
- `/equipment/:id`: equipment profile and separate paginated breakdown, maintenance and downtime histories. Admins also see activity history, financial metadata, service assignment details and QR printing. Each resource distinguishes loading, failure, retry and genuine empty results.
- `/equipment/maintenance`: Admin command center with overdue service, services due today, active work orders, unresolved faults and unavailable assets. The service queue includes overdue assets and those due within seven Colombo calendar days; retired assets are excluded. Work and fault inboxes have separate filters, pagination and error handling.
- Receptionists with both `equipment.read` and `equipment.report` can report faults with severity and description. Reporter identity/time come from the authenticated server context. UUID request keys allow exact fault retries after lost responses and reject changed content. A fault does not automatically change equipment availability; Admin triage is explicit.
- Admins acknowledge, resolve or dismiss faults with an explanation, mark assets unavailable, create related repair work or independent preventive work, assign a technician/provider, start, complete or cancel work, and record repair notes and service dates.
- The sidebar has one accessible Equipment disclosure containing Equipment Inventory and Admin-only Maintenance. Desktop/mobile navigation preserves the existing theme and Finance disclosure behavior.

## Lifecycle and integrity

- Availability: `OPERATIONAL`, `UNDER_MAINTENANCE`, `OUT_OF_SERVICE`, `RETIRED`. Identical status transitions and reviving retired assets are rejected. Retirement requires completing/cancelling active work. Returning to service requires no in-progress work or unresolved critical fault.
- Fault lifecycle: `OPEN → ACKNOWLEDGED → RESOLVED/DISMISSED`; an open fault can also close directly with an explanation. Terminal reports cannot be rewritten. A linked fault cannot close while its work remains open/in progress. Only unresolved faults on the same asset may receive work, and each fault has at most one active work order.
- Work lifecycle: `OPEN → IN_PROGRESS → COMPLETED`; open/in-progress work can instead be cancelled with a reason. Starting requires a technician or provider, marks equipment under maintenance and opens downtime. Completion preserves notes and resolves its linked fault. Returning to operational status is an explicit completion choice and still checks other active work/critical faults. Cancellation leaves availability unchanged for Admin review. Completed/cancelled assignments and lifecycle records cannot be edited.
- Preventive schedules use an optional day interval and next service date. Completing preventive work advances the date from Colombo today; repairs preserve the preventive date unless explicitly overridden. Recurring schedules cannot lose their next date. No background maintenance scheduler, automatic work creation or messaging is included.
- A single equipment version compare-and-increment serializes each asset's mutations. Stale edits return HTTP 409 and require refresh. Related equipment, incident, work, downtime and activity changes use one MongoDB transaction with snapshot reads, majority writes and sequential operations on the same session.
- Unavailability opens one downtime span, moving between unavailable statuses preserves it, and returning to service/retirement closes it. A partial unique index prevents multiple open spans per asset. Separate indexed collections retain full paginated history rather than growing embedded arrays.
- Activity events and expense references are append-only through their models. There are no destructive inventory/history APIs. Registration/work creation are not idempotent: after an uncertain response, inspect inventory/history before retrying. Fault reporting alone has an explicit replay key.

## Permissions and QR security

- Backend catalogue: assignable `equipment.read` and `equipment.report`; Admin-only `equipment.manage`. Admin full access remains role-based. Missing legacy overrides gain the new Receptionist role defaults; stored custom permission lists remain exact, and explicit `[]` remains deny-all. The existing Staff Management catalogue exposes the two assignable checkboxes; its security service and session-version behavior are unchanged.
- All endpoints use the existing authentication, effective-permission and (for administration) Admin-role guards. Services repeat the authorization boundary. A Receptionist cannot gain maintenance/Finance access by forging an Admin permission key.
- Receptionist DTOs exclude purchase price, technician/provider contact, estimates, instructions, repair/review notes, expense links and Admin activity records. Work-history reads do not query Finance at all for Receptionists.
- `qrcode` generates PNG labels locally in the browser, loaded as a separate chunk; `@types/qrcode` supplies development types. No remote QR generation service is used. The QR encodes only the current HTTP(S) origin plus `/equipment/<opaque ID>`, never a credential, token, price or access grant.
- The profile still requires authenticated equipment permission. The login guard and login page validate and preserve equipment destinations, including the authenticated-public-route race. Ordinary login defaults remain `/dashboard`. A scanned link cannot redirect to an external URL or bypass an Admin/permission guard.
- Admin QR printing uses an isolated print portal and overrides the existing global receipt-print exclusion only for the mounted equipment label. Receipt source code is unchanged.

## Finance integration

- Only Admins may append references to completed work. The server verifies the existing Expense record and accepts only `EQUIPMENT` or `MAINTENANCE` categories.
- A unique expense-reference index allows one expense to belong to one work order. Linking an already-linked expense to that same work is a no-op; linking it to another work is rejected. This deliberately does not support splitting a single ledger expense across several repairs.
- Estimates are labelled planning values. Actual costs appear as individual, verified recorded-expense references; no new financial totals are calculated. Purchase price is inventory metadata, not an automatically recorded expense.
- The UI searches the existing `/api/expenses` service when an Admin opens the picker and submits a search. It shows the first 20 results; narrow the date range/search to find older records. Linking never creates or updates expenses, payments or financial-day markers. Existing closed-period rules and the immutable expense ledger remain untouched.

## API surface

All routes are under `/api/equipment` and require staff authentication. Read endpoints require `equipment.read`; fault reporting requires both read and report; administration requires the Admin role and `equipment.manage`. Expense linking also checks `expenses.manage`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/` | Read filtered inventory / register an asset (POST Admin-only) |
| GET / PUT | `/:id` | Read profile / update inventory and schedule (PUT Admin-only) |
| GET | `/:id/history?kind=incidents\|work-orders\|downtime\|events` | Paginated history; events Admin-only |
| GET | `/maintenance` | Admin service queue and statistics |
| GET | `/work-orders` | Admin work-order inbox |
| GET | `/incidents` | Admin fault inbox |
| PATCH | `/:id/status` | Change availability with reason |
| POST | `/:id/incidents` | Report a fault with UUID replay key |
| PATCH | `/:id/incidents/:incidentId` | Review fault with explanation |
| POST | `/:id/work-orders` | Create preventive/repair work |
| PATCH | `/:id/work-orders/:workId/assignment` | Update an active assignment/estimate |
| POST | `/:id/work-orders/:workId/transition` | Start, complete or cancel work |
| POST | `/:id/work-orders/:workId/expenses` | Append an existing Finance expense reference |

All asset mutations except registration require the current equipment `version`. All financial inputs are bounded whole LKR, request objects are strict, searches are escaped literals and pagination is bounded.

## Changed-file map

- `server/src/modules/equipment/equipment.constants.ts`, `equipment.validation.ts`: statuses, categories, strict inputs and Colombo-date validation.
- `server/src/modules/equipment/equipment.model.ts`: six indexed equipment/history/reference models and append-only protections.
- `server/src/modules/equipment/equipment.service.ts`: authorized DTOs, redaction, filtered reads, full history and maintenance statistics.
- `server/src/modules/equipment/equipment.mutations.ts`: transactional workflows, version locking, downtime, history and verified expense linking.
- `server/src/modules/equipment/equipment.routes.ts`, `server/src/app.ts`, `server/src/server.ts`: guarded APIs, router mount and startup index initialization.
- `server/src/modules/auth/permissions.ts`, `server/src/modules/staff/staff-permissions.ts`, `client/src/auth/permissions.ts`: central permission keys, defaults and Staff Management labels.
- `client/src/types/equipment.ts`, `client/src/api/equipment.api.ts`, `client/src/validations/equipment.schema.ts`, `client/src/utils/equipment.ts`: typed API contracts, shared Axios access, form validation, safe QR URLs and login destinations.
- `client/src/components/equipment/EquipmentUI.tsx`, `EquipmentForms.tsx`, `MaintenanceCards.tsx`, `EquipmentQr.tsx`: shared form states, inventory/fault/availability/work forms, lifecycle/expense controls and local printable QR labels.
- `client/src/pages/EquipmentPage.tsx`, `EquipmentDetailPage.tsx`, `EquipmentMaintenancePage.tsx`: inventory, profile and maintenance experience.
- `client/src/App.tsx`, `client/src/components/AppLayout.tsx`: protected routes and grouped navigation.
- `client/src/components/ProtectedRoute.tsx`, `client/src/pages/LoginPage.tsx`: safe QR login continuation, with all existing authorization retained.
- `client/package.json`, `client/package-lock.json`: QR encoder/runtime dependencies and types only.
- `server/tests/equipment.service.test.ts`, `server/tests/equipment.routes.test.ts`: validation, history/lifecycle, permissions, concurrency-control wiring and read-only expense-reference tests.
- `client/tests/fixtures/equipment.ts`, `client/tests/equipment.test.tsx`, `client/tests/equipment.api.test.ts`: fictional fixtures, rendering/forms/permission/QR-login coverage and versioned API adapter contracts.
- This tracker records implementation and verification without overwriting previous sprint history.

## Verification and limitations

- Backend: **503 tests passed** (400 existing + 103 equipment); TypeScript build passed.
- Frontend: **198 tests passed** (167 existing + 31 equipment); TypeScript/Vite build and ESLint passed. Combined: **701 passing tests**. Existing test/database/network isolation guards remain enabled.
- `git diff --check` and new-file whitespace checks passed. The runtime dependency audit reports zero production dependency advisories. The existing large-main-chunk Vite warning and development-tool dependency advisories are not resolved by this feature.
- Built-frontend Chrome checks: **16/16 passed** with in-memory, fictional API responses, no backend/database, no unexpected external requests or runtime errors. Scenarios cover desktop search/loading/error/retry/refresh, registration, profile editing, local QR generation and isolated print-to-PDF, Receptionist reporting/redaction, Admin review/work assignment/start/completion, existing expense linking, downtime/activity/history retry, maintenance queues, 390px/320px layouts, keyboard disclosure/mobile navigation, restricted permissions and QR login continuation.
- Browser review found and fixed the receipt-print stylesheet hiding the QR portal, and the public-login guard racing the equipment return destination. The real AuthProvider login path now has an automated regression test. Mock browser responses exercise UI behavior, not real server persistence.
- **Outstanding:** real MongoDB transaction commit/rollback, index behavior and parallel-writer correctness are unverified. Unit tests assert same-session writes, compare-and-increment filters, unique-index definitions, invalid transition rejection and failure propagation using explicit mocks; they do not establish production concurrency guarantees. No Atlas or other live database testing was attempted.
- Requires transaction-capable MongoDB, consistent with existing application requirements. Startup initializes only the new model indexes during normal deployment; it was not executed here. No data migration/backfill is needed for empty inventory or legacy staff permissions. Existing signed-in clients should refresh to obtain the updated permission catalogue.
- Physical QR scanning and printer output remain manual checks. Labels use the current app origin, so use the deployed HTTPS hostname reachable from staff devices; localhost labels cannot be opened on another device. Changing the public app origin requires reprinting labels.
- This review does not approve production operation. No image uploads, spare-parts inventory, bulk import/labels, supplier portal, equipment deletion, scheduled maintenance messaging or new finance calculations are included.

## Manual review checklist

1. Admin: open Equipment Inventory, register a fictional asset with a unique ID, dates/whole-LKR price and preventive schedule; search/filter, open the profile and correct metadata. Verify duplicate IDs and invalid prices/dates are rejected.
2. Print the QR label; scan it on a staff phone using the deployed app hostname. Verify guest login returns to the equipment, an unauthorized Receptionist remains blocked and the printed page contains only the label.
3. Receptionist: confirm only Inventory appears, report a fault, then test read-only and deny-all permissions. Confirm no price, service contact, estimate, expense data or Admin maintenance actions are visible.
4. Admin: review the fault, mark equipment unavailable, create/assign/start related work, inspect downtime, complete with repair notes and explicitly return to service. Verify cancellation does not silently restore availability, completed records cannot be edited and a critical unresolved fault blocks return.
5. On an isolated test deployment only, link an existing fictional MAINTENANCE/EQUIPMENT expense to completed work. Verify estimates remain separate, the original ledger/closed date is unchanged, the same expense cannot be assigned to another work order and ineligible categories are rejected. Do not edit real financial records.
6. Review due/overdue queues, filters, histories, retry/refresh and mobile drawer/keyboard behavior. Real transaction/index/concurrency tests require a separately authorized isolated database task.

Project Manager approval for portfolio/demo release has been received. Production use and outstanding live-database/device verification require separate review and authorization; no further feature work is included in this release task.
