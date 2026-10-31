# Staff permissions and session security (S8-03)

## Permission policy

`server/src/modules/auth/permissions.ts` is the authoritative catalogue and role-default resolver. Login and `/api/auth/me` return effective `permissions` alongside the existing public staff fields. Session versions and password hashes are not returned in those JSON bodies.

- ADMIN receives every known permission, regardless of any stored list.
- RECEPTIONIST with no stored `permissions` retains all previously available Receptionist operations.
- An explicit `permissions: []` grants no business operations. Authentication, logout, and the empty dashboard landing page remain available.
- An explicit list grants only listed Receptionist capabilities; it does not merge with defaults. Unknown/Admin-only keys never elevate Receptionist access.
- The Mongoose array deliberately defaults to `undefined`, not `[]`. No bulk backfill is required or performed.

| Capability | Permission keys |
| --- | --- |
| Members | `members.read`, `members.create`, `members.update` |
| Plans | `plans.read` |
| Memberships | `memberships.read`, `memberships.enroll`, `memberships.renew` |
| Billing | `invoices.read`, `invoices.create`, `payments.read`, `payments.record` |
| Attendance | `attendance.read`, `attendance.check-in` |
| Attention | `attention.read`, `follow-ups.read`, `follow-ups.create` |
| Admin only | `members.status`, `plans.manage`, `staff.manage`, `reports.read`, `settings.manage` |

Every protected business endpoint now checks its capability before its controller. Existing Admin-only role guards remain in place, including staff management, all six report endpoints, member status, and plan management. Operational billing reads remain customizable; financial report routes remain Admin-only.

`attention.read` includes the existing expiry, outstanding-payment, and attendance-inactivity queues. Membership enrollment/renewal permissions include their existing transactional invoice creation; `invoices.create` controls the separate invoice-creation API. These business transactions were not split or changed.

The frontend consumes effective permissions rather than inventing role defaults. Its Permission wire type is checked against the server catalogue in tests. Route guards, sidebar visibility, and primary create/edit/check-in/payment/follow-up actions enforce the relevant permissions. Read-only member and invoice views avoid requesting restricted panels.

Some screens require read prerequisites in addition to a write permission: membership management loads member/membership data and needs plan-read access to offer a purchase; check-in UI needs attendance-read and membership-read access to display eligibility; receipts read invoice/payment/member data. API write permissions still protect their specific operations independently. S8-05 should make these prerequisites clear when assigning staff access.

## Session versioning and logout

The existing HttpOnly `wf_session` cookie, `/api` path, SameSite=Lax policy, production Secure flag, issuer/audience/algorithm validation, and eight-hour lifetime are preserved.

- New JWTs contain the persisted numeric `sessionVersion`; absent legacy staff fields are treated as version zero.
- Authentication loads current staff, checks active status, and requires the signed version to equal the current account version.
- Invalid, expired, versionless, and revoked tokens are rejected with 401; unavailable session cookies are cleared.
- A logout with a valid token conditionally increments the account version using `$inc`, then clears the cookie. Every token at the old version becomes invalid, including tokens on other devices.
- The update matches the presented version, so a delayed/repeated stale logout cannot revoke a newer-version login. Missing/invalid logout cookies remain an idempotent cookie-clearing response.
- A database failure during revocation propagates as a failure; logout does not falsely report successful revocation.

`staff-security.service.ts` provides the shared Admin-only security-write service for later staff management. Role, permissions, password hash, and active status are written together with a version increment in one conditional `findOneAndUpdate`. The expected version prevents stale concurrent overwrites; a conflict returns 409. Version-zero filters also match legacy records with no persisted counter.

Passing `permissions: null` to that internal service unsets the override and restores role defaults; `[]` denies all business operations. Deactivation and reactivation both increment the version, so reactivation cannot revive old tokens.

No staff-edit endpoint or Staff Management UI is added in S8-03. S8-05 must use this service and add its approved password validation/hashing, self/last-Admin safeguards, and management API/UI. Raw MongoDB edits and model saves bypass the service and are not a supported security-update path.

MongoDB single-document updates provide the atomic write boundary; the tests inspect these conditional update shapes using mocks, rather than accessing MongoDB. See [Mongoose update documentation](https://mongoosejs.com/docs/api/query.html) and [OWASP logout guidance](https://owasp.github.io/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/06-Session_Management/06-Logout_Functionality).

## Rollout compatibility

**All existing versionless JWTs require a one-time re-login after deployment.** The signing key and cookie name do not need to change. Staff records do not need a data migration: missing permissions inherit role defaults and missing versions act as zero.

Deploy the matching backend/frontend together (or backend first) because the frontend expects effective permissions in authentication responses. Do not roll the backend back to versionless authentication while relying on revocation guarantees.

Protected API 401 responses clear frontend authentication state and return users through the existing login guard. Ordinary 403 permission denials and invalid-login responses do not clear unrelated authenticated state. Focus revalidation refreshes session/access information; transient network failures during that refresh preserve the known session. Pending restoration responses cannot restore staff after a newer logout/401 transition.

Authorization is checked at the start of a request. This change does not cancel operations already authorized/in progress and does not alter payment, membership, attendance, or reporting calculations.

## Verification and remaining manual checks

Run `npm test` and `npm run build` in both packages, `npm run lint` in client, and `git diff --check` from the root. Tests continue using the [S8-02 isolation setup](authentication-authorization.md): no real database or external application API connections.

Added coverage includes catalogue/default/empty-list behavior, explicit grants across every business route, Admin-only privilege-injection attempts, real login/versioned logout, expired/malformed/versionless/revoked tokens, conditional security updates, deactivate/reactivate, role/permission/password revocation, frontend restricted routes/navigation/actions, read-only panels, and actual Axios interceptor/AuthProvider handling.

Final S8-03 execution: **200 passed, zero failed/skipped** (153 backend across seven test files; 47 frontend across four). Both builds, frontend ESLint, and the Git whitespace check passed. The original 72 test cases remain; their expected cookie-token/auth JSON/role-change results were updated only where S8-03 intentionally changes security behavior.

Persistence methods and business calculation controllers are mocked where authorization is under test. Conditional MongoDB updates and deployment behavior are not validated by this mocked suite. Codex performed no manual browser or live database verification; the user subsequently confirmed all four manual browser acceptance checks passed, as recorded with final S8-03 approval in the sprint tracker.

Manual acceptance with approved fixtures should cover legacy Receptionist access after re-login, restricted/read-only/empty-list views, two-browser all-session logout, expired/revoked session redirects, and Admin reports/settings access. Staff management changes are exercised through the internal service in automated tests until S8-05 introduces the management API/UI.
