# Gym POS & Retail Inventory

Status: **COMPLETED FOR PORTFOLIO/DEMO — approved by the Project Manager.**

Final approval authorizes the POS feature commit, feature push and merge into `develop`, preserving the feature branch and leaving `main` unchanged. This approval is limited to portfolio/demo release. Live MongoDB verification, physical scanner/printer tests, recorded-only card/bank payments and the existing bundle-size warning remain documented below; production financial use is not approved.

## Scope and branch

- Started with a clean `develop`, fetched origin, updated with `git pull --ff-only origin develop`, and created `feature/pos-retail` from Equipment Operations merge `a3b2142135204f72a1a47319c17cc75e2bd0b1fd`.
- This task implements product administration, barcode/SKU checkout, stock movements, immutable retail receipts, retail reporting and retail inclusion in Daily Cash Closing. Existing membership payments, invoices, expenses and previous closing snapshots are preserved.
- No dependencies were installed, environment configuration loaded/changed, live databases accessed, or Atlas troubleshooting attempted. Finalization is limited to the approved POS commit, feature push and merge into `develop`; no PR or subsequent feature work is included. `main` remains unchanged.

## Implemented screens and workflows

| Screen | Workflow |
| --- | --- |
| `/retail/checkout` | Product search/category filters, scanner input, cart quantities/removal, cash/change, card/bank transfer, optional member, checkout recovery and receipt printing |
| `/retail/products` | Active catalog for permitted staff; Admin product registration/editing, supplier details, activation, restocking and reasoned adjustments |
| `/retail/products?product=<id>` | Selected product details and Admin stock movement history with before/after quantities, actor, reason and sale links |
| `/retail/sales` | Searchable, date/method-filtered paginated sales history; Receptionists see their own transactions only |
| `/retail/sales/:id` | Immutable, reprintable receipt; server enforces cashier ownership for Receptionists |
| `/retail` | Admin Retail Command Center: today's sales, period revenue/units, payment-method chart, daily trend, best sellers, restocking queues and recent transactions |

The existing sidebar now has one POS & Retail disclosure. It expands for child routes and preserves keyboard/mobile behavior and the charcoal/orange theme. Screens use the existing Axios client and independent loading, empty, error, retry and refresh states where they have separate resources. Reports never substitute failed requests with zero revenue.

## Product and inventory rules

- Categories: Supplements, Beverages, Snacks, Accessories, Merchandise and Other. Prices are positive whole LKR, bounded to LKR 10,000,000 per unit. Products include unique SKU, optional unique barcode, quantity, low-stock threshold, supplier/contact and active status.
- Codes are normalized to trimmed uppercase strings. Barcodes retain leading zeroes. MongoDB has unique SKU and partial unique non-null barcode indexes; inactive products still reserve their codes. Product names/codes/prices may change without changing historical sale/movement snapshots.
- Product registration appends an opening movement, including zero opening stock. Profile edits cannot set stock. Restocking adds units; adjustments require a nonzero signed quantity and a reason of at least five characters. Stock remains between zero and 10,000,000 units.
- Restocking/adjustment uses product version plus original quantity conditions and records an immutable movement in the same transaction. Its UUID request key and fingerprint prevent repeating the same operation while the current form retains its request. An uncertain stock response freezes that form for an exact retry; keep it open and inspect history before starting a replacement request after navigation/reload.
- Sales append stock deductions with links to their immutable sale. There are no destructive product, movement or sale APIs. Inactivate products instead of deleting them. Supplier costs/restocking do not automatically create expenses; this release does not provide a restocking expense-reference field.

## Checkout and financial integrity

