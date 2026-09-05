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
- **Python 3.12 recommended** (`brew install python@3.12`)
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

## Configuration

Edit [`src/backend/krayon.toml`](src/backend/krayon.toml) for Whisper model, device, and silence defaults. Optional `KRAYON_*` env vars override individual settings.

| Setting (krayon.toml) | Default | Description |
|-----------------------|---------|-------------|
| `whisper.model` | `base` | faster-whisper model size |
| `whisper.device` | `cpu` | Inference device |
| `whisper.compute_type` | `int8` | Quantization |
| `paths.ffmpeg` | `ffmpeg` | Path to ffmpeg binary |
