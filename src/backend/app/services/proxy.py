from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.services.ffmpeg import probe_media, proxy_path_for, run_command


def needs_proxy(size: int) -> bool:
    return size >= settings.proxy_size_threshold_bytes


def proxy_exists(source: Path) -> bool:
    return proxy_path_for(source).exists()


def generate_proxy(source: Path, *, on_progress=None) -> Path:
    output = proxy_path_for(source)
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists():
        return output

    max_h = settings.proxy_max_height
    fps = settings.proxy_fps
    crf = settings.proxy_crf

    cmd = [
        settings.ffmpeg,
        "-y",
        "-i",
        str(source),
        "-vf",
        f"scale=-2:min({max_h}\\,ih),fps={fps}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(output),
    ]

    if on_progress:
        on_progress(0.1, "Generating low-resolution proxy…")

    run_command(cmd)

    if on_progress:
        on_progress(1.0, "Proxy ready")

    return output


def resolve_playback_path(source: Path) -> Path:
    probe = probe_media(source)
    if needs_proxy(probe.size):
        proxy = proxy_path_for(source)
        if proxy.exists():
            return proxy
    return source
