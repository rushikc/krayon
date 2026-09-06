from __future__ import annotations

from pathlib import Path

from app.services.editor_state import (
    load_active_state,
    prepare_version,
    save_version,
    set_active_version,
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


def test_unknown_version_does_not_switch(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "reel.mp4"
    source.write_bytes(b"fake")
    monkeypatch.setattr(
        "app.services.editor_state.krayon_cache_dir",
        lambda folder: tmp_path / ".krayon",
    )
    assert set_active_version(source, "missing") is None
