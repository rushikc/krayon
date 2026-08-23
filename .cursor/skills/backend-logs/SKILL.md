---
name: backend-logs
description: Inspect Krayon backend session logs when debugging API, pipeline, ffmpeg, whisper, or SSE job failures. Use only when explicitly invoked via /backend-logs.
disable-model-invocation: true
---

# Backend log investigation

When investigating **backend-related issues** (API errors, silence analysis, clip generation, ffmpeg, whisper, SSE jobs, 500s, hangs, or wrong pipeline results), **always inspect session logs** before guessing.

## Log location

Logs live in [`src/backend/logs/`](src/backend/logs/) (`@logs`):

- Files: `krayon_YYYY-MM-DDTHH-MM-SS.log` (one file per ~5-minute window)
- Max 30 files; oldest are pruned automatically
- Gitignored — read them locally, never commit

## What to do

1. **Find the latest log** (most recent `krayon_*.log` by modification time).
2. **Read the tail** around the failure: tracebacks, `ERROR`, ffmpeg/whisper output, and the request path (e.g. `/api/clips/generate/async`).
3. **Correlate with the terminal** — one-line API logs appear in the uvicorn terminal; log files have full detail.
4. **Reproduce once** if needed, then re-read the same or next log file.

## Example commands

```bash
ls -lt src/backend/logs/krayon_*.log | head -3
tail -n 80 src/backend/logs/krayon_*.log | tail -n 80
```

Or read the newest file directly with the Read tool.

## When to skip

- Pure frontend/UI bugs with no API or backend involvement
- Documentation-only changes

If the issue touches `/api/*`, Python services, or media processing, **check `@logs` first**.
