# Realistic development/demo data

## Final portfolio/demo release

The owner authorized portfolio/demo completion and Git finalization. Status: **COMPLETED FOR PORTFOLIO/DEMO**. Earlier counts and preservation notes below remain implementation history.

Final verification: **1,098 tests passed (737 backend, 361 frontend)**; both builds and frontend lint passed. **19/19 mocked Chrome checks passed**, including desktop/tablet/mobile KPI layout, charts, Front Desk, navigation, permissions, errors and refresh. No database was accessed or modified during finalization. Existing seeded data is preserved; live financial failure/rollback/concurrency, physical scanner and hosted authentication checks remain outstanding.

Deployment is prepared, not live: authenticated Vercel/Render access was unavailable. See [Product Experience final verification](product-experience.md) and [deployment guide](../deployment.md) for the final six-color KPI polish, production configuration, verification and owner steps. Notifications remain simulation-only; no production financial approval is implied.

Status: **COMPLETED FOR PORTFOLIO/DEMO**.

Branch: `feature/product-experience`. All 29 pre-existing uncommitted Product Experience files were preserved byte-for-byte. This task adds a development tool on the same branch; it does not publish or reset the application.

## Actual execution status

- `npm run seed:demo -- --dry-run` passed. The verified offline plan covers **2026-10-19 through 2026-11-01**, relative to the current Asia/Colombo date at verification.
- At the user's explicit population authorization, the existing working local connection settings were read privately and retargeted to **`warrior_fitness_demo`** in Git-ignored `server/.env.demo.local`. The ordinary `.env` was not changed; its SHA-256 digest matched before and after.
- `npm run seed:demo -- --check` **passed**: actual connected database exactly **`warrior_fitness_demo`**, initially empty, with a transaction-capable topology. No connection or permission blocker occurred, and no Atlas/DNS troubleshooting was needed.
- `npm run seed:demo -- --apply` **passed**: **1,018 application/demo records created, 0 skipped, 0 failed**, plus 14 financial-day records and one ownership/lease manifest. Persisted invoice/payment, stock-chain, source-ledger and closing reconciliation checks passed. Exact date anchor: `2026-11-01T09:12:33.226Z`.
- An independent read-only connection confirmed the persisted counts listed below, a completed manifest and a released lease. A separate read-only count confirmed the normal database still contains **3 members**. No normal database write was performed.
- The local demo configuration is ignored and untracked; no credentials or secrets were printed or staged. Initial demo passwords and a distinct JWT secret were generated locally and remain only in the private configuration.
- Backend started with `npm run dev:demo` at **`http://127.0.0.1:5000`**, connected to the verified demo database; frontend started with `npm run dev` at **`http://localhost:5173`**. The previous ordinary backend was stopped before the demo backend took port 5000. Notification scheduling remains disabled and delivery remains simulation-only.
- A real completed rerun of `--apply` returned **0 created, 1,018 skipped, 0 failed**. Independent counts after the rerun were unchanged: 1,033 total documents including financial-day/seed metadata, and still 3 members in the normal database.
- **6/6 live Chrome checks passed, without mocked API responses**: Admin dashboard/combined collections, 60-member directory, today's attendance and all seven trend dates, POS history/retail stock, equipment/maintenance and mobile dashboard. No unexpected API errors or browser runtime errors occurred. Screenshots and a sanitized result report are local temporary artifacts at `C:/Users/niwan/AppData/Local/Temp/warrior-demo-live-aWXx4x/`.

## Commands and local configuration

Run commands from `server/`:

```powershell
npm run seed:demo
npm run seed:demo -- --dry-run
```

Both commands are **offline**. They generate and validate a proposed new dataset and print planned/created/skipped/failed counts. They do not inspect existing database contents. Created and skipped are zero during an offline preview; they are not an assertion that a remote database is empty.

The private demo configuration now exists locally. For another independently empty demo environment, create **only on that computer** `server/.env.demo.local` with these keys:

```dotenv
DEMO_MONGODB_URI=REPLACE_WITH_YOUR_PRIVATE_ATLAS_URI_FOR_warrior_fitness_demo
DEMO_STAFF_PASSWORD=REPLACE_WITH_A_PRIVATE_PASSWORD_OF_12_TO_128_CHARACTERS
JWT_SECRET=REPLACE_WITH_A_DISTINCT_PRIVATE_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
```

