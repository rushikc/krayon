from __future__ import annotations

from pathlib import Path
from typing import Callable

from app.schemas import SilenceAnalysis, SourceSegment, WordTiming
from app.services.ffmpeg import krayon_cache_dir, probe_media
from app.services.segments import build_segments_from_words, removed_seconds
from app.services.transcribe import transcribe_words


ProgressCallback = Callable[[str, float, str], None]


def analyze_silence(
    source: Path,
    options,
    on_progress: ProgressCallback | None = None,
) -> SilenceAnalysis:
    probe = probe_media(source)
    cache = krayon_cache_dir(source.parent)
    cache.mkdir(parents=True, exist_ok=True)
    wav_path = cache / f"{source.stem}.wav"

    def transcribe_progress(ratio: float, message: str) -> None:
        if on_progress:
            on_progress("transcribing", ratio, message)

    words = transcribe_words(
        source,
        wav_path,
        language=options.language,
        on_progress=transcribe_progress,
    )

    if on_progress:
        on_progress("segmenting", 0.5, "Building speech segments…")

    segments = build_segments_from_words(
        words,
        silence_threshold=options.silence_threshold,
        pad=options.pad,
        source_duration=probe.duration,
    )

    if on_progress:
        on_progress("segmenting", 1.0, f"Found {len(segments)} segments")

    return SilenceAnalysis(
        source_duration=probe.duration or 0.0,
        fps=probe.fps or 30.0,
        segments=[
            SourceSegment(source_start=s.source_start, source_end=s.source_end) for s in segments
        ],
        removed_seconds=removed_seconds(probe.duration or 0.0, segments),
        words=[WordTiming(text=w.text, start=w.start, end=w.end) for w in words],
    )
