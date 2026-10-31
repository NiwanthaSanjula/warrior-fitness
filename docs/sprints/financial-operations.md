# Financial Operations — Expenses and Daily Cash Closing

Status: **COMPLETED FOR PORTFOLIO / UNIVERSITY DEMO** under explicit final user approval.

**NOT APPROVED FOR PRODUCTION FINANCIAL USE. Live MongoDB transaction, rollback, concurrency and persisted closed-period verification remain outstanding.** Automated database boundaries are mocked; browser UI checks use fictional intercepted responses. Demo completion does not certify production financial integrity.

Started on clean `feature/financial-operations` at `84625c74dfac82098403cb7e44be4dce893e0373`. Final authorization accepts the completed portfolio/demo scope and permits its commit/push, followed by a history-preserving merge into `develop` after successful verification. This does not rewrite completed Sprint 8 history or complete audit logging/staff administration. No database connection, DNS troubleshooting, database configuration, dependency installation or real-record changes are part of finalization.

## Scope and acceptance

| Deliverable | Review criteria | Status |
| --- | --- | --- |
| Expenses | Admin-only creation, eight categories, three methods, whole-number LKR, authenticated responsible staff, paginated/filterable/searchable ledger and period/category/method totals; stable idempotent retries; no updates/deletes. | Completed for portfolio/demo |
| Daily closing | One immutable snapshot per Colombo day; cash-only reconciliation; separate Bank Transfer/Card totals; discrepancy explanation; duplicate/stale-preview/closed-period controls; responsible Admin and timestamp. | Completed for portfolio/demo; live integrity verification outstanding |
| Screens | Responsive `/expenses`, `/cash-closing`, `/closing-history`; collapsible Finance navigation also contains existing Payments & Invoices; Admin-only financial pages and permitted Receptionist billing; keyboard/mobile controls and loading/empty/error/retry/success states. | Completed for portfolio/demo |
| Verification | Preserve 219 existing cases; 337 isolated automated tests, both builds, client lint and diff check; 12 browser UI checks with fictional responses; distinguish these from real MongoDB results. | Demo verification accepted; production verification outstanding |

Excluded: payroll processing (Salaries is only an expense category), bank reconciliation, profit accounting, refunds/reversals, editing/reopening completed records, equipment/staff management and unrelated Sprint 8 work.

## APIs and data rules

