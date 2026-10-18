# frontend

Desktop web app for Krayon (React 19, Vite, Tailwind, `@remotion/player`). Supported width is 1200px and wider.

From the repo root, run `npm run setup` then `npm run dev`. Vite proxies `/api` and `/ws` to local-backend.

`VITE_BACKEND=local` (default) uses the proxy. `VITE_BACKEND=gcp` uses Cloud Run plus Firestore `onSnapshot`. Copy `frontend/.env.example` to `frontend/.env` (and `frontend/.env.production` for Hosting).

See the root `README.md` for stack, tests, and deploy.
