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
| `MONGODB_URI` | Existing private connection string explicitly targeting `warrior_fitness_demo` |
| `JWT_SECRET` | Private random value, at least 32 characters |
| `NOTIFICATION_SCHEDULER_ENABLED` | `false` |
| `DEMO_PUBLIC_LOGIN_ENABLED` | `true` for this populated demo database |

MongoDB must support transactions for membership/payment/POS/closing writes: use Atlas or a replica set. Keep normal gym data separate from disposable demonstration data. Never copy credentials into source, screenshots, issue comments or browser variables.

After one-time dependency installation/configuration, everyday startup is just two terminals. The backend reads `server/.env`:

```powershell
cd server
npm run dev
```

In the frontend terminal:

```powershell
cd client
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
```

The dataset is already populated. Seeding is an optional utility, never a startup requirement. Ordinary development uses only `server/.env` and the two `npm run dev` commands above. The seeder's ignored `.env.demo.local` is used only if that optional tool is explicitly invoked; never reseed or reset existing data to start the app.

For recruiter access, enable server-side `DEMO_PUBLIC_LOGIN_ENABLED=true` in `server/.env` **only with the existing `warrior_fitness_demo` database**. The Login page's **Try Demo — Explore Warrior Fitness** button starts an eight-hour read-only session without a shared password. Existing Admin sign-in remains unchanged. Server-side write protections and deployment settings are in [the public demo guide](docs/deployment.md#one-click-public-demo-login). No separate launcher or provisioning command is needed.

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

## Deploy: two Vercel projects + existing MongoDB Atlas

Follow the exact environment tables and provider steps in [docs/deployment.md](docs/deployment.md).

| Service | Root | Build | Start / output |
| --- | --- | --- | --- |
| Vercel frontend (Vite) | `client` | `npm run build` | `dist` |
| Vercel backend (native Express) | `server` | Native framework default | Default export in `server/index.ts`; no start command |

Both projects use branch `develop` and Node 24.x. The backend alone holds `NODE_ENV=production`, the exact HTTPS frontend `CLIENT_URL`, private `MONGODB_URI` selecting the already populated `warrior_fitness_demo`, and private `JWT_SECRET`. Set `DEMO_PUBLIC_LOGIN_ENABLED=true` and `NOTIFICATION_SCHEDULER_ENABLED=false`. No bootstrap credentials, seeding or new database are needed.

The backend is at `https://warrior-fitness-nine.vercel.app`. Static `client/vercel.json` forwards `/api/*` to that backend before the SPA fallback; browsers use same-origin `/api`. No frontend routing environment variable is required. Leave `VITE_API_BASE_URL` unset (or `/api`); secrets never belong in frontend variables. The backend retains exact-origin checks and host-only HttpOnly/Secure cookies. The old `render.yaml` is unused by this deployment.

The Vercel entry point shares database/index initialization across concurrent requests and reuses warm connection pools. It never starts the background scheduler or local listener. Both local `npm run dev` commands above remain unchanged. Provider proxy/cookie smoke checks are required after deployment; see the guide for the exact order and limitations.

## Release scope

This is a **portfolio/demo release**. WhatsApp delivery is simulation-only. The scheduler runs only while the backend process is running; an idle/free instance cannot guarantee daily 09:00 execution. Real financial write concurrency, failure injection and production financial certification remain outside this release. See the individual [sprint trackers](docs/sprints/) for verification history and limitations.
