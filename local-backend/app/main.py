import json
import logging

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import ai_backend, settings
from .logging_setup import setup_logging
from .request_logging import RequestLogMiddleware
from .services.auth import User, current_user
from .services.docstore import LocalDocStore
from .services.gemini import GeminiNotConfigured, generate_json
from .services.jobs import LocalJobRunner
from .services.storage import LocalStorage

setup_logging()
log = logging.getLogger("krayon.app")

app = FastAPI(title="Krayon local backend", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-Request-ID"])
app.add_middleware(RequestLogMiddleware)  # added last = outermost, so it sees every request

store = LocalDocStore(settings.data_dir / "firestore.sqlite3")
storage = LocalStorage(settings.data_dir / "storage")
jobs = LocalJobRunner(store)


def _ingest(payload: dict) -> dict:
    # Placeholder for server-side ingestion (PDF split, OCR, roadmap) once it moves off the client.
    return {"received": payload}


jobs.register("ingest", _ingest)
log.info("local-backend ready", extra={"data": {"event": "startup", "ai": ai_backend(), "project": settings.google_cloud_project,
                                                "location": settings.google_cloud_location, "data_dir": str(settings.data_dir)}})


@app.get("/api/health")
def health():
    return {"ok": True, "ai": ai_backend(), "project": settings.google_cloud_project,
            "location": settings.google_cloud_location, "model": settings.gemini_model,
            "services": {"firestore": "local-sqlite", "storage": "local-files", "auth": "stub", "jobs": "in-process"}}


@app.get("/api/me")
async def me(user: User = Depends(current_user)):
    return user.__dict__


# ---- Cloud Storage stand-in -------------------------------------------------
@app.post("/api/uploads")
async def upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "File is larger than 20 MB.")
    name = file.filename or "upload"
    ctype = file.content_type or ("application/pdf" if name.lower().endswith(".pdf") else "image/jpeg")
    blob = storage.put(user.uid, name, ctype, data)
    store.set(f"users/{user.uid}/uploads/{blob.id}", blob.__dict__)
    return blob.__dict__


# ---- Gemini (real) ----------------------------------------------------------
class GenerateRequest(BaseModel):
    prompt: str
    uploadId: str | None = None
    responseSchema: dict | None = None
    model: str | None = None


@app.post("/api/ai/generate")
async def ai_generate(req: GenerateRequest, user: User = Depends(current_user)):
    file_bytes = mime = None
    if req.uploadId:
        found = storage.get(user.uid, req.uploadId)
        if not found:
            raise HTTPException(404, "Upload not found. Upload the file again.")
        blob, file_bytes = found
        mime = blob.content_type
    try:
        import anyio

        text = await anyio.to_thread.run_sync(
            lambda: generate_json(req.prompt, req.responseSchema, file_bytes, mime, req.model))
    except GeminiNotConfigured as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:  # noqa: BLE001 (already logged with traceback in gemini.py)
        raise HTTPException(502, f"Gemini request failed: {exc}")
    return {"text": text}


# ---- Firestore stand-in -----------------------------------------------------
def _scoped(user: User, path: str) -> str:
    # Mirrors a security rule: users can only touch users/{uid}/...
    path = path.strip("/")
    if not path.startswith(f"users/{user.uid}/"):
        raise HTTPException(403, f"Paths must start with users/{user.uid}/")
    return path


@app.get("/api/docs/{path:path}")
async def get_doc(path: str, user: User = Depends(current_user)):
    path = _scoped(user, path)
    if len([p for p in path.split("/") if p]) % 2:
        return {"docs": store.list(path)}
    doc = store.get(path)
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@app.put("/api/docs/{path:path}")
async def put_doc(path: str, body: dict, merge: bool = False, user: User = Depends(current_user)):
    try:
        return store.set(_scoped(user, path), body, merge=merge)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.delete("/api/docs/{path:path}")
async def delete_doc(path: str, user: User = Depends(current_user)):
    return {"deleted": store.delete(_scoped(user, path))}


# ---- Local dev only: wipe everything ------------------------------------------
# DEV TOOL. Deletes every document (lessons, marks, uploads metadata, jobs) and every
# uploaded file. There is no Cloud equivalent; do not deploy this route.
@app.post("/api/admin/reset")
async def admin_reset():
    docs = store.clear()
    files = storage.clear()
    log.warning("Admin reset: wiped local data", extra={"data": {"event": "reset", "documents": sum(docs.values()),
                                                                  "byCollection": docs, **files}})
    return {"ok": True, "removed": {"documents": sum(docs.values()), "byCollection": docs, **files}}


# ---- Cloud Run / Functions job seam -----------------------------------------
class JobRequest(BaseModel):
    kind: str
    payload: dict = {}


@app.post("/api/jobs")
async def create_job(req: JobRequest, user: User = Depends(current_user)):
    try:
        return {"id": jobs.submit(user.uid, req.kind, req.payload)}
    except KeyError as exc:
        raise HTTPException(400, exc.args[0] if exc.args else "Unknown job kind")


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, user: User = Depends(current_user)):
    doc = store.get(f"jobs/{job_id}")
    if not doc or doc["data"].get("owner") != user.uid:
        raise HTTPException(404, "Not found")
    return doc
