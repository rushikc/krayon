from __future__ import annotations

from pathlib import Path

from app.services.ffmpeg import (
    is_video_file,
    media_id_for_path,
    parse_range_header,
)


def test_media_id_is_stable_for_same_path(tmp_path: Path) -> None:
    file = tmp_path / "a.mp4"
    file.write_bytes(b"x")
    assert media_id_for_path(file) == media_id_for_path(file.resolve())
    assert len(media_id_for_path(file)) == 16


def test_is_video_file_uses_extension(tmp_path: Path) -> None:
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"x")
    notes = tmp_path / "readme.txt"
    notes.write_text("nope")
    assert is_video_file(video) is True
    assert is_video_file(notes) is False


def test_parse_range_header_full_and_open_ended() -> None:
    assert parse_range_header(None, 100) is None
    assert parse_range_header("bytes=0-49", 100) == (0, 49)
    assert parse_range_header("bytes=50-", 100) == (50, 99)
    assert parse_range_header("bytes=80-200", 100) == (80, 99)
    assert parse_range_header("bytes=90-10", 100) is None
