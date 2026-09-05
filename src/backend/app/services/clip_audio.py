from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from app.config import settings
from app.schemas import ClipItem
from app.services.editor_state import version_dir
from app.services.ffmpeg import run_command
from app.services.pipeline_log import PipelineContext

ProgressFn = Callable[[int, int, str], None]


def clip_audio_dir(source: Path, version_id: str) -> Path:
    return version_dir(source, version_id) / "audio"


def clip_audio_path(source: Path, version_id: str, clip_id: str) -> Path:
    return clip_audio_dir(source, version_id) / f"{clip_id}.wav"


def extract_clip_audio(
    source: Path,
    version_id: str,
    clips: list[ClipItem],
    *,
    on_progress: ProgressFn | None = None,
    pipeline: PipelineContext | None = None,
) -> tuple[int, int]:
    audio_dir = clip_audio_dir(source, version_id)
    audio_dir.mkdir(parents=True, exist_ok=True)

    total = len(clips)
    total_bytes = 0

    if pipeline:
        pipeline.phase("extracting_audio", "extract clip audio start", clip_count=total)

    for index, clip in enumerate(clips):
        output = clip_audio_path(source, version_id, clip.id)
        run_command(
            [
                settings.ffmpeg,
                "-y",
                "-ss",
                str(clip.source_start),
                "-to",
                str(clip.source_end),
                "-i",
                str(source),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(output),
            ]
        )
        total_bytes += output.stat().st_size

        if on_progress:
            on_progress(index + 1, total, f"Extracting audio {index + 1}/{total}")

        if pipeline and ((index + 1) % 5 == 0 or index + 1 == total):
            pipeline.phase(
                "extracting_audio",
                "extract clip audio progress",
                clip_index=index + 1,
                clip_total=total,
            )

    if pipeline:
        pipeline.phase_complete(
            "extracting_audio",
            clips_extracted=total,
            total_audio_bytes=total_bytes,
        )

    return total, total_bytes
