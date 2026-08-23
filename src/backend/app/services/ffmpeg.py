from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}


@dataclass
class MediaProbe:
    duration: float | None
    fps: float | None
    width: int | None
    height: int | None
    size: int


def which(binary: str, override: str | None = None) -> str | None:
    candidate = override or binary
    return shutil.which(candidate)


def ffmpeg_available() -> bool:
    return which("ffmpeg", settings.ffmpeg) is not None


def ffprobe_available() -> bool:
    return which("ffprobe", settings.ffprobe) is not None


def run_command(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, cwd=cwd, capture_output=True, text=True)


def _parse_fps(value: str | None) -> float | None:
    if not value:
        return None
    if "/" in value:
        num, den = value.split("/", 1)
        try:
            denominator = float(den)
            return float(num) / denominator if denominator else None
        except ValueError:
            return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_float(value: str | None) -> float | None:
    if value is None:
        return None
    text = value.strip()
    if not text or text.upper() == "N/A":
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    return parsed if parsed >= 0 else None


def probe_media(path: Path) -> MediaProbe:
    """Probe media metadata via ffprobe JSON output."""
    result = run_command(
        [
            settings.ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate",
            "-of",
            "json",
            str(path),
        ]
    )

    payload = json.loads(result.stdout or "{}")
    duration = _parse_float(payload.get("format", {}).get("duration"))

    width: int | None = None
    height: int | None = None
    fps: float | None = None

    for stream in payload.get("streams", []):
        if stream.get("codec_type") != "video":
            continue
        if stream.get("width") and stream.get("height"):
            width = int(stream["width"])
            height = int(stream["height"])
        fps = _parse_fps(stream.get("avg_frame_rate")) or _parse_fps(stream.get("r_frame_rate"))
        break

    return MediaProbe(
        duration=duration,
        fps=fps,
        width=width,
        height=height,
        size=path.stat().st_size,
    )


def extract_audio(input_path: Path, wav_path: Path) -> None:
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    run_command(
        [
            settings.ffmpeg,
            "-y",
            "-i",
            str(input_path),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(wav_path),
        ]
    )


def media_id_for_path(path: Path) -> str:
    digest = hashlib.sha256(str(path.resolve()).encode()).hexdigest()
    return digest[:16]


def is_video_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS


def krayon_cache_dir(folder: Path) -> Path:
    return folder / ".krayon"


def proxy_cache_dir(folder: Path) -> Path:
    return krayon_cache_dir(folder) / "proxies"


def proxy_path_for(source: Path) -> Path:
    folder = source.parent
    return proxy_cache_dir(folder) / f"{source.stem}_proxy.mp4"


def parse_range_header(range_header: str | None, file_size: int) -> tuple[int, int] | None:
    if not range_header:
        return None
    match = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not match:
        return None
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else file_size - 1
    end = min(end, file_size - 1)
    if start > end:
        return None
    return start, end
