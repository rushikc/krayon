"""Cloud Storage-like blob store. Swap LocalStorage for a GCS-backed class later."""
import json
import logging
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class Blob:
    id: str
    name: str
    content_type: str
    size: int
    path: str  # object path, like gs://bucket/<path>


class BlobStorage(Protocol):
    def put(self, owner: str, name: str, content_type: str, data: bytes) -> Blob: ...
    def get(self, owner: str, blob_id: str) -> tuple[Blob, bytes] | None: ...


log = logging.getLogger("krayon.storage")


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def _dir(self, owner: str, blob_id: str) -> Path:
        safe = lambda s: re.sub(r"[^A-Za-z0-9_.-]", "_", s)
        return self.root / "uploads" / safe(owner) / safe(blob_id)

    def put(self, owner, name, content_type, data):
        blob_id = uuid.uuid4().hex
        folder = self._dir(owner, blob_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "content").write_bytes(data)
        blob = Blob(blob_id, name, content_type, len(data), f"uploads/{owner}/{blob_id}")
        (folder / "meta.json").write_text(json.dumps(blob.__dict__))
        log.debug("put %s", blob.path, extra={"data": {"event": "storage.put", "path": blob.path, "name": name,
                                                        "content_type": content_type, "size": len(data)}})
        return blob

    def clear(self) -> dict[str, int]:
        """Delete every stored object and recreate the empty root."""
        import shutil

        files = sum(1 for p in self.root.rglob("content") if p.is_file())
        size = sum(p.stat().st_size for p in self.root.rglob("*") if p.is_file())
        shutil.rmtree(self.root, ignore_errors=True)
        self.root.mkdir(parents=True, exist_ok=True)
        log.debug("clear", extra={"data": {"event": "storage.clear", "files": files, "bytes": size}})
        return {"files": files, "bytes": size}

    def get(self, owner, blob_id):
        folder = self._dir(owner, blob_id)
        if not (folder / "content").exists():
            log.debug("get miss %s/%s", owner, blob_id, extra={"data": {"event": "storage.get", "owner": owner, "id": blob_id, "found": False}})
            return None
        log.debug("get %s/%s", owner, blob_id, extra={"data": {"event": "storage.get", "owner": owner, "id": blob_id, "found": True}})
        blob = Blob(**json.loads((folder / "meta.json").read_text()))
        return blob, (folder / "content").read_bytes()
