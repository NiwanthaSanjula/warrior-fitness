# Sprint 8 - Admin Operations Foundation

## Sprint goal and project context

Extend Warrior Fitness into an Admin-focused Gym Operations Platform while preserving completed functionality.

The MERN + TypeScript repository contains a React client, modular Express API, and MongoDB/Mongoose persistence. Sprints 1-7 delivered staff authentication, members, membership plans and renewals, invoices/payments/receipts, attendance, Attention Center/follow-ups, and reports/analytics.

The existing backend will eventually support both web and member mobile clients through authenticated APIs. Members are registered by authorized staff; public member self-registration is prohibited.

## Approved scope

- S8-00: read-only repository audit, reviewed and approved.
- S8-01 only: establish root `AGENTS.md`, create this sprint tracker, and align Reports frontend authorization with the existing Admin-only backend.
- The project manager has officially approved S8-01, including `AGENTS.md`, the Reports access fix, and all five user-confirmed manual browser acceptance checks.
- Move the single `/reports` route into the existing `AdminOnlyRoute` group and set the Reports navigation item's existing `adminOnly` flag.
- Inspect backend reporting protection without changing APIs or authorization rules.
- Run frontend build/lint, existing relevant tests if available, and Git diff/status checks.
- S8-01 was committed and pushed under its final PM authorization with commit message `feat(admin): establish sprint governance and secure reports access`. That authorization does not extend to S8-02 changes.
- S8-02 is now explicitly authorized for implementation: add development-only Vitest/Supertest/React Testing Library tooling, isolated tests, scripts/lockfiles, and relevant documentation for the existing authentication/authorization baseline. Do not change production authentication behavior or implement permissions/revocation.
- The project manager has officially approved S8-02 and authorized its final verification, commit with message `test: add authentication and authorization test foundation`, and push to `origin feature/admin-operations-foundation`. Starting S8-03, merging, or opening a PR remains unauthorized.

The task list below reflects the project-manager-approved Sprint 8 roadmap. S8-00 through S8-02 are approved; starting S8-03 through S8-07 requires separate explicit task authorization.

## Out of scope

- Expenses, equipment, payroll, workout programming, and the member mobile app are explicitly deferred to later sprints.
- Daily closing, trainer management, approval workflows, and additional operational modules require separate sprint approval.
- S8-01 does not implement staff lifecycle management, granular permissions, session revocation, audit logging, or dashboard data integration.
- No dependency installation, API contract changes, database changes, unrelated refactors, sidebar redesign, merges, rebases, PR creation, or pushes to `develop`/`main` are authorized for S8-01. Commit/push authorization is limited to the four approved files on the feature branch.
- S8-02 permits development-only test dependencies and the final approved commit/push, but excludes production dependency additions, production data access, real database connections/writes, authentication behavior changes, permissions, session revocation, staff lifecycle changes, audit logging, deployment changes, PRs, merges, rebases, and pushes to `develop`/`main`.

## Task tracking and acceptance criteria