- The cart submits product IDs, integer quantities, expected unit-price/total assertions, one method, cash tender if applicable, optional member ID/reference and a UUID idempotency key. It cannot supply cashier identity, sale date, authoritative amount, line totals, change, discounts or split payments.
- The server loads active products, checks current price and stock, calculates each line and the complete whole-LKR total, and checks the displayed-price assertions. A changed price/stock returns HTTP 409 so the cashier reviews refreshed prices rather than accepting an unexpected charge. Carts are limited to 50 distinct products and 1,000 units per line; totals/cash tender are bounded to LKR 1,000,000,000.
- Cash tender must cover the total; change equals tender minus total. Card/bank sales cannot carry cash tender. All methods represent payment recorded by the cashier; this module does not charge a card, contact a bank or implement a payment gateway. The cashier collects non-cash payments through the gym's existing process.
- Optional membership association requires `members.read` and an existing active member. Walk-in checkout needs no member or membership invoice. The receipt retains the selected member's name/reference without copying other member personal data.
- A separate append-only `RetailSale` document is the retail money posting. It captures products, SKU/barcode/name/price snapshots, quantities, totals, method, tender/change, optional reference/customer, cashier and server timestamp. It never creates a membership Invoice or Payment or a duplicate second retail payment record.
- Checkout reuses `financialTransaction` and `lockOpenFinancialDay`. Within one snapshot/majority transaction it checks idempotency, increments/checks the financial day, verifies products/member, conditionally deducts stock, appends movements and saves the sale ledger entry. All operations on a transaction session are sequential. All cart lines are checked before stock writes; products are processed in ID order.
- Each deduction requires an active product, unchanged version/price and `stock >= quantity`, then atomically decrements units/increments version. Stock/admin edits participate in the same product version discipline. An unsuccessful deduction, movement save or sale save fails the transaction callback rather than returning success.
- Unique sale/request/movement keys complement the shared bounded duplicate-key retry mechanism. Exact replay returns the original sale before day/stock writes, including after closing or a product/price change. The fingerprint includes cashier and purchase details; reusing a key for a different purchase or actor is rejected. Never retry an uncertain purchase with a new key.
- Sale time and Colombo financial date come exclusively from one server timestamp captured before retries, consistent with existing membership payment handling. Client sale dates are rejected. New sales on a closed date fail through the same day lock used by membership payments, expenses and closing; their revision changes invalidate stale closing previews.

## Daily closing compatibility

- `DayTotals.collections` remains the reconciliation total and now combines the membership Payment ledger with the separate RetailSale ledger exactly once. New previews/snapshots also contain `membershipCollections`, `retailCollections` and `retailSaleCount`. Existing `paymentCount` still counts membership payments; it does not silently change meaning.
- Expected cash = opening cash + membership cash + retail cash − cash expenses. Retail contributes its paid sale amount, not full cash tender; customer change never inflates collections. Card/bank amounts remain separate from physical cash.
- Daily Cash Closing and stored snapshot screens show membership, POS, combined collections and expenses by method. Discrepancies still require explanations. The shared financial-day revision/closed-marker guards and append-only closing/expense protections remain intact.
- New breakdown fields are optional with no defaults/backfill on historical closing records. Completed previews return the stored snapshot without querying any live ledger. Old membership-only snapshots retain their original amounts and receive an explanatory UI label; they are never recomputed to include later retail data.
- Existing membership Reports APIs/calculations remain membership-only; the overview/report captions clarify their source. Retail has its own reports, and Daily Cash Closing provides the combined collection totals. Outstanding membership balances and renewals are unchanged.

## Permissions and browser recovery

- Admin has full retail access. Receptionist role defaults add `retail.read`, `retail.checkout` and `retail.sales.read`; `retail.manage` is Admin-only. Missing legacy overrides receive role defaults, custom lists remain exact and explicit `[]` remains deny-all. Staff Management exposes the new assignable options through its existing catalogue; permission edits continue using the existing security/session-revocation service.
- All endpoints authenticate. Checkout requires both read/checkout grants. Product/stock/report administration requires the Admin role, regardless of forged permission strings. Supplier details and thresholds are excluded from Receptionist DTOs. Receipt/history predicates enforce cashier ownership on the server, and queries cannot override cashier ID.
- The frontend never requests Admin reports or movement history as a Receptionist. Member search is hidden and not requested without `members.read`. A checkout-only cashier can print the returned receipt without being granted general sales-history access.
- USB keyboard scanners use the dedicated barcode/SKU form with an Enter suffix. `Alt+B` focuses it; Enter does a lookup, never finalizes payment. Exact barcode lookup is followed by exact SKU lookup when needed, with normal searchable catalog browsing available.
- Before checkout, the browser saves the exact validated pending payload under a staff-ID-scoped `sessionStorage` key. It contains no authentication credentials or customer names. A lost/5xx response freezes the cart and preserves the key across reload for the same cashier; retry recovers the original receipt without another charge/deduction. Pending authorization failures retain recovery rather than assuming an earlier attempt failed. Confirmed business rejections release it for cart review.
- Checkout is blocked if recovery storage cannot be written or contains corrupt pending data. After reviewing sale history, an administrator can assist with local browser recovery. Closing the browser session, clearing storage or switching devices can lose this local recovery aid: review receipts/history before starting a replacement purchase. Server keys remain the authoritative duplicate protection.
- Product registration is not idempotent; review the catalog after an uncertain response. Unique SKU/barcode checks prevent normal duplicate registration attempts. Stock-form recovery is retained only while that form remains mounted.

