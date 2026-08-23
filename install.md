# Krayon — Install Guide

Local-only setup for macOS (Apple Silicon or Intel). Linux should work with the same commands.

## Prerequisites

### 1. Xcode Command Line Tools (macOS)

```bash
xcode-select --install
```

### 2. Node.js + pnpm

```bash
node -v   # should be v20+
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

### 3. Python 3.10+

```bash
python3 --version
```

### 4. FFmpeg

```bash
brew install ffmpeg
ffmpeg -version
ffprobe -version
```

## Clone & install

```bash
git clone <your-repo-url> krayon
cd krayon

# Frontend
pnpm install

# Backend
pnpm backend
```

## Run locally

**Option A — two terminals**

```bash
# Terminal 1: backend
pnpm backend

# Terminal 2: frontend
pnpm dev
```

**Option B — one command**

```bash
pnpm dev:all
```

Open **http://localhost:5173**. Vite proxies `/api/*` to the FastAPI server on port 8000.

## First use

1. Click **Open** in the left sidebar — the native macOS folder picker appears.
2. Select a folder with `.mov` or `.mp4` files.
3. Pick a video from the list — it plays in the center player.
4. Use **Analyze silence** on the right panel.

The last selected folder is saved in browser `localStorage`.

## Large files (> 1 GB)

Files over 1 GB get a low-resolution proxy generated automatically (480p / 24fps). Proxies are cached at:

```
<your-folder>/.krayon/proxies/<filename>_proxy.mp4
```

Transcripts are cached under:

```
<your-folder>/.krayon/<stem>.wav
```

Analysis state (segment timestamps, groups) is saved under `<your-folder>/.krayon/state/{mediaId}/`.

## Optional configuration

Create `src/backend/.env`:

```env
KRAYON_WHISPER_MODEL=small
KRAYON_FFMPEG=/opt/homebrew/bin/ffmpeg
KRAYON_FFPROBE=/opt/homebrew/bin/ffprobe
```

Whisper model sizes: `tiny`, `base`, `small`, `medium`, `large-v3`. Larger = more accurate but slower.

On first backend start, the Whisper model is downloaded once (~150 MB for `base`). Subsequent starts load it from cache. Disable startup loading with `KRAYON_WHISPER_WARMUP_ON_STARTUP=false` in `.env`.

## Build for production

```bash
pnpm build
# Frontend output: dist/

# Backend runs as-is:
pnpm backend
```

Serve `dist/` with any static file server, keeping the API proxy pointed at localhost:8000.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ffmpeg not found` | Install ffmpeg and ensure it is on PATH |
| Backend connection refused | Start uvicorn on port 8000 |
| Whisper slow on first run | Model downloads once on first `pnpm backend`; wait for "Whisper model ready" in logs |
| Video won't seek | Ensure ffprobe works and the file is readable |
