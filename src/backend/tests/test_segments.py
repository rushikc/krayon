from __future__ import annotations

import pytest

from app.services.segments import Word, build_segments_from_words, removed_seconds


def test_empty_words_yields_no_segments() -> None:
    assert (
        build_segments_from_words(
            [],
            silence_threshold=0.4,
            pad=0.05,
            source_duration=10,
        )
        == []
    )


def test_nearby_words_merge_into_one_segment() -> None:
    words = [
        Word("hello", 1.0, 1.2),
        Word("world", 1.3, 1.5),
    ]
    segments = build_segments_from_words(
        words,
        silence_threshold=0.4,
        pad=0.05,
        source_duration=10,
        min_segment_seconds=0.05,
    )
    assert len(segments) == 1
    assert segments[0].source_start == pytest.approx(0.95)
    assert segments[0].source_end == pytest.approx(1.55)


def test_gap_above_threshold_splits_segments() -> None:
    words = [
        Word("hello", 1.0, 1.2),
        Word("later", 3.0, 3.2),
    ]
    segments = build_segments_from_words(
        words,
        silence_threshold=0.4,
        pad=0.05,
        source_duration=10,
        min_segment_seconds=0.05,
    )
    assert len(segments) == 2
    assert segments[0].source_end < segments[1].source_start


def test_pad_clamps_to_source_bounds() -> None:
    words = [Word("hi", 0.0, 0.1)]
    segments = build_segments_from_words(
        words,
        silence_threshold=0.4,
        pad=0.5,
        source_duration=1.0,
        min_segment_seconds=0.05,
    )
    assert len(segments) == 1
    assert segments[0].source_start == 0.0
    assert segments[0].source_end == pytest.approx(0.6)


def test_short_segments_are_dropped() -> None:
    words = [Word("x", 1.0, 1.01)]
    segments = build_segments_from_words(
        words,
        silence_threshold=0.4,
        pad=0.0,
        source_duration=10,
        min_segment_seconds=0.5,
    )
    assert segments == []


def test_removed_seconds_is_source_minus_kept() -> None:
    words = [Word("hello", 1.0, 2.0)]
    segments = build_segments_from_words(
        words,
        silence_threshold=0.4,
        pad=0.0,
        source_duration=10,
        min_segment_seconds=0.05,
    )
    assert removed_seconds(10, segments) == pytest.approx(9.0)
