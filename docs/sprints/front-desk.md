# Front Desk workspace

## Final portfolio/demo release

The owner authorized portfolio/demo completion and Git finalization. Status: **COMPLETED FOR PORTFOLIO/DEMO**. Earlier counts and preservation notes below remain implementation history.

Final verification: **1,098 tests passed (737 backend, 361 frontend)**; both builds and frontend lint passed. **19/19 mocked Chrome checks passed**, including desktop/tablet/mobile KPI layout, charts, Front Desk, navigation, permissions, errors and refresh. No database was accessed or modified during finalization. Existing seeded data is preserved; live financial failure/rollback/concurrency, physical scanner and hosted authentication checks remain outstanding.

Deployment is prepared, not live: authenticated Vercel/Render access was unavailable. See [Product Experience final verification](product-experience.md) and [deployment guide](../deployment.md) for the final six-color KPI polish, production configuration, verification and owner steps. Notifications remain simulation-only; no production financial approval is implied.

Status: **COMPLETED FOR PORTFOLIO/DEMO**.

Branch: `feature/product-experience`. Existing Product Experience, logo and demo-seeder work is preserved. This task adds a frontend workspace; it does not change backend services, permissions, financial writes or database configuration.

## Working flows

- Open **Front Desk** in navigation (`/front-desk`). Admins and staff with `members.read` can enter. The subsequent UI simplification also preserves the former Attendance-only check-in workflow through its existing `attendance.read`, `attendance.check-in` and `memberships.read` grants, without requesting a denied member profile. Existing Dashboard and management pages remain available.
- Search by name, member reference or phone. Typing is debounced; Enter searches immediately and opens an unambiguous result. Local/international Sri Lankan phone variants are tried only when the first search has no results. Ambiguous matches require selection; incomplete result pages never auto-select.
- The selected member remains visible during another search. Arrow keys choose results, Enter selects, Escape clears the search, and Alt+M starts another search. Selecting a member focuses the first available action. A successful explicit check-in returns focus to search.
- See profile status, permitted membership coverage/last valid date, last check-in in Colombo time and permitted outstanding balances. Each source has independent loading/error/retry behavior; failed requests do not display zero balances.
- Check-in is one explicit action after selection. The existing server decides eligibility, active profile status and daily duplicate protection. Rapid repeated activations are suppressed, writes are never automatically retried, and late responses remain attached to the submitted member.
- Renewal/enrollment opens the existing member-specific membership screen. Collection/review opens the oldest overdue open invoice first, or the latest invoice for a settled account. All existing confirmation, idempotency and transaction safeguards remain in those screens/services.
- Selection is retained in `?member=<id>` so browser Back from a workflow restores context. Refresh and returning to the browser tab reload permitted member details. Private state is discarded when the authenticated account or effective permissions change.

## Permissions and API reuse

| Data or action | Required permissions | Existing endpoint/workflow |
| --- | --- | --- |
| Workspace, search, profile | `members.read` | `GET /api/members`, `GET /api/members/:id` |
| Membership status/expiry | `memberships.read` | `GET /api/memberships/member/:id/summary` |
| Last visit | `attendance.read` | `GET /api/attendance/member/:id`, page 1 / limit 1, no date filter |
| Check-in | `attendance.check-in` | `POST /api/attendance/check-in` |
| Renewal/enrollment shortcut | `memberships.read`, `plans.read`, relevant `memberships.renew` / `memberships.enroll` | `/members/:id/membership` |
| Balance and invoice review | `invoices.read` | `GET /api/invoices/member/:id`, `/payments/invoices/:id` |
| Collect Payment shortcut | `invoices.read`, `payments.record`, an open invoice | Existing invoice payment form |

Admins retain full access. Denied sections/actions are hidden and their APIs are not requested. A check-in grant does not imply membership/history/billing read access; the existing backend can validate eligibility without exposing those records. No Reports endpoints are used.

Balances sum only server-provided whole-LKR `balanceLkr` fields from the complete member invoice response. Incomplete responses, foreign-member records and unsafe amounts are rejected. This is display aggregation; there are no new billing or payment rules.

## Changed files for this task

