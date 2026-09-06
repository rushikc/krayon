from __future__ import annotations

from app.services.jobs import JobHub
from app.schemas import JobProgress


def test_unknown_job_stream_emits_error() -> None:
    hub = JobHub()
    chunks = []

    async def collect() -> None:
        async for chunk in hub.stream("missing"):
            chunks.append(chunk)

    import asyncio

    asyncio.run(collect())
    assert "unknown job" in chunks[0]


def test_publish_and_finish_stream() -> None:
    import asyncio

    hub = JobHub()
    hub.create_job("job-1")
    hub.publish("job-1", "transcribe", 0.5, "working")
    hub.finish("job-1")

    chunks: list[str] = []

    async def collect() -> None:
        async for chunk in hub.stream("job-1"):
            chunks.append(chunk)

    asyncio.run(collect())
    assert any("transcribe" in chunk for chunk in chunks)
    assert any('"done": true' in chunk.replace(" ", "") or '"done":true' in chunk.replace(" ", "") for chunk in chunks)
    progress = JobProgress(
        job_id="job-1",
        phase="transcribe",
        progress=0.5,
        message="working",
    )
    assert progress.job_id == "job-1"
