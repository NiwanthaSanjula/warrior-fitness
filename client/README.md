# Warrior Fitness frontend

React + TypeScript + Vite, using the Warrior Fitness charcoal/orange interface.

See the [root README](../README.md) for local setup and demo data, and [deployment guide](../docs/deployment.md) for Vercel/Render/Atlas configuration.

From this directory:

```powershell
npm ci
npm run dev
npm test -- --maxWorkers=2
npm run build
npm run lint
```

Local API requests use the Vite `/api` proxy. Set public `VITE_API_BASE_URL=https://YOUR_RENDER_HOST/api` in Vercel before deployment; keep database credentials, JWT secrets and passwords out of all frontend environment variables.
