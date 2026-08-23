# Krayon

Script-driven video editing for reels — built with Tauri v2, React, and Rust.

## Quick Start

See [install.md](install.md) for full macOS Apple Silicon bootstrap instructions.

```bash
pnpm install
pnpm tauri dev
```

## Architecture

- **Frontend:** React + Tailwind v4 + shadcn/ui + Zustand + GSAP
- **Backend:** Rust (Tauri v2) with shell, dialog, and fs plugins
- **Processing:** FFmpeg sidecar (see [docs/ffmpeg-backend.md](docs/ffmpeg-backend.md))

## Docs

- [What is Krayon?](docs/what-is-kyaon.md)
- [UI Design](docs/ui-design.md)
- [Editor: Preview Player & Timeline](docs/editor-timeline.md)
- [Backend Design](docs/backend-design.md)
- [FFmpeg Integration](docs/ffmpeg-backend.md)
- [Silence Removal Pipeline](docs/silence-removal.md)
