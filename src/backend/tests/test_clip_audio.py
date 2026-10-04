from __future__ import annotations

import array
import math
import wave
from pathlib import Path

import pytest

from app.schemas import ClipGroup, ClipItem, SilenceAnalysis, SilenceOptions, SourceSegment, WordTiming
from app.services.clip_audio import clip_audio_path, extract_clip_audio
from app.services.editor_state import load_manifest, prepare_version, save_version
from app.services.rebuild_audio import rebuild_audio


RATE = 16000


def _write_wav(path: Path, samples: list[int], rate: int = RATE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(array.array("h", samples).tobytes())


def _read_nframes(path: Path) -> int:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes()


def test_wav_slice_matches_range_sample_count(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "scene.mp4"
    source.write_bytes(b"fake")
    cache = tmp_path / ".krayon"
    monkeypatch.setattr("app.services.editor_state.krayon_cache_dir", lambda folder: cache)
    monkeypatch.setattr("app.services.ffmpeg.krayon_cache_dir", lambda folder: cache)
    monkeypatch.setattr("app.services.clip_audio.krayon_cache_dir", lambda folder: cache)

    wav = cache / f"{source.stem}.wav"
    duration_s = 2.0
    samples = [int(8000 * math.sin(2 * math.pi * 440 * i / RATE)) for i in range(int(RATE * duration_s))]
    _write_wav(wav, samples)

    version_id = "v1"
    clip = ClipItem(
        id="take_seg_000",
        index=0,
        source_start=0.25,
        source_end=1.25,
        duration=0.75,
        text="hello",
        group_id="g1",
        ranges=[
            SourceSegment(source_start=0.25, source_end=0.75),
            SourceSegment(source_start=1.0, source_end=1.25),
        ],
    )
    extract_clip_audio(source, version_id, [clip], wav_path=wav)
    out = clip_audio_path(source, version_id, clip.id)
    expected = int(round(0.5 * RATE)) + int(round(0.25 * RATE))
    assert _read_nframes(out) == expected


def test_failed_extract_keeps_existing_audio(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "scene.mp4"
    source.write_bytes(b"fake")
    cache = tmp_path / ".krayon"
    monkeypatch.setattr("app.services.editor_state.krayon_cache_dir", lambda folder: cache)

    analysis = SilenceAnalysis(
        source_duration=10.0,
        fps=30.0,
        segments=[SourceSegment(source_start=0.0, source_end=1.0)],
        removed_seconds=9.0,
        words=[WordTiming(text="hello", start=0.1, end=0.4)],
    )
    clip = ClipItem(
        id="old-clip",
        index=0,
        source_start=0.0,
        source_end=1.0,
        duration=1.0,
        text="hello",
        group_id="g1",
    )
    version_id = prepare_version(source)
    save_version(
        source,
        version_id=version_id,
        options=SilenceOptions(),
        similarity_threshold=0.7,
        analysis=analysis,
        clips=[clip],
        groups=[ClipGroup(id="g1", label="hello", clip_ids=["old-clip"])],
        audio_ready=True,
    )
    existing = clip_audio_path(source, version_id, "old-clip")
    existing.parent.mkdir(parents=True, exist_ok=True)
    existing.write_bytes(b"OLDWAV")

    def boom(*_args, **_kwargs):
        raise RuntimeError("extract failed")

    monkeypatch.setattr("app.services.clip_pipeline.extract_clip_audio", boom)

    with pytest.raises(RuntimeError, match="extract failed"):
        rebuild_audio(
            source,
            version_id=version_id,
            options=SilenceOptions(),
            similarity_threshold=0.7,
        )

    assert existing.read_bytes() == b"OLDWAV"
    manifest = load_manifest(source, version_id)
    assert manifest is not None
    assert manifest.clips[0].id == "old-clip"
