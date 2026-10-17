# local-backend

A FastAPI server on your machine that stands in for Google Cloud / Firebase. Every API call from the frontend goes through it, so it can later be deployed to Cloud Run / Cloud Functions with little change.

| Cloud piece | Local stand-in | Code |
|---|---|---|
| Gemini | **Real** Vertex AI calls (project `krayon-ai`, location `global`) via gcloud ADC; `GEMINI_API_KEY` as an optional fallback | `app/services/gemini.py` |
| Firestore | SQLite document store (`collection/doc/...` paths) | `app/services/docstore.py` |
| Cloud Storage | Files under `data/storage/uploads/<uid>/<id>` | `app/services/storage.py` |
| Firebase Auth | Stub user `local-user` (override with `X-User-Id` header) | `app/services/auth.py` |
| Cloud Run jobs / Functions / Tasks | In-process thread pool, status in `jobs/{id}` docs | `app/services/jobs.py` |

Each one is a small class behind a Protocol. To move to the cloud, add a Firestore/GCS/firebase-admin implementation and swap it in `app/main.py`.

## Run

```bash
cd local-backend
gcloud auth application-default login   # once, if you haven't already
cp .env.example .env
./run.sh                      # creates .venv, installs deps, starts on :8787
# or manually:
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8787
```

Then `cd frontend && npm run dev`. Vite proxies `/api` to `http://localhost:8787` (change with `LOCAL_BACKEND_URL`; set `VITE_API_BASE_URL` to call a deployed backend directly).

## Endpoints

- `GET /api/health`: status, plus whether a Gemini key is configured
- `GET /api/me`: the stub user
- `POST /api/uploads` (multipart `file`, 20 MB max): stores the file and returns `{id, path, ...}`
- `POST /api/ai/generate` `{prompt, uploadId?, responseSchema?, model?}` returns `{text}` (JSON from Gemini). 503 if no AI backend is configured, 502 if Gemini fails.
- `GET|PUT|DELETE /api/docs/{path}`: Firestore-style docs, scoped to `users/{uid}/...`. A GET on a collection path lists its docs. `PUT ?merge=true` merges.
- `POST /api/jobs` `{kind, payload}` and `GET /api/jobs/{id}`: background jobs (`ingest` is a placeholder handler)

- `POST /api/admin/reset` (**local dev only**): wipes every document, upload and job record and returns counts of what was removed. The server keeps running. The header's "Clear resources" button calls this.

Data lives in `data/` (gitignored).

## Logging

Every request and response is logged with a request id (also returned as the `X-Request-ID` header), along with errors and tracebacks, Gemini calls (model, latency, token usage), jobs and resets. Docstore and storage operations are logged at DEBUG. Output goes to the console and to rotating files:

- `logs/app.log`: human-readable
- `logs/app.jsonl`: JSON lines, e.g. `jq -c 'select(.request_id=="<id>")' logs/app.jsonl`

Settings in `.env`: `LOG_LEVEL` (INFO; DEBUG adds docstore/storage/raw model output), `LOG_BODY_MAX` (2000), `LOG_DIR` (`./logs`). Secrets (auth headers, cookies, keys, tokens) are redacted, and uploads log only name, type and size. See `.cursor/rules/debug.mdc` for recipes.
