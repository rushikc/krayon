from __future__ import annotations

import asyncio
import json
import queue
from typing import AsyncGenerator

from app.schemas import JobProgress

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


class JobHub:
    def __init__(self) -> None:
        self._queues: dict[str, queue.Queue[JobProgress | None]] = {}

    def create_job(self, job_id: str) -> None:
        self._queues[job_id] = queue.Queue()

    def publish(
        self,
        job_id: str,
        phase: str,
        progress: float,
        message: str,
        *,
        step_progress: float | None = None,
    ) -> None:
        q = self._queues.get(job_id)
        if not q:
            return
        q.put(
            JobProgress(
                job_id=job_id,
                phase=phase,
                progress=progress,
                step_progress=step_progress if step_progress is not None else progress,
                message=message,
            )
        )

    def finish(self, job_id: str) -> None:
        q = self._queues.get(job_id)
        if q:
            q.put(None)

    async def stream(self, job_id: str) -> AsyncGenerator[str, None]:
        q = self._queues.get(job_id)
        if not q:
            yield f"data: {json.dumps({'error': 'unknown job'})}\n\n"
            return

        try:
            while True:
                item = await asyncio.to_thread(q.get)
                if item is None:
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    break
                yield f"data: {item.model_dump_json(by_alias=True)}\n\n"
        finally:
            self._queues.pop(job_id, None)


job_hub = JobHub()
