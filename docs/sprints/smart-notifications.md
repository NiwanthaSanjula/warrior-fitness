# Smart Notifications — Notification Center

Status: **COMPLETED FOR PORTFOLIO/DEMO — final PM approval received.**

Approval covers the simulation-only Notification Center and opt-in reminder scheduler. Real database persistence, unique-index concurrency and scheduled execution against a database remain unverified; this approval does not establish production readiness or authorize real WhatsApp delivery.

Started from a clean `develop`, fetched origin, verified remote commit `0537c21ac140a04e61a237c6358e22a2e542ed8c`, and created the local tracking branch `feature/smart-notifications`. The branch contains the approved Staff Management merge. Final PM authorization permits committing the 19 approved files, pushing this feature branch and merging/pushing `develop` after passing release checks. Preserve the feature branch and leave `main` unchanged.

## Working scope

- Admin-only `/notifications`, navigation, consent management, membership reminders and latest 50 simulation history entries.
- Member search reuses `membersApi.getMembers`: names, phones and member numbers; record-ID lookup remains supported. Confirmation is bound to the loaded member, with cancellation of stale lookups when selection changes.
- Consent defaults to off. Explicit opt-in acknowledgement is required in the UI and API; revocation is available with confirmation. The last preference stores its responsible Admin and timestamp. Inactive members and missing/blank phone numbers are excluded from simulations.
- Milestones are 7 days, 3 days and the final valid day. `startDate` remains inclusive and `endDateExclusive` exclusive; last valid date is `endDateExclusive - 1 day`. Reuse the existing Colombo calendar helpers without modifying membership calculations or snapshots.
- Match Attention Center's final-purchased-coverage policy: require a period covering today and evaluate the latest ending purchased period, including future renewals. A renewed old period is not reminded; an upcoming renewal can have a valid milestone while current coverage is active. Future-only and expired memberships are excluded.
- Manual and scheduled simulation reuse the same eligibility engine, recheck consent/status before each log and share reminder-key duplicate prevention. Overview uses one captured Colombo date for queue and totals. Eligible-today counts include already simulated reminders; history/totals distinguish recorded simulations.
- Independent consent and overview loading/error/retry states, genuine empty results, unavailable metrics on failure, refresh, member workflow links and responsive charcoal/orange styling. No statistics are fabricated after failed reads.

## APIs and safety

All four existing endpoints require authenticated **ADMIN** and `settings.manage`. Receptionists are rejected even with a forged grant. No public registration or new authentication system.

| Endpoint | Contract |
| --- | --- |
| `GET /api/notifications/overview` | Colombo `asOfDate`, eligible reminders, simulated-today count, latest 50 history rows and automatic-scheduler configuration/last recorded run |
| `GET /api/notifications/consent/:memberId` | Member-bound preference, name and last-recorded timestamp; missing preference means false |
| `PUT /api/notifications/consent` | Strict `memberId`, boolean `whatsappOptIn`, and `confirmedOptIn: true` when enabling; actor comes from authentication |
| `POST /api/notifications/simulate-due` | No body overrides; returns simulated/duplicate/skipped counts, `realMessagesSent: 0` and `SIMULATION_ONLY` |

- Corrected backend Mongoose typing and the history DTO: explicit `id`, `memberId`, `membershipId`, `createdBy`, ISO creation time and fixed simulation enums match the client types. No raw MongoDB documents are exposed by the overview.
- Each log uses `$setOnInsert` with the unique `(membership, reminderType, scheduledDate)` key. Repeat requests preserve historical fields/creation timestamps. A racing duplicate-key error is counted only if that exact reminder exists. Other failures propagate.
- Startup awaits all notification-model indexes before accepting requests. This is code wiring only: no application startup, index creation, migration, database connection or database write was performed during implementation.
- The simulation implementation has no outbound provider/client, credential lookup, external URL or delivery toggle. Only `WHATSAPP_SIMULATED` / `SIMULATED` values are accepted by the model. Recipient/date/real-delivery overrides are rejected by the API. No WhatsApp message is sent.
- A batch is not a transaction. Partial simulated logs can remain after a later failure; the UI explains this and refreshes history. Retrying uses the same reminder identities and does not overwrite existing logs.

