# Krayon: Architecture & Application Overview

## Core purpose

Krayon is a local video editor for creating short reels from long talking-head recordings. It automates silence removal, clip cutting, and grouping of repeated takes so you can pick the best delivery without manual timeline editing.

**Key capabilities:**
- Folder-based media library with local file access
- Silence removal via faster-whisper transcription
- Automatic clip generation with fuzzy grouping of similar sentences
- Low-res proxy playback for files over 1 GB

## Architecture

```
React + Vite (localhost:5173)  ←→  Python FastAPI (localhost:8000)  ←→  ffmpeg / faster-whisper
```

| Layer | Stack |
|-------|-------|
| Frontend | React 19, Vite, Tailwind v4, Zustand |
| Backend | FastAPI, faster-whisper, ffmpeg subprocess |
| Storage | Local filesystem + `.krayon/` cache per folder |

Everything runs locally — no cloud, no uploads.

## UI layout

- **Left** — video list and grouped clip takes
- **Center** — HTML5 video player
- **Right** — silence removal, clip generation, proxy controls

No multi-track timeline. Simple preview-and-process workflow.

## Processing pipeline

1. Select a folder → backend scans for `.mov` / `.mp4` files
2. Large files → auto-generate 480p proxy for smooth playback
3. Silence removal → faster-whisper word timestamps → gap-based segments
4. Clip generation → ffmpeg cuts + fuzzy grouping of repeated phrases

See [silence-removal.md](silence-removal.md) and [ffmpeg-backend.md](ffmpeg-backend.md) for details.