## API surface

All routes are under `/api/retail`, use strict request validation and bound pagination/search lengths. Prices/quantities and financial totals are whole numbers. There are no update/delete sale routes.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/products` | `retail.read`; Receptionists active products only; name/SKU/barcode search, exact code and category/status/stock filters |
| GET | `/products/:id` | `retail.read`; Receptionists active products only |
| POST / PUT | `/products` / `/products/:id` | Admin + `retail.manage`; create / versioned metadata edit |
| GET | `/products/:id/movements` | Admin + `retail.manage`; paginated history |
| POST | `/products/:id/stock` | Admin + `retail.manage`; versioned/idempotent restock or adjustment |
| POST | `/checkout` | `retail.read` + `retail.checkout` |
| GET | `/sales` / `/sales/:id` | `retail.sales.read`; own receipts only for Receptionists |
| GET | `/dashboard` | Admin + `retail.manage`; date-filtered sales and current stock attention |

## Changed-file map

- `server/src/modules/retail/retail.constants.ts`, `retail.model.ts`, `retail.validation.ts`: product categories/limits, indexed product/sale/movement models, append-only history and strict inputs.
- `server/src/modules/retail/retail.service.ts`: authoritative checkout calculations, idempotency, product/stock mutation, snapshots, redaction and transactional day/stock/ledger coordination.
- `server/src/modules/retail/retail.reads.ts`, `retail.routes.ts`: protected catalog/history/receipt reads, scoped sales, aggregations, queues and API validation/guards.
- `server/src/app.ts`, `server/src/server.ts`: router and startup collection/index initialization. Startup was not run against a database during this task.
- `server/src/modules/auth/permissions.ts`, `server/src/modules/staff/staff-permissions.ts`, `client/src/auth/permissions.ts`: retail catalogue/defaults, Admin-only management and staff checkbox labels.
- `server/src/modules/financial/financial.service.ts`, `cash-closing.model.ts`, `financial-day.service.ts`: separate retail ledger aggregation, optional new closing breakdown fields, source consistency checks and closed-day error wording. No membership ledger or expense model is changed.
- `client/src/types/retail.ts`, `client/src/api/retail.api.ts`, `client/src/validations/retail.schema.ts`, `client/src/utils/retail.ts`: typed contracts/Axios adapters, form validation, cart helpers and per-cashier pending recovery.
- `client/src/components/retail/RetailUI.tsx`, `ProductForms.tsx`, `RetailMemberPicker.tsx`, `RetailReceipt.tsx`: shared states/forms, stock controls, permission-scoped member search and isolated printable receipts.
- `client/src/pages/RetailCheckoutPage.tsx`, `RetailProductsPage.tsx`, `RetailDashboardPage.tsx`, `RetailSalesPage.tsx`, `RetailReceiptPage.tsx`: operational screens listed above.
- `client/src/App.tsx`, `client/src/components/AppLayout.tsx`: guarded routes and one grouped navigation item; existing Finance/Equipment groups remain intact.
- `client/src/types/financial.ts`, `client/src/components/financial/FinancialWidgets.tsx`, `client/src/pages/DailyCashClosingPage.tsx`: membership/POS/combined display and historical snapshot compatibility.
- `client/src/pages/DashboardPage.tsx`, `client/src/pages/ReportsPage.tsx`: source captions clarify that existing reports still cover membership collections; calculations are unchanged.
- `server/tests/retail.service.test.ts`, `retail.reads.test.ts`, `retail.routes.test.ts`, `retail.financial.test.ts`: money/validation, inventory lifecycle, roles/ownership, replay, failure/race mocks, closing integration and history preservation.
- `client/tests/fixtures/retail.ts`, `client/tests/retail.test.tsx`, `client/tests/retail.api.test.ts`: fictional fixtures, rendering/forms/keyboard entry/recovery, permissions, reports, receipts and API contracts.
- `server/tests/financial.service.test.ts`: existing membership-only tests explicitly mock an empty retail ledger. `client/tests/financial.test.tsx`: assertions cover separate source/combined columns while retaining original payment/expense amounts. `client/tests/dashboard.test.tsx`: caption expectation reflects the membership source; its metrics/API tests are unchanged.
- This tracker records implementation, review state and verification without rewriting completed sprint documents.

## Verification and remaining limits

- Final targeted code review confirmed that reconciliation aggregates `RetailSale.amountLkr` once without creating membership payments; completed closings return their stored immutable snapshots; new checkout writes require the shared open-day lock in the same transaction. Exact replays after closing return the original sale without new stock or ledger writes. These code/mock checks do not replace live MongoDB verification.
- Backend: **647 tests passed** (503 existing + 144 retail), including test TypeScript checking; production TypeScript build passed.
- Frontend: **241 tests passed** (198 existing + 43 retail), including test TypeScript checking; TypeScript/Vite build and ESLint passed. Combined: **888 tests**. Existing network/database isolation guards remain enabled; no tests import/start the production server or connect to MongoDB.
- `git diff --check`, new-file whitespace, file scope and secret-pattern checks passed. No package manifests/lockfiles or dependency versions changed. Vite's existing main-bundle-size warning remains; code splitting was not expanded into an unrelated refactor.
- **22 Chrome desktop/mobile scenarios passed** against the built frontend and fictional intercepted APIs, with no runtime exceptions or unexpected external requests. They cover product creation/duplicates/edit/activation, restock/adjustment history, Enter-suffixed barcode input, cart/member/cash change, card/bank sales, receipt-only print-to-PDF, lost-response recovery across reload, price/stock conflicts, loading/error/retry/empty states, own-history access, reports/queues, combined closing/discrepancy validation, closed-day rejection, 390px/320px layouts, long receipt fields, navigation/keyboard controls, restricted permissions and guest login.
- Browser review also checks the mobile scanner field has usable full-row width and long receipt text wraps. Browser API mocks exercise UI behavior; their simulated financial state is not evidence of real persistence or server transactions.
- **Live MongoDB verification remains outstanding:** collection/index creation, unique-key enforcement, transaction commit/rollback, parallel-writer retry behavior and coordinated POS/payment/expense/closing races have not been tested on a real database. Unit tests exercise conditional predicates, same-session calls, unique-index definitions, staged mock failure behavior and competing mock checkouts; they do not establish live concurrency/rollback guarantees.
- Deployment needs transaction-capable MongoDB, consistent with existing Finance. Normal startup awaits new retail collections/indexes before accepting writes; no data migration or historical closing backfill is included. Client/server should be deployed together, with staff sessions refreshed to receive the updated permission catalogue.
- Physical USB scanner configuration, actual printers and live isolated end-to-end checkout/closing are manual checks. Use keyboard-wedge mode with an Enter suffix and focus the scanner field. PDF printing was simulated in Chrome; hardware printing was not performed.
- Out of scope: split tender, discounts, tax calculation, refunds, returns, voiding/reopening sales or closings, purchase orders, supplier balances, automatic restock expenses, payment gateways, offline selling and cross-device pending recovery.
- This implementation is approved for portfolio/demo release and is not approved for production financial use. Real database verification requires a separate, explicitly authorized isolated test task. No production/development financial records were modified.

## Manual review

1. Admin: register a fictional product, try duplicate SKU/barcode, edit price/supplier, toggle activation, restock and apply a reasoned correction. Check opening/movement history, stale edit handling, low-stock filters and nonnegative inventory.
2. Receptionist: use a keyboard scanner or type a barcode/SKU and press Enter. Adjust/remove cart lines, test out-of-stock and inadequate cash, then complete cash/card/bank sales with one method. Test walk-in and permitted member selection.
3. Verify cashier, original line prices, totals, tender/change, timestamp and optional customer on the receipt. Print it and reprint from permitted history. Other Receptionists' receipts and Admin controls must remain inaccessible.
4. On a separately approved isolated deployment, verify a sale increases only the retail ledger and combined closing totals; membership invoices/payments and expenses must remain unchanged. Check cash change is excluded from collections, the breakdown is correct, stale previews fail and closed dates reject new sales.
5. Verify reload/retry after an uncertain checkout uses the original key and produces one receipt/stock deduction. Do not repeat an uncertain purchase with a new key or clear browser recovery before reviewing history.
6. Review retail charts, date filters, stock queues, empty/error/retry/refresh and mobile/keyboard navigation. Physical/live-database checks are still outstanding and must not use real financial records without separate authorization.
