# FFmpeg & Media Processing

Krayon uses system **ffmpeg** and **ffprobe** via Python subprocess calls. No bundled sidecar — install ffmpeg locally.

## Installation

```bash
brew install ffmpeg   # macOS
```

Verify:

```bash
ffmpeg -version
ffprobe -version
```

Override paths with environment variables:

```env
KRAYON_FFMPEG=/opt/homebrew/bin/ffmpeg
KRAYON_FFPROBE=/opt/homebrew/bin/ffprobe
```

## Backend services

| Module | Purpose |
|--------|---------|
| [`src/backend/app/services/ffmpeg.py`](../src/backend/app/services/ffmpeg.py) | Probe duration/fps/size, extract audio, range streaming helpers |
| [`src/backend/app/services/proxy.py`](../src/backend/app/services/proxy.py) | Generate low-res proxies for large files |
| [`src/backend/app/services/clips.py`](../src/backend/app/services/clips.py) | Cut segment MP4s with ffmpeg |

## Proxy generation

When a video exceeds **1 GB** (configurable via `KRAYON_PROXY_SIZE_THRESHOLD_BYTES`):

```bash
ffmpeg -y -i input.mov \
  -vf "scale=-2:min(480\,ih),fps=24" \
  -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p \
  -c:a copy -movflags +faststart \
  .krayon/proxies/input_proxy.mp4
```

Audio is copied unchanged; only video resolution and FPS are reduced.

## Streaming

The API serves video with HTTP **Range** support so the HTML5 `<video>` element can seek:

- `GET /api/media/stream/{id}` — original or proxy
- `GET /api/media/proxy/{id}` — force proxy stream
- `GET /api/media/clip/{id}/{filename}` — individual clip segment

## Cache layout

All processing artifacts live beside your source media:

```
your-folder/
├── recording.mov
└── .krayon/
    ├── proxies/
    │   └── recording_proxy.mp4
    ├── clips/
    │   └── recording/
    │       ├── seg_000.mp4
    │       └── seg_001.mp4
    └── recording.wav          # temp audio for whisper
```

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/folder/scan` | POST | List videos + metadata in a folder |
| `/api/media/{id}/proxy/generate` | POST | Create proxy for a large file |
| `/api/tools/status` | GET | Check ffmpeg/ffprobe/whisper availability |
