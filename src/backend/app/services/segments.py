from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import settings


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Segment:
    source_start: float
    source_end: float

    @property
    def duration(self) -> float:
        return self.source_end - self.source_start


def build_segments_from_words(
    words: list[Word],
    *,
    silence_threshold: float,
    pad: float,
    source_duration: float,
    min_segment_seconds: float | None = None,
) -> list[Segment]:
    if not words:
        return []

    min_len = min_segment_seconds if min_segment_seconds is not None else settings.min_segment_seconds

    padded: list[tuple[float, float]] = []
    for word in words:
        start = max(0.0, word.start - pad)
        end = min(source_duration, word.end + pad)
        if not padded or start > padded[-1][1] + silence_threshold:
            padded.append((start, end))
        else:
            prev_start, prev_end = padded[-1]
            padded[-1] = (prev_start, max(prev_end, end))

    segments: list[Segment] = []
    for source_start, source_end in padded:
        if source_end - source_start < min_len:
            continue
        segments.append(Segment(source_start=source_start, source_end=source_end))
    return segments


def removed_seconds(source_duration: float, segments: list[Segment]) -> float:
    kept = sum(seg.duration for seg in segments)
    return max(0.0, source_duration - kept)
