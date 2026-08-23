from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas import SilenceAnalysis, SilenceAnalyzeRequest
from app.services.analysis import analyze_silence
from app.services.jobs import SSE_HEADERS, job_hub
from app.services.pipeline_progress import overall_progress

router = APIRouter(prefix="/api/silence", tags=["silence"])


@router.post("/analyze", response_model=SilenceAnalysis, response_model_by_alias=True)
def analyze_silence_route(body: SilenceAnalyzeRequest) -> SilenceAnalysis:
    source = Path(body.path).expanduser().resolve()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Source file not found")
    return analyze_silence(source, body.options)


@router.post("/analyze/async")
def analyze_silence_async(body: SilenceAnalyzeRequest) -> dict:
    source = Path(body.path).expanduser().resolve()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Source file not found")

    job_id = str(uuid.uuid4())
    job_hub.create_job(job_id)

    def run():
        def on_progress(phase: str, step_progress: float, message: str) -> None:
            job_hub.publish(
                job_id,
                phase,
                overall_progress(phase, step_progress),
                message,
                step_progress=step_progress,
            )

        try:
            on_progress("starting", 0.0, "Starting analysis…")
            result = analyze_silence(source, body.options, on_progress=on_progress)
            job_hub.publish(
                job_id,
                "complete",
                1.0,
                result.model_dump_json(by_alias=True),
                step_progress=1.0,
            )
        except Exception as exc:
            job_hub.publish(job_id, "error", 1.0, str(exc), step_progress=1.0)
        finally:
            job_hub.finish(job_id)

    import threading

    threading.Thread(target=run, daemon=True).start()
    return {"jobId": job_id}


@router.get("/progress/{job_id}")
async def silence_progress(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        job_hub.stream(job_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
