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

## Development workflow

- Work only on the currently approved sprint/task; inspect existing code and repository instructions before implementation.
- Prefer extending existing modules over duplicating functionality; keep changes small and reviewable.
- Add or update tests when relevant. Do not install a test framework without task authorization.
- Run required builds, lint, and existing relevant tests. Report unavailable checks and manual verification honestly.
- Current frontend checks: `npm run build` and `npm run lint` in `client/`; backend build: `npm run build` in `server/`.
- No frontend test framework is configured; the server `test` script is a failing placeholder, not a test suite.
- Explain every changed file and report unresolved problems honestly.
- Follow task-specific Git preparation rules; do not discard or overwrite existing user changes.
- Never modify development or production database records without task-specific approval.
- Do not commit, push, merge, rebase, open a PR, or start the next task without explicit authorization.
- Keep task status `IN PROGRESS` until the project manager approves completion.
