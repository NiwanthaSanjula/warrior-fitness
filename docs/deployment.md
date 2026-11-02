# Deployment: Vercel frontend + Vercel Express backend + existing Atlas

Status: **PREPARED / AWAITING REVIEW**. No deployment or live database access during preparation. Use branch **develop**, Node **24.x**, and two projects from the same repository. No additional provider or database is needed.

## Exact project settings

| Setting | Backend | Frontend |
| --- | --- | --- |
| Repository | `NiwanthaSanjula/warrior-fitness` | Same repository |
| Production branch | `develop` | `develop` |
| Root directory | `server` | `client` |
| Framework | Express | Vite |
| Node version | 24.x | 24.x |
| Install command | `npm ci --include=dev` | `npm ci --include=dev` |
| Build command | Native Express default; no custom override | `npm run build` |
| Output directory | Leave Express default; not `dist` | `dist` |
| Start command | None; invoke exported Express app | None; static hosting |

`server/index.ts` imports Express and default-exports a wrapper around the unchanged application routes. Vercel detects this root entry before `src/app.ts` and `src/server.ts`. No API-folder functions, legacy builders or backend catch-all rewrite is required. `server/vercel.json` selects native Express. Existing `npm run build` remains available for local validation; `npm start` and `npm run dev` are persistent-process commands, not Vercel start commands. [Official Express deployment](https://vercel.com/docs/frameworks/backend/express), [entry-point detection](https://github.com/vercel/vercel/blob/main/skills/vercel-cli/references/node-backends.md).

## Backend environment

Set privately on the **backend project**, Production:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Existing private Atlas URI explicitly selecting **`warrior_fitness_demo`** |
| `JWT_SECRET` | Private random secret, at least 32 characters |
| `CLIENT_URL` | Exact frontend production HTTPS origin, without a page path, query or fragment |
| `DEMO_PUBLIC_LOGIN_ENABLED` | `true` |
| `NOTIFICATION_SCHEDULER_ENABLED` | `false` |

No local `PORT`, bootstrap passwords, seeder or financial-test variables are needed. Existing accounts/data are already present. Never seed, reset passwords or create another database to deploy. Replace previously exposed database/signing secrets before publishing, without deleting data or resetting the application Admin account. Atlas must privately allow the database user and Vercel network access. Keep credentials out of Git, logs and frontend variables.

## Frontend environment and routing

The existing backend is **`https://warrior-fitness-nine.vercel.app`**. No frontend routing environment variable is required. Remove any old absolute `VITE_API_BASE_URL`; leave it unset or set it to `/api`. Vite accepts the same-origin production setup and rejects an absolute URL on Vercel that would bypass the proxy.

`client/vercel.json` is the only frontend deployment configuration. It contains plain static JSON with an explicit destination for each rewrite. Rules run in this order:

1. `/api/:path*` forwards to `https://warrior-fitness-nine.vercel.app/api/:path*`, retaining the API prefix and query parameters.
2. `/(.*)` serves `/index.html` for React deep links. Existing built assets remain served normally.

The unchanged backend marks API responses `no-store`. No dynamic configuration or build-time URL substitution is used. [External rewrites](https://vercel.com/docs/routing/rewrites).

## Deployment order after review

1. Approve and publish the reviewed source to `develop`. This preparation task does not commit, push or deploy.
2. Choose the frontend project name and intended stable production origin for backend `CLIENT_URL`.
3. Import the repository as the **backend**, root `server`, using the settings/environment above. Deploy with native Express. Use a public production deployment; an authentication-protected preview cannot be proxied by ordinary visitors.
4. The backend is already available at `https://warrior-fitness-nine.vercel.app`; its health path is `/api/health`. No backend redeployment is needed for the frontend configuration fix.
5. Import the same repository as the **frontend**, root `client`, and deploy. The static API rewrite already targets the existing backend; no routing environment variable is required.
6. Confirm backend `CLIENT_URL` matches the final assigned frontend production origin before testing login. If it differs, the owner must update that backend environment value and redeploy it; the frontend configuration fix does not change backend settings.
7. Complete the read-only smoke checks below. Never run seeders or submit financial entries to validate deployment.

## Cookies and authentication

Browser Axios requests stay on frontend `/api` with credentials. The backend preserves exact `CLIENT_URL` CORS and mutation-Origin checks. Wildcard origins and arbitrary Vercel preview domains are not permitted.

The existing production cookie remains HttpOnly, Secure, SameSite=None, eight hours, **host-only** (no Domain), with `Path=/api`. Through the rewrite, Set-Cookie belongs to the frontend host and is returned on frontend API requests. Logout clears matching attributes. No JWT is stored in localStorage. Vercel must preserve Origin, Cookie and Set-Cookie; live provider behavior requires post-deployment checks.

## One-click public demo login

Sign In uses the unchanged existing Admin account/password. Try Demo calls `POST /api/auth/demo-login` without shared staff credentials. The server requires the flag and verifies the actual connected database is exactly `warrior_fitness_demo` before creating/restoring a viewer session. The reserved viewer is reused idempotently; collisions never overwrite staff.

JWT/session-version checks, the explicit viewer marker and per-visitor session digest/expiry remain unchanged. Demo logout revokes only that visitor. Normal Admin logout still revokes all of that Admin's sessions.

Demo visitors may read only audited GET/HEAD paths. Business mutations and unknown GETs are rejected server-side before handlers, including members, billing, check-in, staff, POS, expenses, closing, equipment and reminder simulations. UI restrictions supplement this policy. Background scheduling stays disabled; actual WhatsApp delivery is not configured.

## Serverless behavior and limitations

- Requests await MongoDB readiness and the same model/index initialization used locally. Concurrent cold requests share a connection attempt and initialization promise per worker. Warm requests reuse the pool; failures produce sanitized uncached 503 responses and allow later retries.
- Each scaled worker has its own bounded pool and memory. Existing indexes, transactions, idempotency and financial snapshots remain unchanged. Initialization is not a migration, seed or financial rewrite.
- The Vercel entry never imports the port listener or notification scheduler. No cron/background timer or guaranteed daily 09:00 execution is introduced.
- Existing login/demo rate limits remain process-local, not globally shared across workers or restarts.
- Cold starts and Atlas/index readiness affect first-request latency. Hobby function execution/size/connection limits apply. [Express limitations](https://vercel.com/docs/frameworks/backend/express#limitations).
- Live financial transaction, rollback and write-concurrency verification remains outstanding. Mocked tests do not establish production financial certification.

## Verification and hosted smoke checks

Run `npm test` and `npm run build` in `server/`; `npm test -- --maxWorkers=2`, `npm run build` and `npm run lint` in `client/`; then root `git diff --check`. Existing isolation guards prevent Atlas/external-service access. Focused tests cover readiness/reuse/retry, native API entry, production Origin/cookies, demo restrictions, rewrite priority and SPA fallback.

Preparation results: **1,255 passing tests** (844 backend, 411 frontend). Both builds, frontend ESLint, tracked/new-file whitespace checks and changed-file secret checks passed. The frontend production build was also run with `VERCEL=1` and `VITE_API_BASE_URL=/api`. No dependencies or private environment files changed, no live database was accessed, and nothing was deployed or committed.

After deployment, on desktop/mobile:

1. Reload `/dashboard`, `/front-desk` and a member deep link. Verify assets/navigation load.
2. Through the **frontend URL**, `/api/health` must return API JSON; unknown `/api/...` must return backend API 404 rather than SPA HTML.
3. Use Try Demo, refresh, and read Members (60), charts, POS, equipment and finance. Confirm no API failures caused by deployment protection or rewrites.
4. Requests must remain on frontend `/api`; check cookie acceptance without exposing its value. Demo logout must allow a fresh sign-in and leave other visitors unaffected.
5. Sign in with the existing Admin and inspect authorized controls without submitting data changes.

Live Vercel proxy behavior, HTTPS cookies, deployment protection, Atlas networking and cold-start latency remain unverified until deployment is authorized.

## Local startup and optional seeder

Original commands remain unchanged: `cd server; npm run dev` and, in a second terminal, `cd client; npm run dev`. Backend reads private `server/.env`; Vite serves `http://localhost:5173` and proxies `/api` to `127.0.0.1:5000`. Hosted API rewrites use the static frontend JSON configuration; no routing environment variable is needed.

Preserve the populated database, Admin password and financial history. Optional [seeder instructions](sprints/demo-data.md) remain available; seed/reset/bootstrap commands must never be deployment build/start commands. `render.yaml` remains historical unused configuration; no Render service is needed.