The values above are placeholders, not usable credentials. Do not paste the configured file or connection string into chat or Git. Use the Atlas-provided URI format and explicitly name `/warrior_fitness_demo` before its query string. Both SRV and non-SRV replica-set URIs are accepted. The database must be empty on first use. Prefer a database user whose write privileges are limited to this disposable database. Do not copy the normal `.env`: normal `MONGODB_URI`, WhatsApp settings and other undocumented keys are rejected.

Check and apply separately:

```powershell
git check-ignore .env.demo.local
npm run seed:demo -- --check
npm run seed:demo -- --apply
```

`--check` explicitly loads the ignored local demo file, connects using `DEMO_MONGODB_URI`, verifies the actual database identity and transaction-capable topology, and checks first-use emptiness/ownership using reads only. It cannot prove write privileges or real transaction behavior without performing writes. `--apply` repeats those checks before any collection/index creation or record write. No flag permits another database, forced cleanup or bypass of these checks. A conflicting or combined flag is rejected; default execution cannot write.

### Display the existing data in the normal frontend

1. The database is already populated; do not run the seeder again for ordinary development. Configure the normal ignored `server/.env` to use its existing private `warrior_fitness_demo` connection and keep notification scheduling disabled.
2. From `server/`, run `npm run dev`. Wait for `MongoDB connected: warrior_fitness_demo` and the API listening on port 5000.
3. From `client/` in another terminal, run `npm run dev` and open `http://localhost:5173`.
4. Use Sign In with existing staff credentials, or Try Demo for the read-only viewer when `DEMO_PUBLIC_LOGIN_ENABLED=true` in the normal backend `.env`.

The historical separate demo launcher described in the original population evidence has been removed. The seeder remains an optional utility with its own explicit safety checks; neither its configuration nor commands are required by normal startup.

| Email | Access |
| --- | --- |
| `admin@warrior-demo.example` | Admin; full existing application access |
| `reception@warrior-demo.example` | Receptionist; existing role-default permissions |
| `desk@warrior-demo.example` | Restricted Receptionist; attendance/check-in, member reading, POS/product viewing and own retail sales |

The demo launcher uses the same `app.ts`, routers, authentication, cookies and permissions as normal startup. It explicitly loads demo configuration and verifies the connected identity before importing the application or initializing indexes. It refuses an incomplete dataset or an active seeding lease. It does not import `server.ts`, modify the ordinary `.env`, or start the notification scheduler. The frontend's existing `/api` proxy already targets port 5000, so no frontend environment/source changes are needed with the documented ports.

New demo accounts share the locally configured initial demo password. Only hashes enter MongoDB. **An existing account's password, permissions, activation and role are never reset by this script.** Changing the local password after the first seed does not change existing accounts. Keep the original private configuration; use existing authorized staff workflows for subsequent account changes.

## Generated dataset

These are **actual persisted counts**, independently read back from `warrior_fitness_demo` after the successful apply.

| Module / records | Inserted and read back |
| --- | ---: |
| Staff accounts / staff creation audit events | 3 / 2 |
| Membership plans | 5 |
| Members | 60 |
| Membership periods / invoices | 70 / 70 |
| Membership payments | 56 |
| Attendance check-ins | 307 |
| Scheduled follow-ups | 22 |
| Retail products | 20 |
| Retail sales | 68 |
| Stock movements | 171 |
| Expenses | 14 |
| Historical cash closings | 12 |
| Equipment assets / registration history | 12 / 12 |
| Breakdown incidents / maintenance work orders | 4 / 3 |
| Equipment downtime periods / existing-expense references | 3 / 1 |
| Notification consent examples | 60 |
| SIMULATED reminder history | 42 |
| Synthetic recorded automation failure | 1 |

The existing ledger services also maintain 14 financial-day revision records for the reporting period. Seeder ownership/lease metadata lives in one `demo_seed_state` document; it is not a financial entry. Counts of check-ins/reminders can vary with the date anchor/calendar; generation is deterministic for an exact anchor.

