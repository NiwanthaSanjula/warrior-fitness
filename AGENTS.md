# Warrior Fitness development instructions

## Architecture

- This MERN monorepo contains React + TypeScript in `client/` and Express + TypeScript in `server/`.
- Use MongoDB/Mongoose for persistence and the existing Axios client in `client/src/api/api.ts` for frontend API access.
- Extend the modular backend under `server/src/modules/`; reuse existing validation, services, middleware, and API contracts.
- Preserve the Warrior Fitness dark charcoal/orange theme and existing UI patterns.

## Business rules

- Only authorized staff may register gym members; never add public member self-registration.
- Membership `startDate` is inclusive and `endDateExclusive` is exclusive.
- Use `Asia/Colombo` for gym calendar-day calculations and reuse existing date helpers.
- Preserve historical membership plan snapshots and agreed purchase terms.
- Financial amounts use whole-number LKR.
- Preserve payment and membership transaction, concurrency, and idempotency guarantees.
- Never silently delete or rewrite historical financial records.

## Security

- Enforce backend authorization on every protected operation; frontend route, sidebar, and action access must match backend permissions.
- Never leak password hashes, JWTs, cookies, or credentials through API payloads, logs, or documentation.
- Never store secrets in Git; use environment configuration and sanitized examples.
- Avoid logging sensitive request bodies or personal information.
- Future mobile clients must use authenticated backend APIs, never direct MongoDB access.
- Staff role, permission, password-hash, and active-status edits must use `server/src/modules/auth/staff-security.service.ts` so each change atomically increments `sessionVersion`; do not bypass it with model saves or raw database updates.

## Development workflow

- Work only on the currently approved sprint/task; inspect existing code and repository instructions before implementation.
- Prefer extending existing modules over duplicating functionality; keep changes small and reviewable.
- Add or update tests when relevant. Do not install a test framework without task authorization.
- Run required builds, lint, and existing relevant tests. Report unavailable checks and manual verification honestly.
- Automated tests are configured in both client/ and server/ using Vitest. Run npm test in each package for test type-checking and execution, or npm run test during development.
- Also run `npm run build` in both packages and `npm run lint` in `client/`. See `docs/testing/authentication-authorization.md` for coverage and limitations.
- Keep tests under each package's `tests/` directory. Use the isolation setup, fictional fixtures, and explicit API/model mocks; never import the production server entrypoint, connect to MongoDB, or use real credentials.
- Explain every changed file and report unresolved problems honestly.
- Follow task-specific Git preparation rules; do not discard or overwrite existing user changes.
- Never modify development or production database records without task-specific approval.
- Do not commit, push, merge, rebase, open a PR, or start the next task without explicit authorization.
- Keep task status `IN PROGRESS` until the project manager approves completion.
