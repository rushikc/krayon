from __future__ import annotations

from pydantic import BaseModel

from fastapi import APIRouter, HTTPException

from app.services.folder_picker import pick_folder_macos

router = APIRouter(prefix="/api/fs", tags=["fs"])


class PickFolderResponse(BaseModel):
    path: str | None = None
    cancelled: bool = False


@router.post("/pick-folder", response_model=PickFolderResponse)
def pick_folder() -> PickFolderResponse:
    try:
        path = pick_folder_macos()
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc

    if path is None:
        return PickFolderResponse(cancelled=True)

    return PickFolderResponse(path=path)