- Fictional Sri Lankan-style names use `WF-DEMO-001` through `WF-DEMO-060`. Phone numbers use the intentionally invalid `000000xxxx` pattern; these are not dialable Sri Lankan contact examples. Addresses, suppliers, technicians and reference values are clearly fictional. Emails use the reserved `.example` domain.
- Plans cover weekly, fortnightly, 30-day, quarterly and annual terms. Memberships include valid active coverage, 12 deliberately near-expiry examples, expired profiles, six inactive profiles, four active profiles without recent attendance, and ten renewed members. Four renewals are purchased early and start after current coverage ends.
- Each member has exactly one INITIAL period; renewals are contiguous and non-overlapping. Start dates are inclusive and end dates exclusive, using the existing Colombo/calendar helpers. Monthly terms retain the existing month-end rules. Purchased snapshots retain their original price and duration.
- Attendance varies daily and exists on all 14 dates, including today. It references the actual valid period and active profile, with at most one check-in per member/date.
- Invoice examples include 42 fully paid, 14 partially paid and 14 unpaid purchases, with overdue debt. Payments use cash, card and bank transfer. No receipt is dated before its invoice was issued.
- POS has multiple actual fixture receipts on every date, cash/card/bank transfer examples, member-associated and walk-in sales, two fictional cashiers, and server-validated totals. Opening stock, 14 restocks, one reasoned adjustment and every sale deduction lead to the planned shelf: two out-of-stock and four low-stock products.
- Equipment includes operational assets, an out-of-service critical fault, an asset under maintenance, a lower-severity open issue, resolved repair history, ongoing and completed downtime, and due/overdue/future preventive schedules. Estimated repair costs are metadata; the completed repair references one verified existing MAINTENANCE expense and creates no second expense. That reference is appended at actual seed execution time, after its expense has been imported.
- All reminder history uses `WHATSAPP_SIMULATED` / `SIMULATED`. Eligibility reuses the existing pure reminder helper with only memberships already purchased at the historical simulation time. No record is generated for an inactive profile or absent opt-in. Seeded follow-ups use INTERNAL_REVIEW and explicitly say no real contact occurred.
- The recorded automation failure is an intentional **synthetic demo scenario**, not evidence that an actual scheduled job ran or failed. It makes the Command Center failure panel explorable. Automatic scheduling is disabled in the demo launcher. No WhatsApp provider, network delivery call or credentials are involved.

Today’s timestamps are capped at the first run's captured instant, including immediately after Colombo midnight, so the seed never creates future check-ins or sales. Historical invoices and inventory opening movements precede their relevant receipts/sales. Record insertion can occur now while the explicitly recorded business event date is historical; it is not presented as a previously executed live transaction.

## Financial safeguards and service reuse

- A membership period and its invoice are created together in the existing financial transaction helper using `createInvoiceForMembership`. Historical snapshot imports use the actual models, date calculations, overlap checks and uniqueness indexes. No application HTTP backdating rule is weakened.
- Membership payments use the **same extracted ledger transaction** as `POST /api/payments`: existing idempotency check, financial-day lock/revision, conditional invoice balance increment and payment append in one session. The controller still takes one server timestamp; strict HTTP validation rejects timestamp injection.
- Product opening stock, restocking/adjustment and checkout reuse `createProduct`, `changeStock` and `checkout`. Their server prices, stock versions, idempotency, movement creation and atomic sale/stock transaction remain intact. Internal timestamp arguments are not accepted by HTTP request schemas.
- Expenses use `createExpense`; closures use `previewDay` and `closeDay` with the current revision. Actual ledger totals must match the generated, reviewed snapshot before a new closing is permitted. Membership and POS ledgers remain separate and enter combined collections exactly once.
- All financial entries are imported **before** historical closing operations. Existing service day guards reject closed dates, including historical payment/POS writes. A completed closure is either recognized by its stable request key and matching snapshot or rejected; it is never recomputed or overwritten.
- Twelve historical dates are closed. **Yesterday and today stay open** for demo payment, POS, expense and cash-count workflows. Opening cash carries forward from each prior physical closing count, starting at LKR 15,000. One explained fictional LKR 100 shortage exercises discrepancy display.
- Closings are created at seed execution time for historical dates; their timestamp truthfully reflects this backlog/demo snapshot creation. No old closing timestamps or historical records are rewritten.
- The raw-document writer has an explicit nonfinancial allowlist. It cannot write payment, invoice, retail-sale, stock-movement, expense, financial-day or cash-closing ledgers. Expense references have their own validation path for an unlinked existing eligible expense and completed matching work order.

