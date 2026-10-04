from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas import (
    ClipsGenerateRequest,
    ClipsGenerateResponse,
    ClipsRebuildRequest,
    SilenceAnalysis,
)
from app.services.analysis import analyze_silence
from app.services.clip_pipeline import group_and_extract
from app.services.editor_state import load_manifest, prepare_version, save_version
from app.services.ffmpeg import media_id_for_path, probe_media
from app.services.jobs import SSE_HEADERS, job_hub
from app.services.pipeline_log import PipelineContext
from app.services.pipeline_progress import overall_progress
from app.services.rebuild_audio import rebuild_audio
from app.services.segments import Segment, Word

router = APIRouter(prefix="/api/clips", tags=["clips"])

ProgressFn = Callable[[str, float, str], None]


@dataclass
class GenerateResult:
    response: ClipsGenerateResponse
    version_id: str
    analysis: SilenceAnalysis


def _generate(
    source: Path,
    body: ClipsGenerateRequest,
    on_progress: ProgressFn | None = None,
    pipeline: PipelineContext | None = None,
) -> GenerateResult:
    started = time.perf_counter()
    version_id = prepare_version(source)

    if pipeline:
        pipeline.version_id = version_id
        pipeline.media_id = media_id_for_path(source)
        pipeline.source = source
        probe = probe_media(source)
        pipeline.phase(
            "starting",
            "source probed",
            duration_s=round(probe.duration or 0, 1),
            size_bytes=probe.size,
            width=probe.width,
            height=probe.height,
            fps=round(probe.fps or 0, 2),
        )
        pipeline.phase_complete("starting")

    analysis = analyze_silence(source, body.options, on_progress=on_progress, pipeline=pipeline)

    segments = [
        Segment(source_start=s.source_start, source_end=s.source_end) for s in analysis.segments
    ]
    words = [Word(text=w.text, start=w.start, end=w.end) for w in analysis.words]

    clips, groups = group_and_extract(
        source,
        version_id=version_id,
        segments=segments,
        words=words,
        similarity_threshold=body.similarity_threshold,
        pad=body.options.pad,
        on_progress=on_progress,
        pipeline=pipeline,
    )

    processing_duration = time.perf_counter() - started
    manifest = save_version(
        source,
        version_id=version_id,
        options=body.options,
        similarity_threshold=body.similarity_threshold,
        analysis=analysis,
        clips=clips,
        groups=groups,
        processing_duration_seconds=processing_duration,
        audio_ready=True,
        pipeline=pipeline,
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
    pipeline = PipelineContext(job_id=job_id, source=source)
    pipeline.job_start(path=str(source))

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
            result = _generate(source, body, on_progress=on_progress, pipeline=pipeline)
            payload = result.response.model_dump(by_alias=True)
            payload["versionId"] = result.version_id

            pipeline.job_finish(
                version_id=result.version_id,
                clip_count=len(result.response.clips),
            )
            job_hub.publish(
                job_id,
                "complete",
                1.0,
                json.dumps(payload),
                step_progress=1.0,
            )
        except Exception as exc:
            pipeline.error("error", exc)
            job_hub.publish(job_id, "error", 1.0, str(exc), step_progress=1.0)
        finally:
            job_hub.finish(job_id)

    threading.Thread(target=run, daemon=True, name=f"clips-{job_id[:8]}").start()
    return {"jobId": job_id}


def _resolve_rebuild_source(body: ClipsRebuildRequest) -> Path:
    source = Path(body.path).expanduser().resolve()
    if not source.exists():
        raise HTTPException(status_code=404, detail="Source file not found")
    existing = load_manifest(source, body.version_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Analysis run not found")
    if not existing.analysis.words:
        raise HTTPException(status_code=400, detail="No transcript on this run")
    return source


@router.post("/rebuild", response_model=ClipsGenerateResponse, response_model_by_alias=True)
def rebuild_clips(body: ClipsRebuildRequest) -> ClipsGenerateResponse:
    source = _resolve_rebuild_source(body)
    result = rebuild_audio(
        source,
        version_id=body.version_id,
        options=body.options,
        similarity_threshold=body.similarity_threshold,
    )
    return ClipsGenerateResponse(
        source_path=result.source_path,
        groups=result.groups,
        clips=result.clips,
    )


@router.post("/rebuild/async")
def rebuild_clips_async(body: ClipsRebuildRequest) -> dict:
    source = _resolve_rebuild_source(body)

    job_id = str(uuid.uuid4())
    job_hub.create_job(job_id)
    pipeline = PipelineContext(job_id=job_id, source=source, version_id=body.version_id)
    pipeline.job_start(path=str(source), rebuild=True)

    def run():
        def on_progress(phase: str, step_progress: float, message: str) -> None:
            job_hub.publish(
                job_id,
                phase,
                overall_progress(phase, step_progress, rebuild=True),
                message,
                step_progress=step_progress,
            )

        try:
            on_progress("starting", 0.0, "Starting pipeline…")
            result = rebuild_audio(
                source,
                version_id=body.version_id,
                options=body.options,
                similarity_threshold=body.similarity_threshold,
                on_progress=on_progress,
                pipeline=pipeline,
            )
            payload = ClipsGenerateResponse(
                source_path=result.source_path,
                groups=result.groups,
                clips=result.clips,
            ).model_dump(by_alias=True)
            payload["versionId"] = result.version_id

            pipeline.job_finish(
                version_id=result.version_id,
                clip_count=len(result.clips),
            )
            job_hub.publish(
                job_id,
                "complete",
                1.0,
                json.dumps(payload),
                step_progress=1.0,
            )
        except Exception as exc:
            pipeline.error("error", exc)
            job_hub.publish(job_id, "error", 1.0, str(exc), step_progress=1.0)
        finally:
            job_hub.finish(job_id)

    threading.Thread(target=run, daemon=True, name=f"rebuild-{job_id[:8]}").start()
    return {"jobId": job_id}


@router.get("/progress/{job_id}")
async def clips_progress(job_id: str) -> StreamingResponse:
    return StreamingResponse(
        job_hub.stream(job_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
