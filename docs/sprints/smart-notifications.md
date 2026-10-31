# Smart Notifications — First Working Slice

Status: IMPLEMENTED ON FEATURE BRANCH, NOT MERGED OR PRODUCTION-VERIFIED.

Scope: Admin-only notification center, explicit WhatsApp opt-in, three membership expiry reminder milestones (7 days, 3 days and the final valid day), persisted simulated delivery history, duplicate prevention by compound unique index, and no external delivery. This feature does **not** automatically execute on a timed schedule yet. It is manually triggered from the dashboard, and no WhatsApp messages are transmitted.

Endpoints: `GET /api/notifications/overview`, `GET /api/notifications/consent/:memberId`, `PUT /api/notifications/consent`, `POST /api/notifications/simulate-due`. All require authenticated ADMIN and `settings.manage`.

Only the latest purchased membership per member is eligible, avoiding reminders for previously renewed memberships. Consent is stored separately and defaults to not opted in. Missing phone numbers, inactive members, and non-milestone dates are skipped.

Required follow-up before real delivery: review consent proof/audit approach, implement opt-out and delivery governance, approved WhatsApp templates, secure provider credentials, scheduler/worker, retries/failures, and real database integration tests. Never represent SIMULATED as SENT.