- `client/src/pages/FrontDeskPage.tsx`: workspace, accessible keyboard search, member details, feedback and existing-workflow actions.
- `client/src/hooks/useFrontDeskSearch.ts`: debounced/cancellable lookup, phone fallback and deliberate match selection.
- `client/src/hooks/useFrontDeskMember.ts`: independent permission-gated member resources using the existing resource hook.
- `client/src/utils/front-desk.ts`: search matching and defensive presentation of server invoice balances.
- `client/src/api/billing.api.ts`, `client/src/types/billing.ts`: typed wrapper for the existing complete member invoice endpoint.
- `client/src/App.tsx`, `client/src/components/AppLayout.tsx`: lazy route and permission-filtered navigation entry.
- `client/tests/front-desk.test.tsx`, `client/tests/front-desk-values.test.ts`, `client/tests/fixtures/front-desk.ts`: isolated component/utility tests and fictional fixtures.
- `client/tests/routes.test.tsx`: real route/sidebar guard coverage for Front Desk.
- This document: scope, permissions, verification and limitations.

## Verification

Tests use explicit mocked APIs/models and the repository network/database isolation setup.

| Command / check | Result |
| --- | --- |
| `server/`: `npm test` | 716 tests passed across 27 files |
| `client/`: `npm test` | 331 tests passed across 16 files |
| `server/`: `npm run build` | Passed |
| `client/`: `npm run build` | Passed; Front Desk remains a lazy route chunk |
| `client/`: `npm run lint` | Passed |
| `git diff --check`, plus whitespace checks for the eight new task files | Passed |
| Isolated Chrome acceptance | 12 scenarios passed; no application exceptions or external requests |

Total: 1,047 automated tests passed, including all 1,000 existing tests and 47 added tests. Added coverage includes permissions, navigation, explicit/duplicate check-ins, independent failures/retries, search cancellation, stale member responses, permission changes, unsafe balances, settled invoices and Colombo date boundaries.

Mocked Chrome acceptance covers desktop (1440px), landscape tablet (1024px), portrait tablet (768px) and mobile (390px): member lookup and explicit check-in; expired membership to renewal; outstanding invoice to payment form; keyboard selection and switching members; restricted permissions; independent errors/retry; loading/empty search; navigation and authentication guards. No browser request can reach the running backend: checks serve the built frontend from an isolated local static server, intercept API requests with fictional responses, and block external traffic. Check-in writes in these checks exist only in the mock's memory. Browser reports and screenshots are kept outside the repository.

Observed interaction count for the same unique member reference, starting on each page, excluding typing, route entry and network wait:

| Task | Existing Attendance page | Front Desk |
| --- | --- | --- |
| Find and check in | 4 activations: focus search, Search, choose match, Check In Member | 2 activations: Enter to open, Enter on focused Check In |

This is a measured 50% reduction in activations for that scenario, not a measured reduction in elapsed time. Expired-member lookup to the existing renewal screen takes two activations in Front Desk. Ambiguous names require an additional deliberate selection.

## Review and remaining checks

- Live database behavior and physical keyboard-wedge scanners were not verified in this task. Existing backend authorization, eligibility and duplicate safeguards are covered by isolated backend tests; no claim of live MongoDB/concurrency verification is made.
- The existing member invoice API returns the complete invoice history. Very large histories remain subject to that API's existing response size; no aggregate endpoint was added.
- Search initially displays up to eight matches; staff narrow broad searches or select a visible result explicitly.
- Manual review: open Front Desk as Admin and Receptionist; search by name/reference/phone; check in an eligible fictional member; verify expired/inactive states; follow renewal/payment links and return with Back; restrict individual read/write grants; verify tablet keyboard/scanner operation.
- These initial checks did not imply approval. The owner has since authorized portfolio/demo completion and Git finalization as recorded above.
- Preservation check: of the 53 files already changed before this task, only `App.tsx` and `AppLayout.tsx` were extended for the new route/menu entry; the other 51 remain byte-for-byte unchanged. Nothing is staged, and HEAD remains `f09ecbbc47892252acddc557d17d5c976fcf0048`.

## Subsequent UI simplification

Front Desk is now the single check-in workspace; Attendance is history/reporting with a Front Desk link. Repeated visible instructions and the duplicate single-invoice list were removed, while keyboard help remains accessible and multiple invoices expand on demand. Backend eligibility, duplicate checks and financial confirmations remain unchanged. See [ui-ux-simplification.md](ui-ux-simplification.md) for the current permission fallback, navigation, verification and review status. Earlier counts/preservation notes above record the initial Front Desk implementation.
