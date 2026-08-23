from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.routers.media import resolve_media_id
from app.schemas import EditorStateResponse, SetActiveVersionRequest
from app.services.editor_state import load_active_state, load_index, load_manifest, set_active_version

router = APIRouter(prefix="/api/editor", tags=["editor"])


@router.get("/state/{media_id}", response_model=EditorStateResponse | None, response_model_by_alias=True)
def get_editor_state(media_id: str) -> EditorStateResponse | None:
    source = resolve_media_id(media_id)
    state = load_active_state(source)
    if state is None:
        return None
    return state


@router.get(
    "/state/{media_id}/versions/{version_id}",
    response_model=EditorStateResponse,
    response_model_by_alias=True,
)
def get_editor_version(media_id: str, version_id: str) -> EditorStateResponse:
    source = resolve_media_id(media_id)
    index = load_index(source)
    if index is None:
        raise HTTPException(status_code=404, detail="No saved state for this video")
    manifest = load_manifest(source, version_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return EditorStateResponse(exists=True, index=index, active_version=manifest)


@router.put("/state/{media_id}/active", response_model=EditorStateResponse, response_model_by_alias=True)
def activate_editor_version(media_id: str, body: SetActiveVersionRequest) -> EditorStateResponse:
    source = resolve_media_id(media_id)
    index = set_active_version(source, body.version_id)
    if index is None:
        raise HTTPException(status_code=404, detail="Version not found")
    manifest = load_manifest(source, body.version_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Version manifest missing")
    return EditorStateResponse(exists=True, index=index, active_version=manifest)
