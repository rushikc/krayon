from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.schemas import (
    ClipGroup,
    ClipItem,
    ClipsGenerateResponse,
    EditorStateIndex,
    EditorStateManifest,
    EditorStateResponse,
    EditorVersionSummary,
    SilenceAnalysis,
    SilenceOptions,
)
from app.services.ffmpeg import krayon_cache_dir, media_id_for_path
from app.services.pipeline_log import PipelineContext

logger = logging.getLogger("krayon.pipeline")


def state_root_for_source(source: Path) -> Path:
    media_id = media_id_for_path(source)
    return krayon_cache_dir(source.parent) / "state" / media_id


def version_dir(source: Path, version_id: str) -> Path:
    return state_root_for_source(source) / "versions" / version_id


def index_path(source: Path) -> Path:
    return state_root_for_source(source) / "index.json"


def create_version_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    suffix = uuid.uuid4().hex[:6]
    return f"{stamp}_{suffix}"


def _format_label(run_number: int, created_at: datetime) -> str:
    local = created_at.astimezone()
    return f"Run {run_number} · {local.strftime('%b %d, %H:%M')}"


def _read_index(source: Path) -> EditorStateIndex | None:
    path = index_path(source)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        index = EditorStateIndex.model_validate(data)
    except (json.JSONDecodeError, ValueError):
        return None
    resolved = str(source.resolve())
    if index.source_path != resolved:
        return None
    return index


def _write_index(source: Path, index: EditorStateIndex) -> None:
    root = state_root_for_source(source)
    root.mkdir(parents=True, exist_ok=True)
    index_path(source).write_text(
        json.dumps(index.model_dump(by_alias=True), indent=2),
        encoding="utf-8",
    )


def prepare_version(source: Path) -> str:
    """Allocate a new version id and create its directory (append-only)."""
    version_id = create_version_id()
    version_dir(source, version_id).mkdir(parents=True, exist_ok=True)
    return version_id


def save_version(
    source: Path,
    *,
    version_id: str,
    options: SilenceOptions,
    similarity_threshold: float,
    analysis: SilenceAnalysis,
    clips: list[ClipItem],
    groups: list[ClipGroup],
    processing_duration_seconds: float | None = None,
    clips_dir: str | None = None,
    audio_ready: bool = False,
    pipeline: PipelineContext | None = None,
) -> EditorStateManifest:
    created_at = datetime.now(timezone.utc)
    media_id = media_id_for_path(source)
    kept = sum(c.duration for c in clips)
    removed = max(0.0, analysis.source_duration - kept)
    transcript = " ".join(w.text for w in analysis.words).strip()

    manifest = EditorStateManifest(
        version_id=version_id,
        created_at=created_at.isoformat(),
        media_id=media_id,
        source_path=str(source.resolve()),
        options=options,
        similarity_threshold=similarity_threshold,
        analysis=SilenceAnalysis(
            source_duration=analysis.source_duration,
            fps=analysis.fps,
            segments=analysis.segments,
            removed_seconds=analysis.removed_seconds,
            words=analysis.words,
        ),
        clips=clips,
        groups=groups,
        clip_count=len(clips),
        removed_seconds=removed,
        clips_dir=clips_dir,
        processing_duration_seconds=processing_duration_seconds,
        audio_ready=audio_ready,
        transcript=transcript,
    )

    vdir = version_dir(source, version_id)
    vdir.mkdir(parents=True, exist_ok=True)
    manifest_path = vdir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest.model_dump(by_alias=True), indent=2),
        encoding="utf-8",
    )
    (vdir / "transcript.txt").write_text(transcript + ("\n" if transcript else ""), encoding="utf-8")

    index = _read_index(source)
    run_number = len(index.versions) + 1 if index else 1
    summary = EditorVersionSummary(
        version_id=version_id,
        created_at=created_at.isoformat(),
        label=_format_label(run_number, created_at),
        clip_count=len(clips),
        removed_seconds=removed,
        options=options,
    )

    if index is None:
        index = EditorStateIndex(
            media_id=media_id,
            source_path=str(source.resolve()),
            active_version_id=version_id,
            versions=[summary],
        )
    else:
        index.active_version_id = version_id
        index.versions.append(summary)

    _write_index(source, index)

    if pipeline:
        pipeline.phase(
            "save",
            "version saved",
            version_id=version_id,
            clip_count=len(clips),
            processing_duration_s=round(processing_duration_seconds or 0, 2),
        )
        logger.debug("manifest path=%s", manifest_path)

    return manifest


