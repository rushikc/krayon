# local-backend: purpose and rules

local-backend is a LOCAL-ONLY development backend for Krayon. It mimics the Google Cloud services the real backend will use, so the full pipeline can run on a laptop.

- It is never deployed. Do not add Dockerfiles, container configs, Cloud Run/Cloud Functions/App Engine configs, Cloud Build files, Terraform, deploy scripts, or CI deploy workflows here.
- Cloud resources are mocked: Firestore → SQLite (data/firestore.sqlite3), Cloud Storage → local files (data/storage), Cloud Tasks/Functions → in-process job runner, Firebase Auth → X-User-Id header stub, event bus → in-memory WebSocket fan-out.
- Real Google APIs/SDKs ARE allowed (Gemini on Vertex via Application Default Credentials, Genkit, Remotion rendering) because they are called from the laptop, not hosted in the cloud.
- Business logic belongs in packages/pipeline (stages and handlers) and packages/api (HTTP). local-backend only implements the ports locally and mounts registerKrayonApi.
- Anything cloud-hosted or deployable goes in backend/ (the separate cloud backend), never here.
- Keep the logging contract: logs/app.log + logs/app.jsonl, request ids, redaction, truncated bodies.
