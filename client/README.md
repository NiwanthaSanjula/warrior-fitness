# Warrior Fitness frontend

React + TypeScript + Vite, using the Warrior Fitness charcoal/orange interface.

See the [root README](../README.md) for local setup and demo data, and [deployment guide](../docs/deployment.md) for the two Vercel projects and existing Atlas database.

From this directory:

```powershell
npm ci
npm run dev
npm test -- --maxWorkers=2
npm run build
npm run lint
```

Local API requests use the existing Vite `/api` proxy. On Vercel, static `vercel.json` forwards API requests to `https://warrior-fitness-nine.vercel.app/api` before the SPA fallback. No frontend routing environment variable is required. Leave `VITE_API_BASE_URL` unset or use `/api` so browser requests stay on the frontend origin. Never put database credentials, JWT secrets or passwords in frontend variables.
