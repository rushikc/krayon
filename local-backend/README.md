# local-backend

A local-only Fastify server. It is never deployed. `backend/` is the Cloud Run backend; this folder mocks the Google Cloud services so the generation pipeline can run on a laptop.

| Cloud piece | Local stand-in | Code |
|---|---|---|
| Gemini | **Real** Vertex AI calls (project `krayon-ai`, location `global`) via gcloud ADC; `GEMINI_API_KEY` as an optional fallback | `packages/pipeline` |
| Firestore | SQLite document store | `local-backend/src/services/docstore.ts` |
| Cloud Storage | Files under `data/storage/users/<uid>/{uploads,sources,slices,keyframes,audio,text}/...` and `users/<uid>/pagetext/...json` (`packages/pipeline/src/keys.ts`) | `local-backend/src/services/storage.ts` |
| Firebase Auth | Stub user `local-user` (override with `X-User-Id` header) | `local-backend/src/services/auth.ts` |
| Cloud Tasks | In-process runner, status in `jobs/{id}` docs (no HTTP jobs API) | `local-backend/src/services/jobs.ts` |
| Event bus | In-memory fan-out over `/ws` | `local-backend/src/bus.ts` |
| Lesson pipeline | Genkit flows in `packages/pipeline`, depending only on `packages/shared/src/ports.ts` | `packages/pipeline` |

Indexes are top-level docs: `courseIndex`, `chapterIndex`, `lessonIndex`, `courseViews` (`packages/pipeline/src/store.ts`). Course entities live under `users/{uid}/courses/...`.

`local-backend` implements those ports and wires them in `local-backend/src/index.ts`. It listens on `127.0.0.1` and `PORT` (8787).

## Run

From the repo root:

```bash
gcloud auth application-default login   # once, if you haven't already
npm run setup                            # install, build shared and pipeline, copy .env
npm run dev                              # local backend on 127.0.0.1:8787 and Vite on :5173
npm run genkit                           # Genkit UI for flow traces
```

Vite proxies `/api` and `/ws` to `http://localhost:8787` (change with `LOCAL_BACKEND_URL`).

## Endpoints

Shared HTTP (`packages/api/src/plugin.ts`):

- `GET /api/health`: status, plus whether a Gemini backend is configured
- `GET /api/me`: the stub user
- `POST /api/uploads` (multipart `file`, 20 MB max)
- `POST /api/courses` (multipart, PDF or `image/*`): stores the files, creates a course, starts generation, returns `{ courseId }`
- `GET /api/courses` and `GET /api/courses/:id`: course, chapters, lessons, segment statuses
- `GET /api/courses/:id/chapters`
- `POST /api/courses/:id/retry`
- `POST /api/chapters/:id/retry`
- `GET /api/lessons/:id`
- `POST /api/lessons/:id/render`
- `POST /api/lessons/:id/retry`
- `POST /api/lessons/:id/rerender`
- `POST /api/lessons/:id/segments/:segmentId/regenerate` `{ prompt? }`
- `PUT /api/lessons/:id/progress`
- `POST /api/lessons/:id/ask`
- `GET /api/audio/:blobId` (Range → 206)
- `GET /api/renders/:blobId`
- `GET|PUT|DELETE /api/docs/{path}`: Firestore-style docs, scoped to `users/{uid}/...`. A GET on a collection path lists its docs. `PUT ?merge=true` merges.

Local only:

- `POST /api/admin/reset`: wipes every document, blob and job record and returns counts. The server keeps running.
- `WS /ws?courseId=...&uid=...`: snapshot, then live pipeline events. Clients send only `subscribe` and `cancel`.

Data lives in `data/` (gitignored).

## TTS

Chirp 3 HD, LINEAR16 WAV at 24 kHz, one file per segment (`packages/pipeline/src/tts.ts`). Settings: `TTS_ENABLED` (true), `TTS_VOICE` (`en-US-Chirp3-HD-Charon`), `TTS_RATE` (1.0), `TTS_CONCURRENCY` (4), `TTS_QUOTA_PROJECT` (`krayon-ai`). `TTS_ENABLED=false` skips voice and uses the 6–15 s duration estimate.

## Caps

`CAP_UPLOADS_PER_VISITOR_DAY`, `CAP_COURSES_GLOBAL_DAY`, `CAP_LESSON_RENDERS_GLOBAL_DAY`, `CAP_REGENERATES_GLOBAL_DAY`, `CAP_ASK_GLOBAL_DAY`. Default is `0` (off). Over the cap the API returns `429 { code: 'demo_limit' }`.

## Tests

From the repo root: `npm test` runs shared + pipeline + `local-backend` with `AI=0`. `npm run test:backend` is the full `local-backend` vitest suite (real Vertex when AI is configured). `npm run test:backend:quick` is `AI=0` only.

## Logging

Every request and response is logged with a request id (also returned as the `X-Request-ID` header), along with errors, Gemini calls (model, latency, token usage), jobs, pipeline steps and resets. Docstore and storage operations are logged at DEBUG. Output goes to the console and to rotating files:

- `logs/app.log`: human-readable
- `logs/app.jsonl`: JSON lines, e.g. `jq -c 'select(.request_id=="<id>")' logs/app.jsonl`

Settings in `.env`: `LOG_LEVEL` (INFO; DEBUG adds docstore/storage/raw model output), `LOG_BODY_MAX` (2000), `LOG_DIR` (`./logs`). Secrets (auth headers, cookies, keys, tokens) are redacted, and uploads log only name, type and size. See `.cursor/rules/debug.mdc` for recipes.
