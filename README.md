# Krayon

Local video editor for reels — React + Vite frontend with a Python FastAPI backend. Everything runs on your machine.

## Quick start

```bash
# Frontend
pnpm install
pnpm dev

# Backend (separate terminal)
pnpm backend
```

Or run both together:

```bash
pnpm dev:all
```

Open **http://localhost:5173**

## Prerequisites

- **Node.js 20+** and **pnpm**
- **Python 3.10+**
- **ffmpeg** and **ffprobe** on your PATH (`brew install ffmpeg`)

On first silence-removal run, **faster-whisper** downloads its model automatically.

## Architecture

```
src/
├── frontend/   # React + Vite UI
└── backend/    # Python FastAPI + bash.sh
```

### Layout

**Dashboard (`/`)** — video library + preview + metadata panel

**Editor (`/editor/:mediaId`)** — single-video workspace with processing controls; clips sidebar appears after generation

## Debugging / logs

Backend session logs are written to [`src/backend/logs/`](src/backend/logs/).

- One log file per **5-minute window** while the server runs (e.g. `krayon_2026-08-23T17-05-00.log`)
- Max **30** log files kept; oldest are auto-deleted
- **Terminal** shows one-liner API calls and errors
- **Log files** contain full detail (tracebacks, debug context) for LLM/Cursor analysis

When debugging backend issues, read the most recent `src/backend/logs/krayon_*.log`.

Log files are gitignored — do not commit them.

## Docs

- [Install guide](install.md)
- [UI design](docs/ui-design.md)
- [FFmpeg & media processing](docs/ffmpeg-backend.md)
- [Silence removal pipeline](docs/silence-removal.md)
- [What is Krayon?](docs/what-is-kyaon.md)

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAYON_FFMPEG` | `ffmpeg` | Path to ffmpeg binary |
| `KRAYON_FFPROBE` | `ffprobe` | Path to ffprobe binary |
| `KRAYON_WHISPER_MODEL` | `base` | faster-whisper model size |
| `KRAYON_PROXY_SIZE_THRESHOLD_BYTES` | `1073741824` | Auto-proxy threshold (1 GB) |