## Automatic simulation scheduling

- Opt-in setting: `NOTIFICATION_SCHEDULER_ENABLED=true`. Omitted or literal `false` disables scheduling. Only the exact strings `true` and `false` are valid; ambiguous values fail environment validation. Configure it locally only when execution is intended, then restart the backend. No actual `.env` file was read, changed or enabled during this task.
- Run daily at **9:00 AM Asia/Colombo**, resolved with IANA timezone data rather than the host timezone. The timer is armed explicitly after database/model-index initialization and the API starts listening; importing modules never starts a job. `NODE_ENV=test` or a Vitest runner blocks runtime scheduling even if the setting is true. Unit tests exercise injected virtual timers only.
- The scheduler operates **only while the backend process is running**. Startup after today's 9 AM slot attempts same-day catch-up; startup before 9 AM waits for that slot. It does not backfill older dates. Process suspension, event-loop delays or downtime can delay/miss execution. No external cron service, queue or provider is configured.
- A unique `NotificationRun.scheduledDate` claim allows only one automatic attempt per Colombo day across restarts/instances. A completed, failed or unconfirmed existing claim is not rerun automatically that day. Individual reminder compound keys also protect concurrent manual/automatic runs and repeat requests. All required indexes are awaited at normal application startup.
- Automatic logs use `trigger: SCHEDULED` and nullable `createdBy`, rather than impersonating an Admin. Manual logs retain their authenticated Admin and `trigger: MANUAL`; older records without the field are presented as manual without rewriting history. Actor validation supports both document and upsert-query contexts.
- Run metadata stores start time, completion time, `RUNNING` / `SUCCEEDED` / `FAILED`, simulation counts and a fixed sanitized failure code. These are job outcomes, not delivery statuses. All notification records remain `SIMULATED`; no real messages are sent.
- Job/storage failures are caught, logged without raw error bodies or member details, and the next daily slot is armed. Same-day recovery is available through manual simulation. A partially completed batch keeps its log records and safely deduplicates repeats. An interrupted process may leave `RUNNING`; the dashboard explicitly labels completion unconfirmed instead of asserting success or a live running process.
- The dashboard shows enabled/disabled state, next daily slot, last recorded automatic status/times/counts, and automatic/manual sources in history. If execution metadata cannot be read, it says unavailable while reminder/consent workflows remain usable. The next slot describes the configured daily schedule, not an uptime guarantee.

## Files changed in this completion pass

- `server/src/modules/notifications/notification.service.ts`: eligible-period selection, typed reads/DTOs, consent operations, fresh eligibility, opt-in/status rechecks and duplicate-safe simulation.
- `notification.routes.ts`, `notification.model.ts` in that module: strict validation, affirmative confirmation, simulation-only types and startup index initializer.
- `server/src/server.ts`: await notification indexes before listening; authentication, membership and financial startup behavior otherwise preserved.
- `server/src/config/env.ts`: validated, disabled-by-default scheduler flag; no database configuration values changed.
- `server/src/modules/notifications/notification.schedule.ts`: timezone-aware next-slot calculation and serial, stoppable daily timer core.
- `notification.scheduler.ts`, `notification-run.model.ts`, `notification.scheduler-status.ts` in that module: runtime test guard, durable unique daily claim, shared engine execution, sanitized failure persistence and truthful status DTOs.
- `client/src/api/notifications.api.ts`: typed API/response contracts and abort signals.
- `client/src/pages/NotificationsPage.tsx`: protected, resource-based overview, reminders, simulation results and history.
- `client/src/components/notifications/ConsentPanel.tsx`: existing member-search reuse, bound consent selection, explicit opt-in, revocation, retry and confirmation controls.
- `client/src/components/notifications/AutomaticSimulation.tsx`: scheduler state, next slot and reliable execution metadata without delivery claims.
- `server/tests/notifications.service.test.ts`, `notifications.routes.test.ts`: reminder/consent/duplicate/security scenarios with mocked persistence.
- `server/tests/notification.scheduler.test.ts`: configuration, timer boundaries, startup catch-up, test isolation, unique-claim conflicts, failure containment and recorded status. Existing service tests also run scheduled calls through real eligibility logic and perform actual offline Mongoose actor validation for documents/upsert queries.
- `client/tests/notifications.test.tsx`, `client/tests/fixtures/notifications.ts`: real routing/page tests with fictional API fixtures.
- This tracker records scope, validation and remaining gaps. Existing route/sidebar wiring from the remote commit is preserved and tested.

