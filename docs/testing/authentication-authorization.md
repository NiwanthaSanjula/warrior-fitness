# Authentication and authorization tests

## Running the suites

Use the package-local commands from the repository root:

```powershell
cd server
npm test
npm run test:watch
```

```powershell
cd client
npm test
npm run test:watch
```

Each `npm test` type-checks the tests and imported source with the package's TypeScript compiler, then runs Vitest once. Watch mode runs Vitest interactively; rerun `npm test` for the full type-check. Stop watch mode with Ctrl+C.

Required companion checks: `npm run build` in each package and `npm run lint` in `client/`. No logged-in gym session, .env credentials, running API, or MongoDB instance is needed.

## Tooling and compatibility

Baseline environment: Node 24.14.0, npm 11.9.0, backend TypeScript 7.0.2, frontend TypeScript 6.0.3, React 19.3.1, and frontend Vite 8.3.5.

All additions are development-only and pinned:

| Package | Backend | Frontend |
| --- | --- | --- |
| vitest | 5.0.5 | 5.0.5 |
| vite | 8.3.5 (required Vitest peer) | Existing dependency preserved |
| supertest | 7.3.1 | - |
| @types/supertest | 7.2.1 | - |
| @testing-library/react | - | 16.3.3 |
| @testing-library/dom | - | 10.4.2 (required React Testing Library peer) |
| @testing-library/jest-dom | - | 7.0.1 |
| jsdom | - | 29.1.1 |

