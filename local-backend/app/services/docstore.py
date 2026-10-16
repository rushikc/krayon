"""Firestore-like document store. Swap LocalDocStore for a Firestore-backed class later.

Paths follow Firestore conventions: collection/doc/collection/doc...
"""
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Protocol


class DocStore(Protocol):
    def get(self, path: str) -> dict[str, Any] | None: ...
    def set(self, path: str, data: dict[str, Any], merge: bool = False) -> dict[str, Any]: ...
    def delete(self, path: str) -> bool: ...
    def list(self, collection: str) -> list[dict[str, Any]]: ...


def _split(path: str) -> tuple[str, str]:
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) < 2 or len(parts) % 2:
        raise ValueError("A document path needs an even number of segments, e.g. users/u1/lessons/l1")
    return "/".join(parts[:-1]), parts[-1]


class LocalDocStore:
    def __init__(self, db_file: Path):
        self._lock = threading.Lock()
        self._db = sqlite3.connect(db_file, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS docs (collection TEXT, id TEXT, data TEXT, updated REAL, PRIMARY KEY (collection, id))"
        )
        self._db.commit()

    def get(self, path):
        col, doc_id = _split(path)
        row = self._db.execute("SELECT data, updated FROM docs WHERE collection=? AND id=?", (col, doc_id)).fetchone()
        return {"id": doc_id, "data": json.loads(row[0]), "updatedAt": row[1]} if row else None

    def set(self, path, data, merge=False):
        col, doc_id = _split(path)
        with self._lock:
            if merge:
                current = self.get(path)
                if current:
                    data = {**current["data"], **data}
            now = time.time()
            self._db.execute(
                "INSERT OR REPLACE INTO docs (collection, id, data, updated) VALUES (?,?,?,?)",
                (col, doc_id, json.dumps(data), now),
            )
            self._db.commit()
        return {"id": doc_id, "data": data, "updatedAt": now}

    def delete(self, path):
        col, doc_id = _split(path)
        with self._lock:
            cur = self._db.execute("DELETE FROM docs WHERE collection=? AND id=?", (col, doc_id))
            self._db.commit()
        return cur.rowcount > 0

    def list(self, collection):
        col = collection.strip("/")
        rows = self._db.execute("SELECT id, data, updated FROM docs WHERE collection=? ORDER BY updated", (col,)).fetchall()
        return [{"id": r[0], "data": json.loads(r[1]), "updatedAt": r[2]} for r in rows]
