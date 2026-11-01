# Warrior Fitness

A gym operations platform built with React, TypeScript, Express and MongoDB. The portfolio/demo release connects the Admin overview, Front Desk, members and renewals, billing, attendance, follow-ups, staff permissions, expenses and cash closing, POS/retail, equipment maintenance and simulated membership reminders.

The charcoal/orange interface includes responsive charts, permission-aware navigation and a fast Front Desk workflow. Financial amounts use whole LKR; gym dates use Asia/Colombo. Only authorized staff register members.

## Local setup

Use **Node.js 24.x** and npm. Install each package separately; there is no root npm workspace.

```powershell
git clone https://github.com/NiwanthaSanjula/warrior-fitness.git
cd warrior-fitness
git switch develop
cd server
npm ci
```

Create a private, Git-ignored `server/.env` with:

| Variable | Local value |
| --- | --- |
| `NODE_ENV` | `development` |
| `PORT` | `5000` |
| `CLIENT_URL` | `http://localhost:5173` |
| `MONGODB_URI` | Private MongoDB connection string, with an explicit database name |
| `JWT_SECRET` | Private random value, at least 32 characters |
| `NOTIFICATION_SCHEDULER_ENABLED` | `false` |

MongoDB must support transactions for membership/payment/POS/closing writes: use Atlas or a replica set. Keep normal gym data separate from disposable demonstration data. Never copy credentials into source, screenshots, issue comments or browser variables.

Start the normal local backend with `npm run dev` from `server/`. In a second terminal:

```powershell
cd client
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api` to the local backend. Leave `VITE_API_BASE_URL` unset for this setup.

For an empty database only, the existing `npm run seed:admin` command can create the initial Admin using private `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` environment settings. It does not replace an existing Admin. Do not use this command to reset real accounts or disclose bootstrap credentials.

## Realistic demo data

See [demo-data.md](docs/sprints/demo-data.md) for the repeatable fictional dataset, exact database safety checks and private configuration. The dedicated database is **`warrior_fitness_demo`**; the normal gym database is not reset.

From `server/`:

```powershell
npm run seed:demo -- --dry-run
npm run seed:demo -- --check
# Only after confirming the dedicated disposable database and authorizing writes:
npm run seed:demo -- --apply
npm run dev:demo
```

The demo server uses only the separate ignored `.env.demo.local`; it leaves the normal `.env` unchanged. Demo staff credentials come from that private configuration. The ordinary backend may also serve the populated demo database when its private `MONGODB_URI` explicitly targets that database; deployment never runs the seeder automatically.

## Verification

```powershell
cd server
npm test
npm run build
cd ../client
npm test -- --maxWorkers=2
npm run build
npm run lint
cd ..
git diff --check
```

Vitest suites use isolated models/APIs and fictional fixtures, without live database access. Browser checks distinguish mocked workflows from read-only demo verification.

## Deploy: Vercel + Render + MongoDB Atlas

Follow the exact environment tables and provider steps in [docs/deployment.md](docs/deployment.md).

| Service | Root | Build | Start / output |
| --- | --- | --- | --- |
| Vercel frontend | `client` | `npm run build` | `dist` |
| Render backend | `server` | `npm ci --include=dev && npm run build` | `npm start` |

Vercel requires public `VITE_API_BASE_URL=https://YOUR_RENDER_HOST/api`. Render requires `NODE_ENV=production`, the exact HTTPS frontend `CLIENT_URL`, private `MONGODB_URI` and `JWT_SECRET`; keep `NOTIFICATION_SCHEDULER_ENABLED=false` for the demo. Render supplies `PORT`. No database credentials or signing keys belong in frontend variables.

`client/vercel.json` supports SPA deep links. `render.yaml` is an optional backend Blueprint; its private values are supplied in Render, not Git. The backend binds the platform port on `0.0.0.0`, uses exact-origin credentialed CORS and validates mutation origins. Production staff cookies are HttpOnly, Secure, SameSite=None and retain the eight-hour duration and session-version checks.

## Release scope

This is a **portfolio/demo release**. WhatsApp delivery is simulation-only. The scheduler runs only while the backend process is running; an idle/free instance cannot guarantee daily 09:00 execution. Real financial write concurrency, failure injection and production financial certification remain outside this release. See the individual [sprint trackers](docs/sprints/) for verification history and limitations.
