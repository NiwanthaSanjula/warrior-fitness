# Admin Staff Management

Status: **APPROVED — COMPLETED for portfolio/demo release.**

Final PM approval authorizes the Staff Management commit, push and merge into `develop`. Real database verification remains outstanding; this approval does not establish production readiness.

## Scope and branch

- Authorized portfolio-release workflow: Admin-only staff directory, Receptionist creation, profile edits, activation, individual operational permissions/default restoration, password resets and focused staff audit history.
- Started from a clean tree; fetched origin, safely updated `develop` with `git pull --ff-only origin develop`, verified Finance merge `748a5ed746b83194c28a67da439bc245432032f1`, then created `feature/staff-management` from that commit. `main` was not modified.
- This authorization covers staff-specific audit events alongside staff administration. It does not complete the broader S8-04 Audit Logging Foundation or change previously approved Sprint 8/Financial Operations history.
- No role promotion/demotion, Admin creation, staff deletion, email/password-delivery service, general-purpose audit module or unrelated feature.

## Working flows

- `/staff` and its navigation entry require Admin access. The directory supports bounded pagination, name/email search, role/status filters and separate detail/audit loading, empty, error, retry and refresh states.
- Creation reuses `POST /api/staff`, always creates an active Receptionist with role defaults, and validates name, normalized email and a password of at least 12 characters/at most 72 UTF-8 bytes. The Admin shares the initial/reset password securely; the application never returns it or a hash.
- Profile edits, grouped permission choices, default restoration, status changes and password resets require confirmation. Explicit `[]` means no business operations; `null` removes the override and restores server-owned role defaults. Only Receptionist permissions from the existing catalogue are assignable.
- Profile changes (including name-only edits), passwords, permissions and status changes use the existing `staff-security.service.ts` conditional version increment. Existing sessions fail their next authenticated request. Reactivation increments the version again and cannot revive revoked sessions. Editing the current Admin redirects through the existing logout/login flow.
- Every Admin's role, activation and full access remain protected: these routes reject Admin status/permission edits and expose no role-change operation. Self-deactivation is also rejected explicitly. This prevents disabling or demoting the last active Admin without a race-prone Admin-count check.
- Each mutation reads the expected account version and rejects stale edits with HTTP 409. Unchanged profile/status/permission requests add no audit event or version increment. Duplicate email writes are rejected by the existing unique index. Creation is not idempotent; after an uncertain response, review the directory/history before repeating it.

## Persistence and audit integrity

- Staff changes and their audit event share one MongoDB transaction, using snapshot reads, majority writes and the same session. Audit failure aborts the operation instead of reporting success. MongoDB replica-set/transaction support is required, consistent with the existing Finance deployment requirement.
- Audit fields are an explicit allowlist: actor ID/name, action, target ID/name and creation timestamp. Events cover creation, profile edits, permission changes/default restoration, activation/deactivation and password reset. No email snapshots, passwords, hashes, JWTs, cookies or request bodies are stored.
- Audit reads are Admin-only, paginated and optionally target-filtered; history is append-only through the model and has no mutation API. Startup initializes the staff/audit indexes before accepting requests. Nothing was executed against a database during this task.
- Managed staff responses add version and permission-mode metadata for this Admin workflow; normal authentication DTOs and role/permission meanings remain unchanged. Existing staff need no data migration.

## API surface

