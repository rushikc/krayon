from __future__ import annotations

from pathlib import Path

from app.services.editor_state import (
    load_active_state,
    load_index,
    load_manifest,
    prepare_version,
    save_version,
    set_active_version,
    update_version,
)
from app.schemas import (
    ClipGroup,
    ClipItem,
    SilenceAnalysis,
    SilenceOptions,
    SourceSegment,
    WordTiming,
)


def test_save_load_and_switch_versions(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "reel.mp4"
    source.write_bytes(b"fake-video")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )

    analysis = SilenceAnalysis(
        source_duration=10.0,
        fps=30.0,
        segments=[SourceSegment(source_start=0.0, source_end=2.0)],
        removed_seconds=8.0,
        words=[WordTiming(text="hello", start=0.1, end=0.4)],
    )
    clip = ClipItem(
        id="clip-1",
        index=0,
        source_start=0.0,
        source_end=2.0,
        duration=2.0,
        text="hello",
        group_id="g1",
        words=[WordTiming(text="hello", start=0.1, end=0.4)],
    )
    group = ClipGroup(id="g1", label="hello", clip_ids=["clip-1"])
    options = SilenceOptions()

    first_id = prepare_version(source)
    save_version(
        source,
        version_id=first_id,
        options=options,
        similarity_threshold=0.5,
        analysis=analysis,
        clips=[clip],
        groups=[group],
        processing_duration_seconds=1.2,
    )

    second_id = prepare_version(source)
    later_clip = clip.model_copy(update={"id": "clip-2", "text": "later"})
    save_version(
        source,
        version_id=second_id,
        options=options,
        similarity_threshold=0.5,
        analysis=analysis,
        clips=[later_clip],
        groups=[ClipGroup(id="g1", label="later", clip_ids=["clip-2"])],
    )

    active = load_active_state(source)
    assert active is not None
    assert active.index.active_version_id == second_id
    assert active.active_version.clips[0].id == "clip-2"
    assert "hello" in active.active_version.transcript

    switched = set_active_version(source, first_id)
    assert switched is not None
    assert switched.active_version_id == first_id
    restored = load_active_state(source)
    assert restored is not None
    assert restored.active_version.clips[0].id == "clip-1"


def test_update_version_overwrites_in_place(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "reel.mp4"
    source.write_bytes(b"fake-video")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )

    words = [WordTiming(text="hello", start=0.1, end=0.4)]
    analysis = SilenceAnalysis(
        source_duration=10.0,
        fps=30.0,
        segments=[SourceSegment(source_start=0.0, source_end=2.0)],
        removed_seconds=8.0,
        words=words,
    )
    original_clip = ClipItem(
        id="clip-1",
        index=0,
        source_start=0.0,
        source_end=2.0,
        duration=2.0,
        text="hello",
        group_id="g1",
        words=words,
    )
    options = SilenceOptions()

    first_id = prepare_version(source)
    save_version(
        source,
        version_id=first_id,
        options=options,
        similarity_threshold=0.5,
        analysis=analysis,
        clips=[original_clip],
        groups=[ClipGroup(id="g1", label="hello", clip_ids=["clip-1"])],
    )

    second_id = prepare_version(source)
    save_version(
        source,
        version_id=second_id,
        options=options,
        similarity_threshold=0.5,
        analysis=analysis,
        clips=[original_clip.model_copy(update={"id": "clip-2"})],
        groups=[ClipGroup(id="g1", label="hello", clip_ids=["clip-2"])],
    )

    rebuilt_clip = ClipItem(
        id="clip-rebuilt",
        index=0,
        source_start=0.0,
        source_end=3.0,
        duration=3.0,
        text="hello",
        group_id="g2",
        words=words,
    )
    tighter = SilenceOptions(silence_threshold=0.2, pad=0.01)
    rebuilt_analysis = analysis.model_copy(
        update={
            "segments": [SourceSegment(source_start=0.0, source_end=3.0)],
            "removed_seconds": 7.0,
        }
    )
    updated = update_version(
        source,
        version_id=first_id,
        options=tighter,
        similarity_threshold=0.8,
        analysis=rebuilt_analysis,
        clips=[rebuilt_clip],
        groups=[ClipGroup(id="g2", label="hello", clip_ids=["clip-rebuilt"])],
    )

    assert updated.version_id == first_id
    assert updated.clips[0].id == "clip-rebuilt"
    assert updated.analysis.words == words
    assert updated.transcript == "hello"
    assert updated.options.silence_threshold == 0.2
    assert updated.similarity_threshold == 0.8

    index = load_index(source)
    assert index is not None
    assert len(index.versions) == 2
    assert index.versions[0].version_id == first_id
    assert index.versions[0].label.startswith("Run 1 ·")
    assert index.versions[0].clip_count == 1
    assert index.versions[1].version_id == second_id
    assert index.active_version_id == first_id

    manifest = load_manifest(source, first_id)
    assert manifest is not None
    assert manifest.clips[0].id == "clip-rebuilt"
    assert [w.text for w in manifest.analysis.words] == ["hello"]


def test_unknown_version_does_not_switch(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "reel.mp4"
    source.write_bytes(b"fake")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )
    assert set_active_version(source, "missing") is None
