# Silence Removal Pipeline

Krayon removes dead air from talking-head recordings using **faster-whisper** word timestamps and gap-based segment building. Ported from [`krayon-reel/scripts/transcribe_and_cut.py`](../../krayon-reel/scripts/transcribe_and_cut.py).

For a stage-by-stage breakdown of the **Analyze silence** stepper (what each step does, progress weighting, inputs/outputs, and disk artifacts), see [pipeline-stages.md](./pipeline-stages.md).

## Flow

```mermaid
flowchart LR
  Video[Source video] --> Extract[ffmpeg: 16kHz mono WAV]
  Extract --> Whisper[faster-whisper transcription]
  Whisper --> Segments[Gap-based segment builder]
  Segments --> Preview[UI: play kept speech only]
  Segments --> Clips[Optional: cut MP4 segments]
```

## Algorithm

1. Extract 16 kHz mono PCM WAV via ffmpeg
2. Transcribe with faster-whisper (`word_timestamps=True`, VAD filter)
3. Build speech segments from inter-word gaps:
   - Expand each word by `pad` (default **0.05s**)
   - Merge when gap ≤ `silence_threshold` (default **0.4s**)
   - Drop spans shorter than **0.05s**

## Configuration

| Setting | Default | Env / API |
|---------|---------|-----------|
| Silence threshold | 0.4s | `options.silenceThreshold` |
| Pad | 0.05s | `options.pad` |
| Language | en | `options.language` |
| Whisper model | base | `KRAYON_WHISPER_MODEL` |

## Backend modules

```
src/backend/app/services/
├── ffmpeg.py       # audio extraction, probing
├── transcribe.py   # faster-whisper wrapper
├── segments.py     # build_segments_from_words
├── analysis.py     # orchestrates full pipeline
└── clips.py        # ffmpeg segment cutting + fuzzy grouping
```

## API

### Analyze silence

```http
POST /api/silence/analyze
Content-Type: application/json

{
  "path": "/Users/you/Videos/recording.mov",
  "options": {
    "silenceThreshold": 0.4,
    "pad": 0.05,
    "language": "en",
    "threads": 4
  }
}
```

Response:

```json
{
  "sourceDuration": 130.5,
  "fps": 30,
  "segments": [{ "sourceStart": 0.1, "sourceEnd": 12.4 }],
  "removedSeconds": 45.2,
  "words": [{ "text": "hello", "start": 0.5, "end": 0.8 }]
}
```

### Async with SSE progress

```http
POST /api/silence/analyze/async   → { "jobId": "..." }
GET  /api/silence/progress/{jobId}  → text/event-stream
```

## UI integration

- **Right panel → Analyze silence** runs the full async pipeline (transcribe + cut + group)
- **Analysis run** dropdown appears when prior runs exist; switch versions without re-analyzing
- **Speech clips only / Show all segments** toggles the left sidebar list mode
- Opening the editor restores the last active run from `.krayon/state/{mediaId}/`

## Persisted state

After each pipeline run completes, Krayon writes versioned state next to the source file:

```
.krayon/state/{mediaId}/
  index.json
  versions/{versionId}/
    manifest.json
    clips/seg_000.mp4 ...
```

- **Append-only** — re-analyzing creates a new version folder; prior manifests and clip files are never deleted
- **index.json** — version list with auto labels (`Run 1 · Aug 23, 7:05 PM`), `activeVersionId`, summary stats
- **manifest.json** — silence options, segment analysis, clips, groups (words omitted by default to keep files small)

### State API

```http
GET /api/editor/state/{mediaId}              → active manifest + version list (null if none)
GET /api/editor/state/{mediaId}/versions/{id} → specific version
PUT /api/editor/state/{mediaId}/active       → { "versionId": "..." }
```

Clip streaming resolves from the active or requested version:

```http
GET /api/media/clip/{mediaId}/{filename}?version={versionId}
```

If `version` is omitted, the server uses `activeVersionId` from `index.json`.

## Clip grouping

After cutting, clips with similar transcript text are grouped using normalized fuzzy string matching (`difflib.SequenceMatcher`, threshold **0.82**). Repeated takes like "using machine learning" × 5 appear under one collapsible group in the sidebar.

## Tool check

```http
GET /api/tools/status
```

Returns `{ ffmpeg, ffprobe, whisperReady, whisperModel }`.
