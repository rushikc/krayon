"""Cloud Storage-like blob store. Swap LocalStorage for a GCS-backed class later."""
import json
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
        return blob

    def get(self, owner, blob_id):
        folder = self._dir(owner, blob_id)
        if not (folder / "content").exists():
            return None
        blob = Blob(**json.loads((folder / "meta.json").read_text()))
        return blob, (folder / "content").read_bytes()
