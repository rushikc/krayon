from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas import ClipsGenerateRequest, ClipsGenerateResponse, SilenceAnalysis
from app.services.analysis import analyze_silence
from app.services.clips import build_segment_clips
from app.services.editor_state import prepare_version, save_version
from app.services.jobs import SSE_HEADERS, job_hub
from app.services.pipeline_progress import overall_progress
from app.services.segments import Segment, Word

router = APIRouter(prefix="/api/clips", tags=["clips"])

ProgressFn = Callable[[str, float, str], None]


@dataclass
class GenerateResult:
    response: ClipsGenerateResponse
    version_id: str
    analysis: SilenceAnalysis


def _publish(on_progress: ProgressFn | None, phase: str, step_progress: float, message: str) -> None:
    if on_progress:
        on_progress(phase, step_progress, message)


def _generate(
    source: Path,
    body: ClipsGenerateRequest,
    on_progress: ProgressFn | None = None,
) -> GenerateResult:
    version_id = prepare_version(source)

    analysis = analyze_silence(source, body.options, on_progress=on_progress)

    segments = [
        Segment(source_start=s.source_start, source_end=s.source_end) for s in analysis.segments
    ]
    words = [Word(text=w.text, start=w.start, end=w.end) for w in analysis.words]

    def build_progress(completed: int, total: int, message: str) -> None:
        step = completed / total if total else 1.0
        _publish(on_progress, "grouping", step * 0.5, message)

    _publish(on_progress, "grouping", 0.0, "Building segments…")
    clips, groups = build_segment_clips(
        source.stem,
        segments,
        words,
        similarity_threshold=body.similarity_threshold,
        on_progress=build_progress,
    )

    _publish(on_progress, "grouping", 1.0, f"Grouped into {len(groups)} takes")

    manifest = save_version(
        source,
        version_id=version_id,
        options=body.options,
        similarity_threshold=body.similarity_threshold,
        analysis=analysis,
        clips=clips,
        groups=groups,
    )

    response = ClipsGenerateResponse(
        source_path=str(source.resolve()),
        groups=manifest.groups,
        clips=manifest.clips,
    )
    return GenerateResult(response=response, version_id=version_id, analysis=analysis)


@router.post("/generate", response_model=ClipsGenerateResponse, response_model_by_alias=True)
def generate_clips(body: ClipsGenerateRequest) -> ClipsGenerateResponse:
    source = Path(body.path).expanduser().resolve()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Source file not found")
    return _generate(source, body).response


@router.post("/generate/async")
def generate_clips_async(body: ClipsGenerateRequest) -> dict:
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
            on_progress("starting", 0.0, "Starting pipeline…")
            on_progress("starting", 1.0, "Starting pipeline…")
            result = _generate(source, body, on_progress=on_progress)
            payload = result.response.model_dump(by_alias=True)
            payload["versionId"] = result.version_id
            import json

            job_hub.publish(
                job_id,
                "complete",
                1.0,
                json.dumps(payload),
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
async def clips_progress(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        job_hub.stream(job_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
