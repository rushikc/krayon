from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from app.schemas import FolderScanRequest, FolderScanResponse, MediaFileInfo
from app.services.ffmpeg import (
    is_video_file,
    media_id_for_path,
    parse_range_header,
    probe_media,
)
from app.services.proxy import generate_proxy, needs_proxy, proxy_exists, proxy_path_for

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["media"])

# In-memory registry path -> id for streaming
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
        needs = needs_proxy(probe.size)
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
                needs_proxy=needs,
                proxy_ready=proxy_exists(child) if needs else False,
            )
        )

    return FolderScanResponse(path=str(folder), files=files)


@router.post("/media/{media_id}/proxy/generate")
def create_proxy(media_id: str) -> dict:
    source = resolve_media_id(media_id)
    probe = probe_media(source)
    if not needs_proxy(probe.size):
        return {"status": "skipped", "reason": "below threshold"}
    output = generate_proxy(source)
    return {"status": "ready", "path": str(output)}


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
def stream_media(media_id: str, request: Request, proxy: bool = False):
    source = resolve_media_id(media_id)
    path = source
    if proxy or needs_proxy(probe_media(source).size):
        candidate = proxy_path_for(source)
        if candidate.exists():
            path = candidate
    return _stream_file(path, request)


@router.get("/media/proxy/{media_id}", response_model=None)
def stream_proxy(media_id: str, request: Request):
    source = resolve_media_id(media_id)
    proxy = proxy_path_for(source)
    if not proxy.exists():
        proxy = generate_proxy(source)
    return _stream_file(proxy, request)


@router.get("/media/clip/{media_id}/{filename}", response_model=None)
def stream_clip(media_id: str, filename: str, request: Request, version: str | None = None):
    from app.services.editor_state import resolve_clip_file
    from app.services.ffmpeg import clips_cache_dir

    source = resolve_media_id(media_id)
    clip_path = resolve_clip_file(source, filename, version)
    if clip_path is None:
        # Legacy fallback for clips cut before versioned state
        legacy = clips_cache_dir(source.parent, source.stem) / filename
        if legacy.exists():
            clip_path = legacy
        else:
            raise HTTPException(status_code=404, detail="Clip not found")
    return _stream_file(clip_path, request)
