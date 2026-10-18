# Krayon

Krayon turns notes, PDFs, and photos into a video-first study experience.

A lesson looks like a video you can pause. Underneath, it is a timeline of [Remotion](https://www.remotion.dev/) scenes played live in the browser with `@remotion/player`. Nothing is baked into an mp4. Each stretch of the lesson is its own segment, so a learner can stop on the part they did not follow and regenerate only that stretch. The rest of the lesson stays as it is.

The nearest reference is NotebookLM: source material in, grounded study artifacts out. Krayon leads with the playable lesson. Doubts, highlights, and notes happen on the lesson itself.

## How a lesson is built

The generated model is **Course → Chapter → Lesson → Segment**. Each lesson has one written study doc beside the playable timeline.

1. **Structure.** Uploaded sources become a course of chapters with page ranges.
2. **Chapters.** Each chapter is written into lessons: outline, script, and a study doc per lesson.
3. **Work inside the lesson.** Pause and ask a doubt, redraw one segment, highlight by drawing on the frame, pin what matters, or drop or remove a note.

A lesson is a list of segments. Each segment has a duration, scene JSON (rendered by the shared Remotion templates), and optional spoken narration. Replacing one segment lengthens or shortens only that part. A 1 minute stretch can become a 3 minute explanation, and a 10 minute lesson becomes 12 minutes, without rewriting the other 9 minutes.

### Planned

- Quiz generation (today the quiz tool is a checklist of doubt prompts in `frontend/src/components/DoubtPanel.tsx`)
- Mock exam

## Test materials and input assumptions

Krayon accepts PDFs (`application/pdf`) and any `image/*` upload (`packages/api/src/services/uploads.ts`). Typical inputs:

- **Lecturer PDFs**: handouts and study material that are mostly text, with a few diagrams, tables and practice questions.
- **Student photos**: phone photos of textbook pages, handwritten notes, and worksheets. Expect slight rotation, perspective, shadows and uneven lighting.

Sample material lives in gitignored `data/books/` (not in the repo). Local pipeline runs also write mock storage under gitignored `data/` and `local-backend/data/`.

## Stack

- React, Vite, and Tailwind in `frontend/`
- Remotion, played in the app with `@remotion/player`; scene templates in `packages/shared/src/remotion/templates/`
- Fastify HTTP layer in `packages/api` (`@krayon/api`)
- Vertex AI Gemini 2.5 Flash and Genkit
- Cloud Text-to-Speech Chirp 3 HD
- Firebase Hosting, anonymous Auth, App Check, Firestore, and Storage
- Cloud Run (`krayon-api`, `krayon-worker`, `krayon-renderer`), Cloud Tasks, Cloud Scheduler

## Quick start

All API traffic in development goes through `local-backend/`, a TypeScript Fastify server on `127.0.0.1:8787`. It makes real Gemini calls and mocks Firestore (SQLite), Cloud Storage (local files), Auth (`X-User-Id` stub), and background jobs (in-process). Vite proxies `/api` and `/ws` to it. See `local-backend/README.md`.

From the repo root:

```bash
gcloud auth application-default login   # once, for Vertex AI
npm run setup                           # workspace install, shared + pipeline builds, local-backend/.env
npm run dev                             # local backend :8787 + Vite :5173; Ctrl+C stops both
```

`npm run setup` copies `local-backend/.env.example` to `local-backend/.env` if the env file is missing. Copy `frontend/.env.example` to `frontend/.env` and fill Firebase web config when you need it. Real `.env` files stay out of git.

You can also start pieces with `npm run dev:backend`, `npm run dev:frontend`, and `npm run genkit` (Genkit developer UI). `npm run dev` watches `@krayon/shared` and `@krayon/pipeline` only. After editing `packages/api`, run `npm run build -w @krayon/api` (that package is not watched).

## Backends

`local-backend/` is a local mock. It is never deployed. It stands in for Firestore, Cloud Storage, Cloud Tasks, and Firebase Auth so the generation pipeline can run on a laptop, and it calls Gemini on Vertex from that laptop.

`backend/` is the Cloud Run backend: `src/api.ts` and `src/worker.ts` entrypoints, GCP adapters under `src/adapters/`, Cloud Build files, print-only deploy scripts, and `env/` examples. Still frames on GCP go through `packages/renderer`. IAM, queues, and deploy order live in `backend/architecture.md`.

## Build and quality

`npm run build` builds `@krayon/shared`, `@krayon/pipeline`, `@krayon/api`, `local-backend`, and `frontend` in that order.

`npm run lint` runs ESLint on `packages/shared/src`, `packages/pipeline/src`, `packages/api/src`, `packages/renderer/src`, `local-backend/src`, and `backend/src`.

## Tests

| Script | What it runs |
|---|---|
| `npm test` | `@krayon/shared`, `@krayon/pipeline`, then `local-backend` with `AI=0` (`test:quick`) |
| `npm run test:backend` | full `local-backend` vitest (real Vertex when AI is configured) |
| `npm run test:backend:quick` | `local-backend` vitest with `AI=0` (no Vertex) |
| `npm run test:emulators` | opt-in placeholder; not run from the default test task |

## Deploy

Scripts under `backend/scripts/` print commands; they do not run them. Full IAM and service detail: `backend/architecture.md`.

Order from the repo root:

```bash
sh backend/scripts/00-enable-apis.sh
sh backend/scripts/05-firestore-and-auth.sh
sh backend/scripts/10-queues.sh
sh backend/scripts/20-service-accounts.sh
sh backend/scripts/30-deploy-run.sh --site <site-id>
# Second pass after URLs exist:
# sh backend/scripts/30-deploy-run.sh --site <site-id> --worker-url <worker-url> --renderer-url <renderer-url>
sh backend/scripts/40-scheduler.sh --worker-url <worker-url>
sh backend/scripts/50-deploy-hosting.sh --site <site-id>
firebase deploy --only firestore,storage
```

Put production frontend env in `frontend/.env.production` (gitignored): `VITE_BACKEND=gcp`, `VITE_API_BASE_URL=<api-url>`, Firebase web config (`VITE_FIREBASE_*`), and `VITE_RECAPTCHA_SITE_KEY` as needed.

### Values set outside git

- `CORS_ORIGINS` — Cloud Run env on `krayon-api` (embedded in the commands printed by `30-deploy-run.sh --origins …`).
- `VITE_API_BASE_URL` — `frontend/.env.production` (gitignored) before `npm run build -w frontend`.
- Cloud Run API URL — also ends up in the built JS bundle (`frontend/dist`). That is expected: the browser needs it at runtime, so it is public anyway. It must not appear in tracked files.
- Browser origins for Auth and App Check — Firebase Console → Authentication → Authorized domains, and the reCAPTCHA Enterprise key domains (`<site-id>.web.app`, `<site-id>.firebaseapp.com`).