All endpoints below require the existing authenticated Admin and `staff.manage` guards.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/staff` | Search/filter/paginate the existing staff directory |
| POST | `/api/staff` | Existing create-Receptionist operation, now audited |
| GET | `/api/staff/permissions` | Assignable grouped catalogue and default permissions |
| GET | `/api/staff/audit` | Paginated staff history, optional `targetId` |
| GET | `/api/staff/:id` | Latest safe Admin detail/version |
| PATCH | `/api/staff/:id/profile` | Name/email edit with `expectedVersion` |
| PATCH | `/api/staff/:id/permissions` | Receptionist override or default restoration |
| PATCH | `/api/staff/:id/status` | Activate/deactivate a Receptionist |
| POST | `/api/staff/:id/reset-password` | Admin-initiated password reset |

## File map

- `server/src/modules/staff/staff.routes.ts`: authenticated Admin endpoints and input parsing.
- `staff.validation.ts`, `staff-permissions.ts`, `staff.service.ts`, `staff-audit.model.ts` in that directory: strict validation, grouped catalogue, transactional workflow, safe directory DTOs and immutable audit model.
- `server/src/modules/auth/staff-security.service.ts`: optional transaction session and profile fields at the existing version-increment boundary.
- `server/src/server.ts`: initialize staff/audit models before listening.
- `client/src/pages/StaffManagementPage.tsx`: directory, detail selection, filters and audit history.
- `client/src/components/staff/StaffForms.tsx`, `StaffConfirmDialog.tsx`: validated creation/profile forms, permissions and accessible security confirmations.
- `client/src/api/staff.api.ts`, `client/src/types/staff.ts`, `client/src/validations/staff.schema.ts`: typed Axios services, safe DTOs and client validation.
- `client/src/App.tsx`, `client/src/components/AppLayout.tsx`: Admin-only route/navigation.
- `server/tests/staff.management.test.ts`, `staff.routes.test.ts`, `roles.routes.test.ts`, `session-security.test.ts`: service, validation, audit and API-access coverage; existing list test adapted for pagination and profile-change session rejection added.
- `client/tests/staff.test.tsx`, `client/tests/fixtures/staff.ts`: real UI/router/dialog tests with fictional API-boundary fixtures.

## Verification

- Backend `npm test`: **295 passed**, including all prior cases plus staff service/route checks and profile-change session rejection.
- Frontend `npm test`: **140 passed**, including 29 new staff UI/access tests. **435 total**; zero failed/skipped. The existing 337-test baseline remains passing.
- `npm run build` in both packages: **PASS**. The existing non-blocking frontend chunk-size warning remains (approximately 714 kB main JavaScript bundle).
- Frontend `npm run lint`: **PASS**.
- `git diff --check`: **PASS**; final changed-file/scope review includes untracked files. No manifest, lockfile, credentials or environment configuration changed.

Database/network isolation guards remain enabled; no test connects to Atlas or modifies application records. Transaction tests mock persistence and verify session wiring, conditional writes, error propagation and audit payloads; they do **not** establish real database rollback or concurrency behavior. Real Chrome walkthroughs with mocked API responses passed as recorded below; live database acceptance remains pending.

## Focused final review — 2026-10-31 (Asia/Colombo)

- Security review and backend tests confirm all nine staff endpoints require authenticated Admin access. Receptionists, including ones with a forged `staff.manage` grant, receive HTTP 403 before service execution. Unauthenticated requests receive HTTP 401.
- Strict create/edit schemas reject role/hash injection, unknown or duplicate permissions, malformed IDs/versions and invalid profiles/passwords. Creation hardcodes the Receptionist role; no role-change endpoint exists. Admin status/permission edits and self-deactivation are rejected, preserving the last active Admin. Changes use the existing conditional session-version increment and transactional audit boundary.
- Found and fixed one frontend error case in `client/src/components/staff/StaffForms.tsx`: after a successful current-Admin edit/reset, failed logout previously navigated with stale local auth state and could return to the dashboard. The fallback now performs a full `/login` navigation, restoring authentication from the already-revoked session. Added a permanent regression case in `client/tests/staff.test.tsx`; real Chrome also verifies the fallback.
- Re-ran backend/frontend tests (295 + 140 = **435 passed**), both builds and frontend ESLint. Zero failed/skipped tests; the existing non-blocking Vite bundle-size warning remains. Final diff checks include new files.
- **15/15 browser scenarios passed in real headless Chrome**, using the built frontend, real routing/Axios/forms and memory-only fictional API responses. Desktop: 1440 × 1000; mobile: 390 × 844. Reviewed screenshots and checked horizontal overflow, mobile navigation, dialog size, Escape cancellation and focus restoration.
- Browser coverage: directory/active navigation; creation and password confirmation; search and empty results; profile confirmation/cancellation; grouped permissions/deny-all/default restoration; activation/deactivation; password reset and audit redaction; stale-write errors without false audit success; protected Admin controls; mobile layout/dialogs; loading/independent errors/retry/refresh; Receptionist redirect with no staff/Reports requests; unauthenticated redirect; normal self-reset logout; self-reset with failed logout.
- Browser runtime exceptions: **0**. All API calls were intercepted; the local static server rejects any unintercepted API request and never forwards to a backend. No real database, Atlas configuration or financial data was used. These results verify UI behavior against simulated contracts, not database persistence, rollback, concurrency or actual login with a reset password.
- Browser report/screenshots are temporary local review artifacts outside Git at `C:/Users/niwan/AppData/Local/Temp/warrior-staff-browser-05bHbS/`. The temporary harness uses installed Chrome and Node's built-in CDP/WebSocket support; no dependencies were installed.
- **APPROVED for portfolio/demo release** following final PM approval. Live persistence/transaction verification remains outstanding. The approved release process commits the 22 Staff Management files, pushes `feature/staff-management`, and merges into `develop` while preserving the feature branch and leaving `main` unchanged.

## Live database acceptance — pending

The equivalent UI walkthroughs passed with mocked APIs. The following end-to-end checks still require task-approved fictional accounts on an authorized development database; no financial records are involved.

1. Sign in as Admin, open Staff Management on desktop and mobile, search/filter/page the directory, select an account and inspect global/selected audit history.
2. Create a disposable Receptionist, sign in with its initial password, then edit its name/email and confirm the prior session is rejected.
3. Remove an operational permission, confirm its corresponding route/action is denied after re-login, try an explicitly empty selection, then restore defaults and verify access returns.
4. Deactivate/reactivate the Receptionist and reset its password; verify disabled login, revocation of older cookies after reactivation, rejection of the old password and successful login with the reset password.
5. Check cancelled dialogs do not change data; verify keyboard focus/Escape, duplicate-email errors and stale-edit refresh behavior. Confirm a success event appears only for applied changes, with actor/target/time and no secrets.
6. Confirm Receptionists cannot see the link or open `/staff`; Admin status/role/permission controls are unavailable; a current-Admin password/profile edit requires re-login.

## Release approval and remaining boundary

The PM explicitly approved committing with `feat(staff): implement admin staff management and audit history`, pushing the feature branch, merging it into `develop` and pushing `origin/develop` after passing tests/builds/lint. Preserve the feature branch. Do not modify `main`, open a PR, perform database operations or Atlas troubleshooting, change financial logic, install dependencies or start another feature. Stop after the approved release operations.
