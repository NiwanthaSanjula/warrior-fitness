# Deployment: Vercel, Render and MongoDB Atlas

Target branch: **`develop`**. This guide prepares a portfolio/demo deployment; it does not seed, migrate, clear or rewrite existing financial records.

## Deployment files

| Files | Purpose |
| --- | --- |
| `client/src/api/api-url.ts`, `client/src/api/api.ts` | Validate the public API URL and retain credentialed Axios requests |
| `client/vite.config.ts`, `client/vitest.config.ts` | Validate Vercel build configuration; retain isolated testing with the shared Vite configuration |
| `client/vercel.json`, `render.yaml` | SPA hosting and backend build/start/health settings |
| `server/src/config/env.ts`, `server/src/config/http.ts`, `server/src/app.ts` | HTTPS origin validation, exact credentialed CORS, proxy configuration and mutation-origin protection |
| `server/src/modules/auth/token.ts` | Secure cross-site production cookies; existing session duration/revocation preserved |
| `server/src/server.ts`, `server/src/config/db.ts`, `server/src/scripts/seedAdmin.ts` | Platform port binding and sanitized startup/database/bootstrap failures |
| Both `package.json` / `package-lock.json` files | Node 24.x runtime declaration; no dependency versions changed |
| `.gitignore` | Exclude local provider metadata in addition to private environment files |
| `server/tests/deployment.test.ts`, `client/tests/deployment.test.ts` | Isolated production-origin, cookie and API-configuration coverage |
| `README.md`, `client/README.md`, this guide | Local setup, demo workflow and exact owner deployment steps |

## Before deployment

1. Use a dedicated disposable demo database. For the existing fictional dataset, select `warrior_fitness_demo` explicitly in the Atlas connection string. Never publish a demo connected to real gym/member records.
2. Use a fresh least-privileged Atlas database user for that database and privately configure the Render service's outbound network access in Atlas. Rotate any credential previously exposed in logs or tool output; do not reuse an exposed credential for hosting.
3. Keep the JWT signing secret and all database/bootstrap credentials private. `VITE_` values are public in the built frontend. Never copy a local `.env` file into Git or into the frontend.
4. Use Node **24.x**. Both package manifests/lockfiles specify this major. No seeder is part of a build or start command.

## Required frontend environment

Set in Vercel project settings for **Production** before deployment:

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://YOUR_RENDER_HOST/api` — actual public Render URL, including `/api` |

The value must use HTTPS and have no credentials, query or fragment. Vercel builds fail clearly if this is missing. Local development defaults to `/api` through Vite's existing proxy; private frontend `.env.local` may optionally specify an HTTP localhost API during development. Changing a Vercel environment variable requires a new deployment because Vite substitutes it at build time. [Vite environment variables](https://vite.dev/guide/env-and-mode), [Vercel environment variables](https://vercel.com/docs/environment-variables).

Never set `MONGODB_URI`, `JWT_SECRET`, staff passwords or WhatsApp credentials in Vercel frontend variables.

## Required backend environment

Set privately in Render:

| Variable | Value / purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `CLIENT_URL` | Exact frontend HTTPS origin, e.g. `https://YOUR_PROJECT.vercel.app`; no route, query, wildcard or credentials |
| `MONGODB_URI` | Private Atlas URI with the chosen demo database explicitly named |
| `JWT_SECRET` | New private random secret, at least 32 characters; the Blueprint can generate it |
| `NOTIFICATION_SCHEDULER_ENABLED` | `false` for the portfolio/demo deployment |
| `PORT` | Supplied by Render, normally `10000`; do not hardcode a different port |

No `DEMO_STAFF_PASSWORD` or bootstrap password is required by normal runtime. Existing staff accounts retain their existing passwords. Do not reset accounts or run `seed:admin` against an existing database to make a deployment work.

## Render backend: exact steps

