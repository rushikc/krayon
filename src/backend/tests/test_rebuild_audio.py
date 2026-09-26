from __future__ import annotations

from pathlib import Path

import pytest

from app.schemas import (
    ClipGroup,
    ClipItem,
    SilenceAnalysis,
    SilenceOptions,
    SourceSegment,
    WordTiming,
)
from app.services.editor_state import load_index, load_manifest, prepare_version, save_version
from app.services.rebuild_audio import rebuild_audio


def _save_run(source: Path, words: list[WordTiming], segments: list[SourceSegment]) -> str:
    analysis = SilenceAnalysis(
        source_duration=10.0,
        fps=30.0,
        segments=segments,
        removed_seconds=8.0,
        words=words,
    )
    clip = ClipItem(
        id="old-clip",
        index=0,
        source_start=segments[0].source_start,
        source_end=segments[0].source_end,
        duration=segments[0].source_end - segments[0].source_start,
        text="hello",
        group_id="g1",
        words=words[:1],
    )
    version_id = prepare_version(source)
    save_version(
        source,
        version_id=version_id,
        options=SilenceOptions(silence_threshold=0.4, pad=0.05),
        similarity_threshold=0.5,
        analysis=analysis,
        clips=[clip],
        groups=[ClipGroup(id="g1", label="hello", clip_ids=["old-clip"])],
    )
    return version_id


def test_rebuild_skips_whisper_and_overwrites_same_run(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "scene.mp4"
    source.write_bytes(b"fake-video")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )

    def boom(*_args, **_kwargs):
        raise AssertionError("transcription should not run during rebuild")

    monkeypatch.setattr("app.services.transcribe.transcribe_words", boom)
    monkeypatch.setattr("app.services.analysis.transcribe_words", boom)
    monkeypatch.setattr(
        "app.services.rebuild_audio.extract_clip_audio",
        lambda *args, **kwargs: (1, 0),
    )

    words = [
        WordTiming(text="hello", start=1.0, end=1.2),
        WordTiming(text="later", start=2.0, end=2.2),
    ]
    version_id = _save_run(
        source,
        words,
        [SourceSegment(source_start=0.95, source_end=1.25)],
    )

    result = rebuild_audio(
        source,
        version_id=version_id,
        options=SilenceOptions(silence_threshold=1.0, pad=0.05),
        similarity_threshold=0.5,
    )

    assert result.version_id == version_id
    assert [w.text for w in result.analysis.words] == ["hello", "later"]
    assert len(result.clips) == 1
    assert result.clips[0].id != "old-clip"

    index = load_index(source)
    assert index is not None
    assert len(index.versions) == 1
    assert index.versions[0].version_id == version_id
    assert index.active_version_id == version_id

    manifest = load_manifest(source, version_id)
    assert manifest is not None
    assert manifest.options.silence_threshold == 1.0
    assert [w.text for w in manifest.analysis.words] == ["hello", "later"]
    assert manifest.clips[0].text == "hello later"


def test_rebuild_missing_run_raises(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "scene.mp4"
    source.write_bytes(b"fake")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )
    with pytest.raises(FileNotFoundError):
        rebuild_audio(
            source,
            version_id="missing",
            options=SilenceOptions(),
            similarity_threshold=0.5,
        )


def test_rebuild_empty_words_raises(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "scene.mp4"
    source.write_bytes(b"fake")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )
    version_id = _save_run(source, [], [SourceSegment(source_start=0.0, source_end=1.0)])
    with pytest.raises(ValueError, match="No transcript"):
        rebuild_audio(
            source,
            version_id=version_id,
            options=SilenceOptions(),
            similarity_threshold=0.5,
        )