Every route requires authenticated `ADMIN` plus its server-owned Admin-only permission (`expenses.manage` or `cash-closings.manage`). Receptionist defaults are unchanged; forged grants do not bypass the role boundary.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/expenses` | One filtered aggregation returns rows, pagination and full matching totals by category/method/period. |
| `POST /api/expenses` | Append an expense; exact UUID `requestId` replay returns 200, creation 201, changed payload/actor with the same key returns 409. |
| `GET /api/cash-closings/day/:date` | Consistent live preview and revision for an open day, or the frozen snapshot for a completed day. |
| `POST /api/cash-closings` | Finalize with UUID `requestId`, preview `expectedRevision`, date, opening/actual cash and explanation. Same-key replay returns the original snapshot. |
| `GET /api/cash-closings` | Paginated closing history for a selected period. |

Update, replacement, delete and reopen endpoints are unavailable (405). Mongoose middleware also rejects recorded-expense/closing saves, updates, deletes and bulk writes; original fields are immutable.

- Expenses: category, 3–300 character description, positive integer LKR up to 10,000,000, Cash/Bank Transfer/Card, effective expense date, optional reference up to 80 characters. Responsibility is the authenticated Admin, with a historical name snapshot; clients cannot impersonate another staff member.
- Closing inputs: nonnegative whole-number opening/actual cash up to 1,000,000,000; signed variance is actual minus expected. A nonzero variance requires at least five explanation characters (maximum 500).
- Dates use the existing Colombo calendar/reporting helpers and inclusive-start/exclusive-end timestamp boundaries. Financial dates are 2007-01-01 through Colombo today, matching the helpers' modern UTC+05:30 era. Future dates are rejected.
- List periods default to the last 30 dates and are limited to 366 dates per query. Pagination defaults to 20, maximum 100; search is literal/escaped across description, reference and responsible staff name. Totals include all filtered records, beyond the visible page.
- Frontend unknown/network/5xx write outcomes retain the exact payload and UUID for retry and disable editing until confirmed. Confirmed validation/conflict rejections allow draft correction. Pending payloads are memory-only: after leaving/reloading the page, inspect history before submitting a new intent.

## Reconciliation and financial integrity

`Expected cash = Opening cash + Cash payments received − Cash expenses`

`Variance = Actual physical closing cash − Expected cash` (negative = shortage; positive = overage).

Payments are read from the existing immutable payment ledger by `receivedAt` within the Colombo day. Expenses use their effective `expenseDate`. The snapshot includes collections and expenses for all three methods, transaction counts, opening/actual/expected cash, signed variance, explanation, original Admin ID/name and closing timestamp. Bank Transfer/Card do not affect physical cash.

Every new payment, expense and closing updates the same `FinancialDay` row for its date **inside the ledger transaction**. Its unique string `_id` serializes competing writes through MongoDB write conflicts; its revision changes on successful new entries. A closing acquires that guard before re-reading the ledger, rejects stale previews, saves its unique-date snapshot and marks the day closed in the same transaction. New entries for a closed date (all methods, including backdated expenses) return 409. Exact replays are checked first and remain valid after closing without another ledger/day write.

The existing conditional invoice increment and payment save remain in the same transaction. The payment timestamp is captured once on the server and used for both its day guard and persisted `receivedAt`. Payment inputs still cannot supply/backdate that timestamp. Existing balances, membership calculations, reporting definitions and payment request comparison remain intact.

Transactions use snapshot reads, majority writes and primary reads. The driver handles transient transaction retries; a bounded whole-transaction retry additionally handles duplicate-key races during first-day upsert or idempotent insertion. Unique indexes protect expense/closing request IDs and the closing date. Startup waits for financial model/index initialization before listening. No index initialization or database startup was executed by Codex.

## Verification and remaining integration work

Latest automated verification after the approved Finance navigation change: backend **226 passed** across 11 files; frontend **111 passed** across six files (**337 total**, no failures/skips). The original 219 cases remain covered; navigation expectations were updated for the approved Finance group. Both `npm run build` checks, client `npm run lint`, and `git diff --check` passed. Test type-checking and existing database/network isolation checks passed. The client retains the non-blocking Vite chunk-size warning (approximately 692 kB).

Coverage includes validation, role/permission enforcement, cash-only mathematics, safe integer limits, idempotent success/replay/conflicts, duplicate day prevention, revision checks, immutable fields/unsupported mutations, closed-period rejection, payment transaction participation, date boundaries, filtered summaries/pagination, frontend states, navigation and frozen-payload retry. Database methods/transaction boundaries are explicitly mocked and existing network/database guards remain enabled.

**No real MongoDB transaction, rollback or concurrent-writer verification has been performed by Codex.** Passing mocks does not establish distributed concurrency correctness. Live-database browser acceptance remains unverified; the independent browser UI checks below use fictional intercepted responses.

### Simplified verification follow-up

- Earlier read-only Atlas preflight attempts did not establish a verified connection; no integration writes or cleanup occurred. Live database identity, user isolation, transactions, rollback and concurrency remain unverified.
- The user explicitly ended Atlas integration troubleshooting for portfolio/demo finalization. Removed only the unused, newly created `server/tests/integration/financial-safety.ts` experiment; no application code, automated suites, database configuration or local `.env` files were removed or changed. No integration runner is included or executed in the completed demo feature.
- Ordinary UI verification proceeded in the installed headless Microsoft Edge browser using a fresh temporary profile and the real Vite frontend. Every `/api` request was intercepted and fulfilled with disposable in-memory fictional responses; unmatched API requests were blocked. No database, personal browser profile, credentials or existing application session was used. Temporary test code/screenshots are outside the repository; the browser and temporary Vite server were stopped afterward.
- **12 browser UI checks passed, zero remaining failures**: Admin Finance children/active state; native Space/Enter disclosure and Escape focus; empty expense state; Cash expense entry; Bank Transfer/Card controls and summaries; error/retry without false totals; the requested opening 1,000 + cash collections 5,000 − cash expenses 1,000 = expected 5,000, actual 4,900, variance −100 example; explanation required before request; returned completed snapshot/history link/read-only UI; 390/320-pixel layout and mobile navigation; permitted Receptionist billing-only navigation/direct-route denial; no Finance group without invoice permission. Initial harness-only keyboard-event/serialization/text-selection issues were corrected; no application fix was needed.
- These browser checks establish frontend behavior with controlled responses, **not** backend authorization against live staff, persisted closing immutability, or real financial calculations/transactions. Live-database manual acceptance is still outstanding and is explicitly outside the accepted demo verification. No existing financial records or active business date were changed; finalization does not access any database.
- Finalization verification passed: server `npm test` 226/226; client `npm test` 111/111 (337 total, no failures/skips); both `npm run build` checks; client `npm run lint`; tracked and new-file diff checks. The Vite bundle-size warning remains non-blocking. Existing application code and suites are preserved. No live database or integration tests were run during finalization. The module is completed for portfolio/demo purposes only.

Before enabling closing in deployment, stop/drain old payment-writer instances, deploy the shared guard to every writer, and allow required collection/unique-index initialization. A standalone MongoDB instance cannot support these transactions. Direct database writers bypass application protections and must not be used for financial changes. There is no automatic opening-cash carry-forward, bank balance reconciliation, or corrective reversal/reopening workflow.

## Outstanding production validation (dedicated disposable test database only)

These checks remain outstanding and do not block the explicitly accepted portfolio/demo completion. They are not authorized against the normal gym database: do not change existing financial records, close an active business date, or run rollback, destructive, stress or concurrency experiments there. Production financial use requires separate approval after real integration evidence and review.

1. Admin: open all three pages on desktop/phone, use keyboard navigation, verify loading/retry/empty states and sidebar links. Receptionist/unauthenticated access must be denied in both UI and APIs, including direct URLs.
2. Record fictional expenses with Cash, Bank Transfer and Card; validate category/description/date/amount/reference and authenticated responsibility. Search/filter/change period/page; compare all summaries with the complete filtered ledger. Reject future dates, fractional/zero amounts and unsupported categories/methods.
3. For an open date, record LKR 5,000 cash collections and LKR 1,000 cash expenses. Enter opening cash LKR 1,000 and actual LKR 4,900: expected LKR 5,000, shortage LKR 100. Non-cash entries must appear separately. Require an explanation and explicit finalization confirmation.
4. Complete the closing; history/detail must show the same read-only amounts, Admin and Colombo timestamp. Reject a second closing and any new cash/non-cash expense/payment for that date; reject backdated expenses for it. Reject HTTP update/delete attempts. Check that a rejected payment leaves invoice paid balance and ledger unchanged.
5. Retry the same expense/payment/closing UUID and payload after a simulated lost response: one financial record only. Reuse the key with changed details: 409. Review history before creating another intent after a full page reload.
6. Concurrency integration: submit two closings for the same date; race closing against payment/expense; concurrently retry the same UUID; race first-use day upserts. Accept only one closing or a safe 409/stale-preview outcome, never a snapshot missing a committed day entry or a partial invoice/payment write. Refreshing a stale preview must be required after another browser records money. Use replica-set fault injection to verify actual abort/commit-uncertainty behavior separately.

## Changed-file map

| Files | Change |
| --- | --- |
| `server/src/modules/financial/financial.constants.ts`, `financial.validation.ts` | Expense catalogue and strict money/date/query/input validation. |
| `server/src/modules/financial/expense.model.ts`, `cash-closing.model.ts`, `append-only.ts` | Immutable financial models, unique indexes, safe DTOs and mutation guards. |
| `server/src/modules/financial/financial-day.model.ts`, `financial-day.service.ts` | Shared day revision/closed marker and transactional guard/retry behavior. |
| `server/src/modules/financial/financial.service.ts`, `financial.routes.ts` | Financial operations, snapshot/list aggregation, Admin-protected endpoints and model readiness. |
| `server/src/app.ts`, `server/src/server.ts` | Mount routes and await financial index/collection initialization at application startup. |
| `server/src/modules/auth/permissions.ts`, `client/src/auth/permissions.ts` | Add matching Admin-only financial permissions. |
| `server/src/modules/billing/payment.controller.ts`, `payment.model.ts` | Participate in day protection inside the existing invoice/payment transaction; index day scans. |
| `client/src/types/financial.ts`, `client/src/api/financial.api.ts`, `client/src/validations/financial.schema.ts`, `client/src/utils/financial.ts` | Typed Axios contracts, labels, form validation, reconciliation preview, timestamp formatting and safe retry classification. |
| `client/src/components/financial/FinancialWidgets.tsx` | Financial navigation, notices, totals, read-only snapshot and pagination. |
| `client/src/pages/ExpenseManagementPage.tsx`, `DailyCashClosingPage.tsx`, `ClosingHistoryPage.tsx` | Expense creation/ledger/summaries, closing preparation/finalization and history screens. |
| `client/src/App.tsx`, `client/src/components/AppLayout.tsx` | Admin-only routes and sidebar entries. |
| `server/tests/financial.policy.test.ts`, `financial.service.test.ts`, `financial.routes.test.ts`, `payment.closing.test.ts` | Isolated calculation/validation/authorization/service/payment integrity tests. |
| `client/tests/financial.test.tsx`, `client/tests/fixtures/financial.ts` | Real-page financial behavior tests with fictional API fixtures. |
| `client/tests/navigation.test.tsx`, `client/tests/permissions.test.tsx` | Finance group nesting, permission filtering, active routes, browser navigation, disclosure keyboard/focus and mobile navigation tests. |
| `docs/sprints/financial-operations.md` | This scope, status, integrity, verification, limitations and review tracker. |

Final user authorization permits commit `feat(finance): implement expense management and daily cash closing`, push to `origin/feature/financial-operations`, and a history-preserving merge/push to `origin/develop` only after successful checks and a clean feature branch. Preserve the feature branch and leave `main` unchanged. Stop if verification or merging fails. No other module or unfinished Sprint 8 task is approved or marked complete by this tracker; do not start another feature.