| Task | Title | Status | Dependencies | Acceptance criteria |
| --- | --- | --- | --- | --- |
| S8-00 | Repository Audit | APPROVED | Completed Sprints 1-7 | Actual architecture, authorization gaps, reuse opportunities, risks, and roadmap reviewed and approved by the project manager. |
| S8-01 | Codex Instructions & Reports Access Fix | APPROVED | S8-00 approval | AGENTS.md content approved; tracker reflects the approved roadmap; Reports route and sidebar restricted to Admin; existing backend and other routes preserved; required checks reported; all five manual browser acceptance checks passed as confirmed by the user; PM completion approval received. |
| S8-02 | Authentication & Authorization Test Foundation | APPROVED | S8-01 approved; explicit implementation and completion approval received | 72 automated tests passed: 50 backend and 22 frontend. Both suites passed repeated runs; backend/frontend builds and frontend ESLint passed; database/network isolation verified; production logic unchanged. PM completion approval received. |
| S8-03 | Granular Permissions & Session Revocation | NOT STARTED | S8-02 passing test foundation and completion approval; explicit task authorization | PM-approved permission defaults and revocation rules are enforced consistently by backend and frontend; existing role access is preserved unless explicitly changed; revoked sessions remain invalid after reactivation; extend S8-02 tests and keep the baseline passing. |
| S8-04 | Audit Logging Foundation | NOT STARTED | S8-03 completion approval; S8-02 test foundation; explicit task authorization | Approved audit events identify actor/action/target/outcome without secrets; authorized reads are bounded; covered mutations preserve transaction/idempotency guarantees; automated authorization, redaction, and transaction checks pass. |
| S8-05 | Staff Management Backend & Frontend | NOT STARTED | S8-03 and S8-04 completion approval; S8-02 test foundation; explicit task authorization | Approved staff API operations and UI work together with matching authorization, validation/loading/error states, audit events, session revocation, historical staff references, and Admin-lockout safeguards; relevant automated tests pass. |
| S8-06 | Admin Command Center | NOT STARTED | S8-03 through S8-05 completion approval; S8-02 test foundation; explicit task authorization | Approved metrics and management links reuse existing APIs with correct Colombo date semantics, permission-limited views, and distinct empty/error states; relevant automated tests pass. |
| S8-07 | Regression Testing & Merge | NOT STARTED | S8-01 through S8-06 completion approval; explicit task authorization | Required builds/lint and automated authentication, permission, session, audit, staff, dashboard, and existing business-flow regression checks pass; manual results and unresolved issues receive PM review; merge occurs only after explicit PM merge authorization. |

## Technical dependencies and compatibility

- Reuse `client/src/components/ProtectedRoute.tsx`, the existing route nesting in `client/src/App.tsx`, and `adminOnly` filtering in `client/src/components/AppLayout.tsx`.
- `server/src/modules/reports/reports.routes.ts` already applies `requireAuth` and `requireRole("ADMIN")` before all six report endpoints.
- Preserve inclusive membership starts, exclusive ends, `Asia/Colombo` gym dates, historical snapshots, and whole-number LKR.
- Preserve existing transaction/idempotency behavior and historical records; later transaction integration requires an approved transaction-capable isolated test database.
- S8-01 installed no test tooling. S8-02 adds Vitest to both packages, Supertest to the backend, and React Testing Library/jsdom to the frontend; `npm test` type-checks and runs once, and `npm run test:watch` starts development watch mode. See `docs/testing/authentication-authorization.md`.
- S8-02 must introduce and validate the automated authentication/authorization test foundation before S8-03 changes authentication, permissions, or session behavior. S8-03 through S8-07 must extend and preserve that baseline.
- S8-04 audit logging builds on S8-03 permissions/session controls; S8-05 staff backend/frontend depends on both; S8-06 integrates approved Admin views; S8-07 verifies the complete sprint before an explicitly authorized merge.

## S8-01 verification and review checklist

- Admin: Reports appears in the sidebar; direct `/reports` access renders existing reports.
- Receptionist: Reports is hidden; direct `/reports` access redirects to `/dashboard`; other operational routes remain accessible.
- Unauthenticated: `/reports` redirects to `/login` through the existing authentication guard.
- Backend: all report endpoints retain Admin-only enforcement; backend source remains unchanged.
- Run `npm run build` and `npm run lint` in `client/`; run existing relevant automated tests only if available.
- Inspect `git diff --check`, `git diff --stat`, and `git status`; include newly created files in the final report.
- Distinguish source inspection/build results from browser scenarios actually exercised; document unperformed manual checks.
- Confirm no dependencies, API contracts, database records, or secrets changed; commit/push only the approved files to the feature branch under final PM authorization; do not merge or open a PR.

### Verification results

