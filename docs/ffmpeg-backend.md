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

Override paths in [`krayon.toml`](../src/backend/krayon.toml) under `[paths]` or via `KRAYON_FFMPEG` / `KRAYON_FFPROBE` env vars.

## Backend services

| Module | Purpose |
|--------|---------|
| [`src/backend/app/services/ffmpeg.py`](../src/backend/app/services/ffmpeg.py) | Probe duration/fps/size, extract audio, range streaming helpers |
| [`src/backend/app/services/clip_audio.py`](../src/backend/app/services/clip_audio.py) | Extract per-clip WAV files after analysis |
| [`src/backend/app/services/clips.py`](../src/backend/app/services/clips.py) | Build segment metadata (no physical video cutting) |

## Dashboard vs editor playback

| Context | Behavior |
|---------|----------|
| **Dashboard (library)** | Stream original via HTTP Range; UI caps preview at 20s |
| **Editor** | Audio-only clip preview from extracted WAV files |

## Streaming

The API serves media with HTTP **Range** support:

- `GET /api/media/stream/{id}` — original source video
- `GET /api/media/clip/{mediaId}/{clipId}` — extracted clip audio WAV

## Cache layout

```
your-folder/
├── recording.mov
└── .krayon/
    ├── state/
    │   └── {mediaId}/
    │       ├── index.json
    │       └── versions/
    │           └── {versionId}/
    │               ├── manifest.json
    │               ├── transcript.txt
    │               └── audio/
    │                   └── {clipId}.wav
    └── recording.wav          # temp audio for whisper
```

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/folder/scan` | POST | List videos + metadata in a folder |
| `/api/tools/status` | GET | Check ffmpeg/ffprobe/whisper availability |

Config: edit [`src/backend/krayon.toml`](../src/backend/krayon.toml).