1. Sign in to [Render](https://dashboard.render.com/), authorize GitHub and select `NiwanthaSanjula/warrior-fitness`.
2. Choose **New → Web Service**, runtime **Node**, branch **develop**, root directory **server**.
3. Set build command to `npm ci --include=dev && npm run build` and start command to `npm start` (runs `node dist/server.js`). Including dev dependencies is intentional: TypeScript is needed at build time even with `NODE_ENV=production`.
4. Set health check path to `/api/health`. The backend listens on Render's `PORT` at `0.0.0.0`; the health endpoint returns 503 if MongoDB is disconnected. [Render web services](https://render.com/docs/web-services), [monorepo roots](https://render.com/docs/monorepo-support).
5. Enter the backend environment values above. Initially `CLIENT_URL` may be your intended Vercel project origin; replace it with the actual assigned origin in the final connection step below before testing sign-in.
6. Select the service plan deliberately. The included `render.yaml` selects Free for a demo; an always-on plan is needed if scheduled execution must be reliable. No real WhatsApp delivery is configured by this repository.
7. Deploy and record the actual HTTPS `onrender.com` URL. Verify `GET https://YOUR_RENDER_HOST/api/health` returns HTTP 200. Wake a free instance and wait for that response before a demonstration. If database access fails, correct the private account/network settings in the provider dashboards; do not paste connection strings into logs or issues.

Alternatively, **New → Blueprint** can use the root `render.yaml`, supplying the unsynced origin/database values in Render. The Blueprint generates `JWT_SECRET`. The same root/build/start/health settings apply. [Blueprint environment fields](https://render.com/docs/blueprint-spec#environment-variables), [Node version selection](https://render.com/docs/node-version).

## Vercel frontend: exact steps

1. Sign in to [Vercel](https://vercel.com/), authorize GitHub and import the same repository.
2. Set project root to **client**, framework **Vite**, Node **24.x** and Git production branch **develop**.
3. Set install command to `npm ci --include=dev`, build command to `npm run build` and output directory to `dist`. These are also recorded in `client/vercel.json`.
4. Set `VITE_API_BASE_URL` to the actual Render HTTPS origin followed by `/api`. Apply the variable to Production; configure Preview separately only for a deliberately allowed test frontend.
5. Deploy and record the actual frontend HTTPS origin. The included SPA rewrite serves `/index.html` on deep links such as `/dashboard`, `/front-desk` and member profiles. Static built assets remain handled by the Vite/Vercel framework integration. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
6. Update Render `CLIENT_URL` to that exact frontend origin and redeploy Render. Do not use `*`, reflected origins or an unrestricted `vercel.app` suffix. One trusted origin is intentional; arbitrary preview deployments are not allowed to access the gym's authenticated API.

## Cookies, CORS and cross-site authentication

- Axios keeps `withCredentials: true`. The backend permits credentialed CORS only for the configured `CLIENT_URL`.
- Production cookies use **HttpOnly + Secure + SameSite=None**, path `/api`, and the existing eight-hour expiration. Development/test remain SameSite=Lax without Secure. Login/logout cookie attributes match; session-version revocation is unchanged. [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
- Because cross-site cookies permit requests that CORS alone cannot stop, production POST/PUT/PATCH/DELETE requests require the exact frontend `Origin` before reaching application logic. Browser fetches supply it. A trusted command-line API request must explicitly supply that header; no authentication or permission checks are bypassed.
- The backend trusts one Render reverse-proxy hop for forwarded protocol/client IP. Do not change this to unrestricted `trust proxy=true`. [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/).
- Browsers can still block third-party cookies between unrelated `vercel.app` and `onrender.com` sites even when these flags/CORS are correct. For reliable use across strict privacy settings, attach same-site custom domains such as `app.YOUR_DOMAIN` and `api.YOUR_DOMAIN`, update both URL settings, and redeploy. Do not weaken HttpOnly/Secure settings or put JWTs in localStorage as a workaround. [MDN credentialed CORS and third-party cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## Deployment smoke checks

1. Open the deployed frontend on desktop and mobile; reload `/dashboard` and `/front-desk` directly.
2. Sign in with an existing **demo** Admin. In browser Network tools verify requests target the Render `/api` URL and the session cookie is accepted. Never copy its value into a report.
3. Verify Admin KPIs use three columns on desktop, two on tablet and one on mobile; charts and navigation remain responsive.
4. Compare membership/POS/combined collections with the read-only day preview. Do not submit financial entries or close a business date during smoke checks.
5. Verify Receptionist navigation and requests omit Admin-only sources. Check-in remains in Front Desk; Attendance is history/reporting.
6. Check page-level loading/errors and a normal session refresh. After normal user logout, verify the existing session-revocation behavior. Do not perform password/role/status edits on real staff to test deployment.

Actual hosted login, HTTPS cookies, account access and deep-link routing must be confirmed after the owner supplies provider access and environment values. Local automated/mocked checks do not claim a public deployment succeeded.

## Seeder and recovery

The full instructions remain in [sprints/demo-data.md](sprints/demo-data.md). The seeder is dry-run by default, requires `--apply`, refuses production mode/wrong database identity and does not wipe history. `npm run dev:demo` is a localhost development launcher, **not** the Render start command. Host the populated demo database with normal `npm start` and the explicit private runtime URI instead.

For a failed deploy, inspect sanitized build/health logs and correct configuration, or use the provider's previous deployment rollback. Never use a seed/reset or financial-data rewrite as a deployment recovery step. Scheduler execution is process-bound, statuses remain SIMULATED and live financial failure/concurrency guarantees remain outside this portfolio/demo release.