- Git preparation: started from clean `develop`; `git fetch origin` succeeded; HEAD and `origin/develop` both resolved to `6fdc694e699e693c2aeb2f9e85dec17644a1021e` with zero commits ahead/behind; created `feature/admin-operations-foundation`.
- `npm run build` in `client/`: PASS (TypeScript and Vite). Vite reported a non-blocking JavaScript chunk-size warning above 500 kB; bundle optimization is outside S8-01.
- `npm run lint` in `client/`: PASS.
- `git diff --check`: PASS after implementation; repeated for final review.
- Source review: `/reports` exists once inside the existing authenticated Admin route group; only Reports gains the sidebar `adminOnly` flag; existing guards, other routes/navigation permissions, and backend report authorization remain unchanged.
- Automated authorization/browser tests: NOT RUN. No relevant existing test suite or frontend test framework was found; none was installed.
- Manual browser acceptance: all five checks below PASSED, as confirmed by the user. These results were user-verified, not browser tests executed by Codex. Backend runtime authorization was inspected by Codex in source, not exercised directly against an API/database.
- Changes are limited to `AGENTS.md`, this tracker, `client/src/App.tsx`, and `client/src/components/AppLayout.tsx`. No database operations, dependency installation, or API contract changes occurred. Final PM authorization permits their commit/push; merging and PR creation remain unauthorized.

| Manual browser acceptance check | Result | Confirmation |
| --- | --- | --- |
| Admin can view and access Reports. | PASSED | Confirmed by the user. |
| Receptionist cannot see Reports in navigation. | PASSED | Confirmed by the user. |
| Receptionist direct `/reports` access redirects to `/dashboard`. | PASSED | Confirmed by the user. |
| Unauthenticated `/reports` access redirects to `/login`. | PASSED | Confirmed by the user. |
| Receptionist retains access to Members, Payments, and Attendance. | PASSED | Confirmed by the user. |

S8-01 is `APPROVED` following official project-manager completion approval and user confirmation of all five manual browser acceptance checks. Its implementation is preserved at commit `91a7a24e49f91fdb1d27b354346de633a835c2cc`. S8-02 is `APPROVED` following official project-manager completion approval; S8-03 through S8-07 remain `NOT STARTED`.

## S8-02 implementation and verification

- Started from a clean `feature/admin-operations-foundation` at the approved S8-01 commit; no branch switch, merge, or rebase.
- Added development-only testing dependencies, package-local configurations/test TypeScript projects, seven test suites, deterministic fictional fixtures, database/network isolation guards, test/watch scripts, and the testing guide.
- Production authentication/authorization and business source files are unchanged. No new permission fields, token versioning, or session revocation are implemented.
- Both complete suites passed on two successful runs: backend 50/50 tests across four suites and frontend 22/22 across three suites, including test type-checking; zero failed/skipped tests. Backend build, frontend TypeScript/Vite build, and frontend ESLint all passed. `git diff --check` passed; final status/stat and source-scope checks were inspected.
- The backend uses real routers/guards/tokens with mocked persistence/password checks; report calculations are mocked. The frontend uses real routing/navigation/provider logic with mocked leaf pages or API boundaries. No real MongoDB or application API is used.
- Known finding: nine moderate client development-tooling npm advisories in the existing ESLint/minimatch tree; production-only client audit and backend installation audit are clean. Existing dependency versions and production dependency declarations are preserved.
- The frontend build retains the existing non-blocking 646 kB JavaScript chunk-size warning. No S8-02 manual browser tests were performed; S8-01's five user-confirmed passes remain preserved.
- S8-02 is `APPROVED`: the project manager reviewed the 72 passing tests, repeated successful runs, builds/lint, isolation checks, and unchanged production logic. Its final commit/push is explicitly authorized after successful re-verification; S8-03 remains unauthorized and `NOT STARTED`.

## Review and approval process

1. The project manager explicitly approves one task and its boundaries.
2. Inspect the repository and complete only that authorized work on the approved branch.
3. Submit all changed files, behavior changes, verification evidence, remaining manual checks, risks, and final Git status for review.
4. Stop after submission. Implementation and passing checks do not constitute PM completion approval.
5. Mark a task complete only after explicit PM approval. Starting the next task, committing, pushing, merging/rebasing, or opening a PR requires separate explicit authorization.
