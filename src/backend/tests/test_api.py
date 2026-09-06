from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.routers import media as media_router
from app.services.ffmpeg import MediaProbe


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_tools_status_shape(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.tools.ffmpeg_available", lambda: True)
    monkeypatch.setattr("app.routers.tools.ffprobe_available", lambda: True)
    monkeypatch.setattr("app.routers.tools.whisper_ready", lambda: False)
    response = client.get("/api/tools/status")
    assert response.status_code == 200
    body = response.json()
    assert body["ffmpeg"] is True
    assert body["ffprobe"] is True
    assert body["whisperReady"] is False
    assert "whisperModel" in body


def test_scan_folder_rejects_missing_path(client: TestClient) -> None:
    response = client.post("/api/folder/scan", json={"path": "/definitely/not/a/folder"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Not a directory"


def test_scan_folder_registers_videos_and_streams_by_id(
    client: TestClient,
    tmp_path: Path,
    monkeypatch,
) -> None:
    video = tmp_path / "scene.mp4"
    video.write_bytes(b"0123456789")
    monkeypatch.setattr(media_router, "is_video_file", lambda path: path.suffix == ".mp4")
    monkeypatch.setattr(
        media_router,
        "probe_media",
        lambda path: MediaProbe(duration=5.0, fps=30.0, width=1080, height=1920, size=path.stat().st_size),
    )

    scanned = client.post("/api/folder/scan", json={"path": str(tmp_path)})
    assert scanned.status_code == 200
    files = scanned.json()["files"]
    assert len(files) == 1
    media_id = files[0]["id"]
    assert files[0]["name"] == "scene.mp4"
    assert files[0]["duration"] == 5.0

    missing = client.get("/api/editor/state/not-a-real-id")
    assert missing.status_code == 404

    stream = client.get(f"/api/media/stream/{media_id}")
    assert stream.status_code in {200, 206}


def test_http_errors_return_json_detail(client: TestClient) -> None:
    response = client.get("/api/media/stream/missing")
    assert response.status_code == 404
    assert "detail" in response.json()
