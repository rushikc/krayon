from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from app.schemas import ToolStatus
from app.config import settings
from app.services.ffmpeg import ffmpeg_available, ffprobe_available
from app.services.transcribe import whisper_ready

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("/status", response_model=ToolStatus, response_model_by_alias=True)
def tools_status() -> ToolStatus:
    return ToolStatus(
        ffmpeg=ffmpeg_available(),
        ffprobe=ffprobe_available(),
        whisper_ready=whisper_ready(),
        whisper_model=settings.whisper_model,
    )