Before marking the dataset complete, the Mongo adapter verifies persisted invoice/payment balances, retail line totals, every product's chronological movement chain and final stock, all 14 source/method ledger totals, and closed-day reconciliations. **All these persisted checks passed on the real isolated MongoDB connection.** This verifies the seeded scenario; it does not establish production rollback/concurrency guarantees.

## Repeatability, partial failures and ownership

- Stable namespace: `warrior-fitness-demo-v1`. Members/assets/nonfinancial history use deterministic ObjectIds; financial operations use stable UUIDs or existing unique natural keys. Retail products resolve by their demo SKU and owner; invoices resolve by their purchased membership. No wildcard deletion or database cleanup exists.
- Before any write, the URI must explicitly name `warrior_fitness_demo`, the actual connected database must have that exact identity, production mode must be absent, the local config must be ignored/untracked, the topology must support transactions, and a first-use database must be empty. Existing records without this seeder's ownership manifest cause refusal.
- Only then are collections/indexes initialized. Existing unique indexes are created explicitly; `syncIndexes`, index drops, database drops and collection wipes are not used.
- The first apply stores its exact date/time anchor and plan fingerprint. Interrupted runs regenerate that same plan, reuse existing documents/service idempotency keys and resume. A lost response does not imply a lost write; a retry recognizes the committed operation.
- A five-minute renewable lease prevents overlapping seeder runs. Every operation checks current identity and lease ownership. A normal failure releases its own lease; a killed process leaves a lease that expires after five minutes. These concurrency/failure behaviors are covered with mocks, **not live Mongo concurrency verification**. The successful seed's released lease was independently read back, and a completed real rerun created no duplicates.
- Completed reruns report all planned records skipped and perform no application writes. They do not reset passwords, restore stock or overwrite changes made while exploring the app. Missing or deliberately altered records are not automatically “repaired.”
- **The anchor is intentionally frozen after first use.** Running next week preserves last week's history instead of silently moving financial records into new dates. It does not automatically append a fresh rolling week. Use the app's normal workflows for ongoing activity; a new snapshot requires an independently empty disposable environment using the same dedicated database name, not a cleanup/reset of existing financial history. The command warns when a stored anchor differs from today.
- A changed generator fingerprint refuses continuation of an old incomplete dataset. Investigate/version it; do not force overwrites. Do not use the frontend against a partially seeded dataset or run it while seeding.
- Counts report confirmed created/skipped operations. If a connection fails after an unknown commit, the interrupted operation is reported failed and the next retry determines whether it was already committed. Verification failure leaves the manifest incomplete and prints a failure summary. Raw Mongo errors/connection strings are never printed.

## Verification results and remaining checks

- Backend `npm test`: **716 passing tests** across 27 files.
- Frontend `npm test`: **284 passing tests** across 14 files.
- Total: **1,000 passing automated tests**, preserving the 943 tests present before this task.
- Backend and frontend `npm run build`: passed.
- Frontend `npm run lint`: passed.
- Offline default/dry-run command: passed; no configuration or database required.
- Read-only `--check`: passed against the actual empty `warrior_fitness_demo` database after local configuration was prepared.
- Real `--apply`: passed with 1,018 created, zero skipped/failed; persisted reconciliation passed. Independent count read-back confirmed all modules and the normal database's three members.
- Completed real rerun: zero created, 1,018 skipped, zero failed; all persisted counts unchanged afterward.
- Live Chrome: 6/6 passed against the running demo backend and Vite frontend, including desktop/mobile, with no mocked APIs, unexpected API errors or runtime errors.
- `git diff --check` and checks of all new files: passed. No commit, push or merge.