## Verification

- Backend `npm test`: **400 passed** across 16 suites.
- Frontend `npm test`: **167 passed** across 8 suites.
- **567 total**, preserving the previous 515 cases and adding 52 automation/validation/UI cases; zero failed/skipped.
- `npm run build` in both packages and frontend `npm run lint`: **PASS**. The existing non-blocking Vite chunk-size warning remains (approximately 728 kB main bundle).
- `git diff --check` and scope/secret review include new files. No dependency, lockfile, credential or actual environment-file changes; the environment-validation source now defines the scheduler setting.
- Coverage includes absent/affirmative/revoked consent, missing/inactive members and phones, inclusive/exclusive dates, Colombo midnight and month/leap/year boundaries, future renewals, stale previews, duplicate/error handling, strict overrides, Admin authorization, frontend navigation, stale member lookup cancellation, explicit opt-in, failed writes, loading/empty/error/retry/refresh and double-submission protection.
- Existing database/network isolation guards remained enabled. The simulation test explicitly verifies no fetch call; unexpected sockets/network access fail the suites. Persistence and duplicate races are mocked: these are not live MongoDB uniqueness, rollback or concurrency results.
- Scheduling coverage includes disabled settings, invalid flags, test-runner suppression, exactly 9 AM, Colombo midnight, month/leap/year boundaries, restart catch-up, no older-day backfill, non-overlap, shutdown, daily claims, mocked competing callers, renewed memberships, missing consent, failed engine/claim/status writes and unavailable run history.
- **14/14 real headless Chrome browser scenarios passed with fictional mocked APIs**: desktop 1440 × 1000 and mobile 390 × 844 / 320 × 640. Reviewed screenshots; no horizontal overflow or browser runtime exceptions. Checked enabled/disabled/failed/unconfirmed/unavailable schedule states, next-slot Colombo formatting, source labels, member search, explicit consent/revocation, manual simulation/duplicate repeat, mobile navigation, loading, overview failure/retry, Receptionist denial without notification API calls and unauthenticated login redirect.
- Browser API requests were intercepted before reaching a backend. The local server served built static assets only and rejected unintercepted APIs; no MongoDB connection or financial data was involved. Temporary screenshots/report are outside Git at `C:/Users/niwan/AppData/Local/Temp/warrior-notification-automation-NzGZDy/`. These browser results simulate API contracts and do not verify real job timing or persistence.

## Remaining gaps and manual acceptance

- No live database verification, Atlas troubleshooting or financial-data access. Test real persistence/index uniqueness and concurrent renewal/consent/log races only in a separately authorized isolated database. Consent/status rechecks are not an atomic real-delivery consent lock.
- The in-process scheduler is implemented; external job infrastructure, older-day backfill, automatic same-day retries of failed/interrupted claims, provider integration and real message delivery remain out of scope. Future real delivery requires separate approval, consent evidence/retention and delivery governance, approved templates, opt-out handling and secure provider integration. Current consent records are latest-state metadata, not a full consent-proof audit trail.
- Browser acceptance passed against mocked APIs. Actual index/claim concurrency and real scheduled persistence remain unverified; do not infer production readiness from mock-based tests. No scheduler was enabled against an application database during this work.
- Final PM approval marks this feature **COMPLETED FOR PORTFOLIO/DEMO**. Authorized release operations: commit `feat(notifications): implement smart membership reminder automation`, push `feature/smart-notifications`, merge into `develop` and push `origin/develop`, preserving the feature branch. No force operations, changes to `main`, WhatsApp configuration, database access, financial-record changes or next feature. Stop after final Git verification.
