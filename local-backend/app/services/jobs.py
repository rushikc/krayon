"""Seam for Cloud Run jobs / Cloud Functions / Cloud Tasks.

Locally, jobs run in-process on a thread pool and their status is stored as a
document in the `jobs` collection, the same way a Firestore-triggered function would report it.
"""
import logging
import contextvars
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from .docstore import DocStore

log = logging.getLogger("krayon.jobs")
Handler = Callable[[dict[str, Any]], dict[str, Any]]


class LocalJobRunner:
    def __init__(self, store: DocStore, workers: int = 2):
        self.store = store
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.handlers: dict[str, Handler] = {}

    def register(self, kind: str, handler: Handler) -> None:
        self.handlers[kind] = handler

    def submit(self, owner: str, kind: str, payload: dict[str, Any]) -> str:
        if kind not in self.handlers:
            raise KeyError(f"No job handler named {kind}")
        job_id = uuid.uuid4().hex
        path = f"jobs/{job_id}"
        self.store.set(path, {"owner": owner, "kind": kind, "status": "queued", "payload": payload})
        log.info("Job queued %s", kind, extra={"data": {"event": "job", "job_id": job_id, "kind": kind, "status": "queued", "owner": owner}})
        ctx = contextvars.copy_context()  # keep the request id in the worker thread's logs

        def run():
            start = time.perf_counter()
            self.store.set(path, {"status": "running"}, merge=True)
            log.info("Job running %s", kind, extra={"data": {"event": "job", "job_id": job_id, "kind": kind, "status": "running"}})
            try:
                result = self.handlers[kind](payload)
                self.store.set(path, {"status": "done", "result": result}, merge=True)
                log.info("Job done %s", kind, extra={"data": {"event": "job", "job_id": job_id, "kind": kind, "status": "done",
                                                               "duration_ms": round((time.perf_counter() - start) * 1000, 1)}})
            except Exception as exc:  # noqa: BLE001
                log.exception("Job failed %s", kind, extra={"data": {"event": "job", "job_id": job_id, "kind": kind, "status": "error"}})
                self.store.set(path, {"status": "error", "error": str(exc)}, merge=True)

        self.pool.submit(ctx.run, run)
        return job_id
