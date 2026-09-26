from __future__ import annotations

import shutil
import time
from collections.abc import Callable
from pathlib import Path

from app.schemas import ClipGroup, ClipItem, SilenceAnalysis, SilenceOptions, SourceSegment
from app.services.clip_audio import clip_audio_dir, extract_clip_audio
from app.services.clips import build_segment_clips
from app.services.editor_state import load_manifest, update_version
from app.services.pipeline_log import PipelineContext
from app.services.segments import Word, build_segments_from_words, removed_seconds

ProgressFn = Callable[[str, float, str], None]


class RebuildResult:
    def __init__(
        self,
        *,
        version_id: str,
        clips: list[ClipItem],
        groups: list[ClipGroup],
        analysis: SilenceAnalysis,
        source_path: str,
    ) -> None:
        self.version_id = version_id
        self.clips = clips
        self.groups = groups
        self.analysis = analysis
        self.source_path = source_path


def _publish(on_progress: ProgressFn | None, phase: str, step_progress: float, message: str) -> None:
    if on_progress:
        on_progress(phase, step_progress, message)


def rebuild_audio(
    source: Path,
    *,
    version_id: str,
    options: SilenceOptions,
    similarity_threshold: float,
    on_progress: ProgressFn | None = None,
    pipeline: PipelineContext | None = None,
) -> RebuildResult:
    started = time.perf_counter()
    existing = load_manifest(source, version_id)
    if existing is None:
        raise FileNotFoundError("Analysis run not found")
    if not existing.analysis.words:
        raise ValueError("No transcript on this run")

    if pipeline:
        pipeline.version_id = version_id
        pipeline.source = source
        pipeline.phase("starting", "rebuild from existing transcript")
        pipeline.phase_complete("starting")

    _publish(on_progress, "starting", 1.0, "Starting pipeline…")

    words = [Word(text=w.text, start=w.start, end=w.end) for w in existing.analysis.words]
    source_duration = existing.analysis.source_duration

    if pipeline:
        pipeline.reset_phase_timer()
        pipeline.phase(
            "segmenting",
            "segment start",
            silence_threshold=options.silence_threshold,
            pad=options.pad,
        )

    _publish(on_progress, "segmenting", 0.5, "Building speech segments…")
    segment_started = time.perf_counter()
    segments = build_segments_from_words(
        words,
        silence_threshold=options.silence_threshold,
        pad=options.pad,
        source_duration=source_duration,
    )
    removed = removed_seconds(source_duration or 0.0, segments)

    if pipeline:
        pipeline.phase_complete(
            "segmenting",
            segment_count=len(segments),
            removed_seconds=round(removed, 2),
            elapsed_ms=int((time.perf_counter() - segment_started) * 1000),
        )

    _publish(on_progress, "segmenting", 1.0, f"Found {len(segments)} segments")

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
    audio_dir = clip_audio_dir(source, version_id)
    if audio_dir.exists():
        shutil.rmtree(audio_dir)

    extract_clip_audio(
        source,
        version_id,
        clips,
        on_progress=extract_progress,
        pipeline=pipeline,
    )
    _publish(on_progress, "extracting_audio", 1.0, f"Extracted {len(clips)} clip audio files")

    analysis = SilenceAnalysis(
        source_duration=source_duration,
        fps=existing.analysis.fps,
        segments=[
            SourceSegment(source_start=s.source_start, source_end=s.source_end) for s in segments
        ],
        removed_seconds=removed,
        words=existing.analysis.words,
    )

    processing_duration = time.perf_counter() - started
    manifest = update_version(
        source,
        version_id=version_id,
        options=options,
        similarity_threshold=similarity_threshold,
        analysis=analysis,
        clips=clips,
        groups=groups,
        processing_duration_seconds=processing_duration,
        clips_dir=str(audio_dir),
        audio_ready=True,
        pipeline=pipeline,
    )

    return RebuildResult(
        version_id=version_id,
        clips=manifest.clips,
        groups=manifest.groups,
        analysis=analysis,
        source_path=str(source.resolve()),
    )
