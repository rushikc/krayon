from __future__ import annotations

from app.services.clips import (
    build_segment_clips,
    group_clips_by_text,
    normalize_text,
    similarity,
)
from app.services.segments import Segment, Word


def test_normalize_text_strips_fillers_and_punctuation() -> None:
    assert normalize_text("Um, hello, you know world!") == "hello world"


def test_retake_prefix_counts_as_full_match() -> None:
    a = "the quick brown fox jumps over"
    b = "the quick brown fox sits down"
    assert similarity(a, b) == 1.0


def test_group_clips_merges_similar_takes() -> None:
    mapping = group_clips_by_text(
        [
            ("a", "the quick brown fox jumps"),
            ("b", "the quick brown fox sits"),
            ("c", "completely different sentence here"),
        ],
        threshold=0.5,
    )
    assert mapping["a"] == mapping["b"]
    assert mapping["c"] != mapping["a"]


def test_build_segment_clips_assigns_groups_and_words() -> None:
    segments = [
        Segment(source_start=0.0, source_end=1.0),
        Segment(source_start=2.0, source_end=3.0),
    ]
    words = [
        Word("hello", 0.1, 0.4),
        Word("there", 0.5, 0.8),
        Word("goodbye", 2.1, 2.6),
    ]
    clips, groups = build_segment_clips("take", segments, words, similarity_threshold=0.9)
    assert len(clips) == 2
    assert clips[0].id == "take_seg_000"
    assert clips[0].text == "hello there"
    assert clips[1].text == "goodbye"
    assert all(clip.group_id != "pending" for clip in clips)
    grouped_ids = {clip_id for group in groups for clip_id in group.clip_ids}
    assert grouped_ids == {"take_seg_000", "take_seg_001"}
