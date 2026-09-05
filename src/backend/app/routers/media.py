from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from app.schemas import FolderScanRequest, FolderScanResponse, MediaFileInfo
from app.services.clip_audio import clip_audio_path
from app.services.editor_state import load_active_state, load_manifest
from app.services.ffmpeg import (
    is_video_file,
    media_id_for_path,
    parse_range_header,
    probe_media,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["media"])

_media_registry: dict[str, str] = {}
_id_to_path: dict[str, Path] = {}


def register_media(path: Path) -> str:
    mid = media_id_for_path(path)
    resolved = str(path.resolve())
    _media_registry[resolved] = mid
    _id_to_path[mid] = path.resolve()
    return mid


def resolve_media_id(media_id: str) -> Path:
    path = _id_to_path.get(media_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Media not found")
    return path


@router.post("/folder/scan", response_model=FolderScanResponse, response_model_by_alias=True)
def scan_folder(body: FolderScanRequest) -> FolderScanResponse:
    folder = Path(body.path.strip()).expanduser().resolve()
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    files: list[MediaFileInfo] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.lower())
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    for child in children:
        if not is_video_file(child):
            continue
        try:
            probe = probe_media(child)
        except Exception as exc:
            logger.warning("Skipping %s: probe failed (%s)", child.name, exc)
            continue

        mid = register_media(child)
        files.append(
            MediaFileInfo(
                id=mid,
                path=str(child),
                name=child.name,
                size=probe.size,
                width=probe.width,
                height=probe.height,
                duration=probe.duration,
                fps=probe.fps,
            )
        )

    return FolderScanResponse(path=str(folder), files=files)


def _stream_file(path: Path, request: Request) -> FileResponse | StreamingResponse:
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = path.stat().st_size
    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    byte_range = parse_range_header(request.headers.get("range"), file_size)

    if byte_range is None:
        return FileResponse(path, media_type=content_type, filename=path.name)

    start, end = byte_range
    length = end - start + 1

    def iter_file():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            chunk_size = 1024 * 1024
            while remaining > 0:
                data = f.read(min(chunk_size, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    return StreamingResponse(iter_file(), status_code=206, media_type=content_type, headers=headers)


@router.get("/media/stream/{media_id}", response_model=None)
def stream_media(media_id: str, request: Request):
    source = resolve_media_id(media_id)
    return _stream_file(source, request)


@router.get("/media/clip/{media_id}/{clip_id}", response_model=None)
def stream_clip_audio(media_id: str, clip_id: str, request: Request):
    source = resolve_media_id(media_id)
    state = load_active_state(source)
    if state is None or not state.active_version.audio_ready:
        raise HTTPException(status_code=404, detail="Clip audio not ready")

    clip_path = clip_audio_path(source, state.index.active_version_id, clip_id)
    if not clip_path.exists():
        manifest = load_manifest(source, state.index.active_version_id)
        if manifest is None:
            raise HTTPException(status_code=404, detail="Clip not found")
        if not any(c.id == clip_id for c in manifest.clips):
            raise HTTPException(status_code=404, detail="Clip not found")
        raise HTTPException(status_code=404, detail="Clip audio file missing")

    return _stream_file(clip_path, request)