Vitest 5 supports the existing Node/Vite versions. jsdom 29 supports Node 24.14; jsdom 30 requires Node 24.15 or another supported newer runtime, so it was not selected. Requirements were checked against npm package engine/peer metadata. Reference: [Vitest migration guidance](https://main.vitest.dev/guide/migration/) and [jsdom releases](https://github.com/jsdom/jsdom/releases).

## Backend architecture and isolation

- `server/vitest.config.ts` selects Node and supplies synthetic test-only environment values before application modules initialize. `tests/setup.ts` mocks `dotenv/config`, preventing application .env loading.
- Tests never import `src/server.ts` or invoke `connectDatabase()`. Test setup also places explicit failure guards on those entrypoints.
- Tests mount real auth/staff/plan/report routers in isolated Express apps with the real JSON/cookie parsing and authorization middleware. They do not start the production server or import its startup code.
- Supertest uses ephemeral HTTP servers registered by `tests/helpers/http.ts`. Only loopback connections to those registered listening ports are allowed. Fetch and other socket destinations fail the test.
- Mongoose connection methods, query/aggregation execution, and document saves are guarded. Explicit Staff/plan lookup stubs return fictional in-memory Mongoose documents or shaped query results. No database reads or writes occur.
- bcrypt comparison is mocked in login tests; the actual login handler, public staff serialization, cookie handling, token signing/verification, and role guards run normally.
- JWT tests use a fixed clock with only Date faked, real signatures, and synthetic test keys. No real timers are advanced or arbitrary sleeps used.
- Login tests inject the real rate-limit MemoryStore, reset it before each test, and shut it down afterward. The real limiter remains active, including its ten-failed-attempt threshold.
- Mocks are restored between tests; ephemeral servers are closed after each test. Any unexpected database/network attempt is recorded and fails cleanup assertions even if application code catches the error.

| Suite | Tests | Coverage |
| --- | --- | --- |
| `auth.routes.test.ts` | 14 | Active Admin/Receptionist login; cookie signature/lifetime/attributes; invalid credentials, unknown/inactive staff, invalid payloads; response field redaction; current session; logout cookie clearing; login limiter. |
| `auth.middleware.test.ts` | 12 | Valid/missing/malformed/expired sessions; signature, issuer, audience, algorithm, and subject rejection; inactive/deleted staff; current database role on subsequent requests. |
| `roles.routes.test.ts` | 6 | Actual Admin-only staff directory; Receptionist/anonymous denial; unauthenticated requireRole behavior; both roles retain the active-plan operation. |
| `reports.authorization.test.ts` | 18 | All six existing endpoints: anonymous 401, Receptionist 403, Admin reaches exactly the intended controller. |

The six report paths are `/api/reports/revenue/collections`, `/api/reports/revenue/invoices`, `/api/reports/revenue/receivables`, `/api/reports/memberships/activity`, `/api/reports/memberships/active`, and `/api/reports/attendance/trends`.

## Frontend architecture and isolation

- `client/vitest.config.ts` merges the existing Vite/React/Tailwind configuration with jsdom test settings. Existing production configuration and application source are preserved.
- React Testing Library uses real `App`, route guards, `AppLayout`, and `AuthProvider`. Assertions use accessible roles/labels rather than CSS classes.
- Route tests use a real MemoryRouter with explicit fictional auth context. Only unrelated leaf-page content is mocked, so business-page/API work cannot obscure authorization outcomes.
- Navigation tests render real AppLayout filtering, including Reports and Settings restrictions and retained operational links.
- AuthProvider tests mock only `authApi`; session restoration, loading, login, and logout state changes run in the actual provider. Deferred promises verify pending states without sleeps.
- Setup imports jest-dom matchers, cleans up rendered DOM after each test, restores mocks, and rejects fetch, XMLHttpRequest, WebSocket, and TCP connections. Unexpected attempts fail cleanup assertions.

| Suite | Tests | Coverage |
| --- | --- | --- |
| `routes.test.tsx` | 13 | Reports access for all three principal states; six Receptionist operational routes; protected/public loading states; authenticated users redirected away from login. |
| `navigation.test.tsx` | 2 | Admin Reports/Settings visibility; Receptionist restrictions and all six permitted navigation links. |
| `auth-provider.test.tsx` | 7 | Successful/failed/pending restoration; successful/failed login; logout clears state only after success and retains staff on failure. |

## Limits and manual checks

The S8-02 baseline contains 72 tests (50 backend, 22 frontend). These are authorization/component tests with explicit mocked boundaries, not live database or full-browser end-to-end tests.

- Report controllers are mocked solely to observe authorization handoff. Financial calculations, aggregation correctness, report data rendering, exports, and actual database index behavior are not validated by this suite.
- Password hashing/comparison correctness is not tested cryptographically; production bcrypt comparison is mocked in the route tests.
- Real API adapters, MongoDB transactions, proxy/TLS deployment, browser cookie persistence, cross-origin behavior, and production Secure-cookie transport remain outside this mocked baseline.
- jsdom does not validate responsive layout, keyboard behavior across the complete app, print output, or browser integration. Those still require manual browser checks or a separately approved end-to-end suite.
- No manual browser checks were repeated for S8-02. The five S8-01 acceptance checks remain recorded as user-confirmed passes in the sprint tracker.
- npm install/audit access to the package registry is separate from test execution: application API/database/external-network access is blocked during these tests.

## S8-03 regression additions

After separate S8-03 authorization, add tests for legacy permission defaults, explicit restrictions/unknown keys, API/route/sidebar/action agreement, revoked/expired session behavior, deactivation/reactivation, role/permission changes, and the approved legacy-token rollout policy. Preserve the existing role and report baseline wherever the approved behavior remains unchanged.

The current-role test documents today's versionless JWT behavior. Update its expected session status only when S8-03 explicitly changes that policy; do not implement revocation or permissions in S8-02.

## Known tooling findings

The client npm audit reports nine moderate development-tooling advisories through the pre-existing ESLint/typescript-eslint/minimatch tree. The affected existing minimatch 10.2.6 lock entry and other pre-existing package versions were unchanged by this task. The client production-only audit reports zero vulnerabilities; the backend installation audit also reports zero. No automatic audit fix, downgrade, or unrelated tooling upgrade was applied.
