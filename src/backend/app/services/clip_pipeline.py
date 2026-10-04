from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path

from app.schemas import ClipGroup, ClipItem
from app.services.clip_audio import cached_source_wav, extract_clip_audio
from app.services.clips import build_segment_clips
from app.services.pipeline_log import PipelineContext
from app.services.segments import Segment, Word

ProgressFn = Callable[[str, float, str], None]


def _publish(on_progress: ProgressFn | None, phase: str, step_progress: float, message: str) -> None:
    if on_progress:
        on_progress(phase, step_progress, message)


def group_and_extract(
    source: Path,
    *,
    version_id: str,
    segments: list[Segment],
    words: list[Word],
    similarity_threshold: float,
    pad: float,
    on_progress: ProgressFn | None = None,
    pipeline: PipelineContext | None = None,
) -> tuple[list[ClipItem], list[ClipGroup]]:
    if pipeline:
        pipeline.reset_phase_timer()
        pipeline.phase(
            "grouping",
            "group start",
            similarity_threshold=similarity_threshold,
        )

    def build_progress(completed: int, total: int, message: str) -> None:
        step = completed / total if total else 1.0
        _publish(on_progress, "grouping", step * 0.5, message)

    _publish(on_progress, "grouping", 0.0, "Building segments…")
    group_started = time.perf_counter()
    clips, groups = build_segment_clips(
        source.stem,
        segments,
        words,
        similarity_threshold=similarity_threshold,
        pad=pad,
        on_progress=build_progress,
    )

    if pipeline:
        pipeline.phase_complete(
            "grouping",
            clip_count=len(clips),
            group_count=len(groups),
            elapsed_ms=int((time.perf_counter() - group_started) * 1000),
        )

    _publish(on_progress, "grouping", 1.0, f"Grouped into {len(groups)} takes")

    def extract_progress(completed: int, total: int, message: str) -> None:
        step = completed / total if total else 1.0
        _publish(on_progress, "extracting_audio", step, message)

    _publish(on_progress, "extracting_audio", 0.0, "Extracting clip audio…")
    extract_clip_audio(
        source,
        version_id,
        clips,
        on_progress=extract_progress,
        pipeline=pipeline,
        wav_path=cached_source_wav(source),
    )
    _publish(on_progress, "extracting_audio", 1.0, f"Extracted {len(clips)} clip audio files")
    return clips, groups