New tests exercise stable identifiers and full reruns, partial-commit resumption, pinned anchors, wrong/unverifiable database identities, normal-URI fallback refusal, production refusal, first-use ownership, transaction topology, lease loss, secret-safe failures, Colombo midnight/month/year/leap boundaries, schema validity, references, purchased dates, attendance coverage, invoice balances, exact source/method cash reconciliation, retail stock chains, consented simulated reminder milestones, and delegation to existing financial services. Existing payment/POS tests additionally verify that internal historical timestamps still lock the correct date and cannot bypass closed-day protection; HTTP timestamp injection remains rejected.

Live seed commits, index creation and persisted financial/stock/count reconciliation are now verified. Live rollback, injected failures, network-failure recovery and concurrent write behavior remain unverified; they were not exercised during population. Browser/manual scenarios for this isolated dataset are:

1. Admin Command Center: active coverage, today’s membership/POS/combined collections, all seven trend dates, balances, stock/service/fault/follow-up queues, simulated automation failure and open cash-closing state.
2. Member profile → renewal, paid/partial/overdue invoices and valid attendance history. Compare today’s displayed figures with Daily Cash Closing.
3. Retail inventory → restock/history; POS checkout → receipt; all stock changes remain traceable.
4. Equipment detail → fault/maintenance/downtime history and the verified expense reference, with estimates separate from actual expense amounts.
5. Notification consent/history shows only SIMULATED examples. Restricted desk/Receptionist dashboards and routes hide Admin-only data.
6. Re-run `--apply`: zero application records created, all planned records skipped, no changed passwords/stock/financial history. Compare persisted counts and source totals before and after.

## File inventory for this task

| File | Purpose |
| --- | --- |
| `server/package.json` | Retains optional `seed:demo`; normal startup is `npm run dev`; the historical special launcher was removed |
| `server/src/scripts/seedDemo.ts` | Dry-run/check/apply CLI, sanitized reporting and disconnect |
| `server/src/scripts/runDemoServer.ts` | Historical launcher, removed during final simplification; runtime now uses the ordinary `server/src/server.ts` and `.env` |
| `server/src/scripts/demo/demo.config.ts` | Explicit ignored configuration, CLI flags, exact target policy and error sanitization |
| `server/src/scripts/demo/demo.connection.ts` | Read-only connection/identity/topology/first-use ownership checks |
| `server/src/scripts/demo/demo.plan.ts` | Deterministic fictional dataset, Colombo-relative dates, references and financial expectations |
| `server/src/scripts/demo/demo.runner.ts` | Repeat/resume orchestration, progress, failures and completion contract |
| `server/src/scripts/demo/demo.store.ts` | Guarded Mongo persistence, service delegation, lease and persisted reconciliation checks |
| `server/src/modules/billing/payment.controller.ts` | Extracts the existing guarded transaction for reuse without changing HTTP behavior |
| `server/src/modules/billing/invoice.service.ts` | Optional internal issue timestamp for historical demo purchases |
| `server/src/modules/retail/retail.service.ts` | Optional internal event timestamps; existing transactions/validation unchanged |
| `server/src/modules/notifications/notification.eligibility.ts` | Extracted pure eligibility/message helpers usable without loading app config |
| `server/src/modules/notifications/notification.service.ts` | Reuses/re-exports the same helpers and type; existing API contract preserved |
| `server/tests/demo.plan.test.ts` | Complete dataset, schemas, dates, references, money/stock/consent consistency |
| `server/tests/demo.runner.test.ts` | Rerun/resume/lease/failure/pinned-anchor behavior with an in-memory store |
| `server/tests/demo.safety.test.ts` | Configuration/identity/ownership/topology/write-gate/sanitization tests |
| `server/tests/demo.store.test.ts` | Mocked persistence/service boundary and immutable closing checks |
| `server/tests/payment.closing.test.ts` | Historical payment time still uses the guarded transaction |
| `server/tests/retail.service.test.ts` | Historical retail timestamps preserve stock/day safeguards |
| `docs/sprints/demo-data.md` | Setup, actual execution status, planned counts, safeguards and limitations |

Portfolio/demo completion and Git finalization are authorized. Do not reset data, run the seeder or begin another feature as part of this release.
