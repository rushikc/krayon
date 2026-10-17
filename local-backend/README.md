# local-backend

A local-only Fastify server. It is never deployed. It mocks the Google Cloud services the future `backend/` will use, so the generation pipeline can run on a laptop.

| Cloud piece | Local stand-in | Code |
|---|---|---|
| Gemini | **Real** Vertex AI calls (project `krayon-ai`, location `global`) via gcloud ADC; `GEMINI_API_KEY` as an optional fallback | `packages/pipeline` |
| Firestore | SQLite document store (`collection/doc/...` paths) | `src/services/docstore.ts` |
| Cloud Storage | Files under `data/storage/uploads/<uid>/<id>` | `src/services/storage.ts` |
| Firebase Auth | Stub user `local-user` (override with `X-User-Id` header) | `src/services/auth.ts` |
| Cloud Tasks | In-process runner, status in `jobs/{id}` docs | `src/services/jobs.ts` |
| Event bus | In-memory fan-out over `/ws` | `src/bus.ts` |
| Lesson pipeline | Genkit flows in `packages/pipeline`, depending only on `packages/shared/ports.ts` | `packages/pipeline` |

`local-backend` implements those ports and wires them in `src/index.ts`. It listens on `127.0.0.1` and `PORT` (8787).

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

- `GET /api/health`: status, plus whether a Gemini backend is configured
- `GET /api/me`: the stub user
- `POST /api/uploads` (multipart `file`, 20 MB max): stores the file and returns `{id, path, ...}`
- `POST /api/ai/generate` `{prompt, uploadId?, responseSchema?, model?}` returns `{text}` (JSON from Gemini). 503 if no AI backend is configured, 502 if Gemini fails.
- `GET|PUT|DELETE /api/docs/{path}`: Firestore-style docs, scoped to `users/{uid}/...`. A GET on a collection path lists its docs. `PUT ?merge=true` merges.
- `POST /api/jobs` `{kind, payload}` and `GET /api/jobs/{id}`: background jobs (`ingest` is a placeholder handler)
- `POST /api/admin/reset` (**local dev only**): wipes every document, upload and job record and returns counts of what was removed. The server keeps running.
- `POST /api/courses` (multipart, one or more PDF or JPG): stores the files, creates a course, starts generation, returns `{ courseId }`
- `GET /api/courses` and `GET /api/courses/:id`: the course, roadmap, topic status, lessons and review rounds
- `POST /api/courses/:id/topics/:topicId/segments/:segmentId/regenerate` `{ prompt? }`
- `GET /api/renders/:blobId`: a rendered keyframe PNG
- `WS /ws?courseId=...&uid=...`: snapshot, then live pipeline events. The client can send `subscribe`, `regenerate`, and `cancel`.

Data lives in `data/` (gitignored).

## Logging

Every request and response is logged with a request id (also returned as the `X-Request-ID` header), along with errors, Gemini calls (model, latency, token usage), jobs, pipeline steps and resets. Docstore and storage operations are logged at DEBUG. Output goes to the console and to rotating files:

- `logs/app.log`: human-readable
- `logs/app.jsonl`: JSON lines, e.g. `jq -c 'select(.request_id=="<id>")' logs/app.jsonl`

Settings in `.env`: `LOG_LEVEL` (INFO; DEBUG adds docstore/storage/raw model output), `LOG_BODY_MAX` (2000), `LOG_DIR` (`./logs`). Secrets (auth headers, cookies, keys, tokens) are redacted, and uploads log only name, type and size. See `.cursor/rules/debug.mdc` for recipes.