def update_version(
    source: Path,
    *,
    version_id: str,
    options: SilenceOptions,
    similarity_threshold: float,
    analysis: SilenceAnalysis,
    clips: list[ClipItem],
    groups: list[ClipGroup],
    processing_duration_seconds: float | None = None,
    clips_dir: str | None = None,
    audio_ready: bool = False,
    pipeline: PipelineContext | None = None,
) -> EditorStateManifest:
    """Overwrite an existing version in place. Does not append a new run."""
    index = _read_index(source)
    if index is None:
        raise ValueError("No analysis runs exist for this source")

    match_idx = next((i for i, v in enumerate(index.versions) if v.version_id == version_id), None)
    if match_idx is None:
        raise ValueError("Analysis run not found")

    created_at = datetime.now(timezone.utc)
    media_id = media_id_for_path(source)
    kept = sum(c.duration for c in clips)
    removed = max(0.0, analysis.source_duration - kept)
    transcript = " ".join(w.text for w in analysis.words).strip()

    manifest = EditorStateManifest(
        version_id=version_id,
        created_at=created_at.isoformat(),
        media_id=media_id,
        source_path=str(source.resolve()),
        options=options,
        similarity_threshold=similarity_threshold,
        analysis=SilenceAnalysis(
            source_duration=analysis.source_duration,
            fps=analysis.fps,
            segments=analysis.segments,
            removed_seconds=analysis.removed_seconds,
            words=analysis.words,
        ),
        clips=clips,
        groups=groups,
        clip_count=len(clips),
        removed_seconds=removed,
        clips_dir=clips_dir,
        processing_duration_seconds=processing_duration_seconds,
        audio_ready=audio_ready,
        transcript=transcript,
    )

    vdir = version_dir(source, version_id)
    vdir.mkdir(parents=True, exist_ok=True)
    manifest_path = vdir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest.model_dump(by_alias=True), indent=2),
        encoding="utf-8",
    )
    (vdir / "transcript.txt").write_text(transcript + ("\n" if transcript else ""), encoding="utf-8")

    run_number = match_idx + 1
    summary = EditorVersionSummary(
        version_id=version_id,
        created_at=created_at.isoformat(),
        label=_format_label(run_number, created_at),
        clip_count=len(clips),
        removed_seconds=removed,
        options=options,
    )
    index.versions[match_idx] = summary
    index.active_version_id = version_id
    _write_index(source, index)

    if pipeline:
        pipeline.phase(
            "save",
            "version updated",
            version_id=version_id,
            clip_count=len(clips),
            processing_duration_s=round(processing_duration_seconds or 0, 2),
        )
        logger.debug("manifest path=%s", manifest_path)

    return manifest


def load_index(source: Path) -> EditorStateIndex | None:
    return _read_index(source)


def load_manifest(source: Path, version_id: str) -> EditorStateManifest | None:
    manifest_path = version_dir(source, version_id) / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return EditorStateManifest.model_validate(data)
    except (json.JSONDecodeError, ValueError):
        return None


def load_active_state(source: Path) -> EditorStateResponse | None:
    index = _read_index(source)
    if not index or not index.active_version_id:
        return None
    manifest = load_manifest(source, index.active_version_id)
    if manifest is None:
        return None
    return EditorStateResponse(
        exists=True,
        index=index,
        active_version=manifest,
    )


def set_active_version(source: Path, version_id: str) -> EditorStateIndex | None:
    index = _read_index(source)
    if index is None:
        return None
    if not any(v.version_id == version_id for v in index.versions):
        return None
    if load_manifest(source, version_id) is None:
        return None
    index.active_version_id = version_id
    _write_index(source, index)
    return index


def build_generate_response(source: Path, manifest: EditorStateManifest) -> ClipsGenerateResponse:
    return ClipsGenerateResponse(
        source_path=str(source.resolve()),
        groups=manifest.groups,
        clips=manifest.clips,
    )
