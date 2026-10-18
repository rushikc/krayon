# Krayon

**Your study material, taught back to you.** Krayon turns PDFs, notes and photos into narrated, animated video courses you can pause, question and fix one part at a time.

A Krayon lesson looks like a video, but it isn't one baked mp4. It's a timeline of small [Remotion](https://www.remotion.dev/) segments played live in the browser with `@remotion/player`. Each segment has its own narration, scene JSON and duration. That one design choice is what makes Krayon fast, cheap and flexible.

## Why segments instead of generated video

Text-to-video models such as Veo produce one fixed clip of a few seconds at a time. A 3-minute lesson means stitching about 23 clips that you can't edit, at $9–$90 in list prices. Krayon writes the lesson as structured segments instead:

- **Faster.** A 3-minute narrated lesson renders in about 2.5 minutes once the course is built. Segments are voiced, built and reviewed in parallel.
- **Cheaper.** About $0.20 per 3-minute lesson for Gemini, Text-to-Speech and Cloud Run together. That's 44 to 440 times cheaper than generating the same 180 seconds with Veo.
- **Regenerate just the part you didn't follow.** Pause on a confusing stretch and regenerate only that segment, with live step-by-step progress. The rest of the lesson stays as it is. A 1-minute stretch can grow into a 3-minute explanation without touching the other parts.
- **Easy for the AI to reason about.** Every segment is plain text: its script and scene description. When you pause and ask a doubt, Krayon puts exactly that segment, along with the lesson around it, into Gemini's context. Answers are about the moment on screen, not the whole video.
- **Self-checking.** Gemini reviews keyframes rendered from each segment and scores them for clarity, readability and accuracy. Anything below 8/10 is redrawn, up to 2 rounds.

The nearest reference is NotebookLM: source material in, grounded study material out. Krayon leads with the playable lesson, and doubts, highlights and notes happen on the lesson itself.

## How a lesson is built

The generated model is **Course → Chapter → Lesson → Segment**.

1. **Upload.** Drop in PDFs, notes or phone photos of pages.
2. **Structure.** Gemini 2.5 Flash on Vertex AI reads the material and plans a course of chapters with page ranges.
3. **Chapters.** Each chapter is written into lessons: outline, script and a study doc per lesson.
4. **Segments.** For each lesson, Gemini writes beats and scene JSON per segment. Cloud Text-to-Speech (Chirp 3 HD) narrates them, the video is synced to the voice, and Remotion renders keyframes for review.
5. **Watch and work inside the lesson.** Pause and ask a doubt, regenerate one segment, highlight by drawing on the frame, pin what matters, or add and remove notes. Progress updates live while a course generates.

## Features

- Upload anything: PDFs, notes or photos
- Auto course roadmap of chapters and lessons
- Narrated, animated video lessons
- A written study doc for every lesson
- Pause and ask: context-aware doubt chat with Gemini at the paused moment
- Regenerate a single segment, with live progress
- Real-time progress while a course generates
- No setup: anonymous sign-in, start right away

### Planned

- Subject templates for maths and physics diagrams
- Multilingual narration
- Sharing courses with classmates and teachers
- Quizzes and mock tests generated from the same material (today the quiz tool is a checklist of doubt prompts in `frontend/src/components/DoubtPanel.tsx`)

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
