# Silence Removal Pipeline

Krayon removes dead air from long talking-head recordings and splits the result into back-to-back clips on the timeline — **non-destructively** (one source file, many clips with different `sourceIn` / `duration` values).

Ported from [`krayon-reel/scripts/transcribe_and_cut.py`](../../krayon-reel/scripts/transcribe_and_cut.py). The segment-building algorithm (`build_segments`) is faithful to that script; detection differs by mode.

## Modes

| Mode | Engine | Speed (20 min video) | Best for |
|------|--------|----------------------|----------|
| **Fast** | FFmpeg `silencedetect` on audio only | Seconds | One-click cleanup, no transcript needed |
| **Accurate** | whisper.cpp word timestamps + gap analysis | 1–3 minutes | Precise cuts aligned to speech, transcript cached for future multi-take selection |

Both modes share the same post-processing:

1. Expand each speech unit by `pad` (default **0.05s**), clamped to source duration
2. Merge units when the gap between them is ≤ `silence_threshold` (default **0.4s**)
3. Drop spans shorter than **0.05s**

## Fast mode

```bash
ffmpeg -hide_banner -nostats -progress pipe:1 -i <input> -map 0:a:0 \
  -af silencedetect=noise=-35dB:d=0.4 -f null -
```

Silence ranges from stderr (`silence_start` / `silence_end`) are inverted to speech spans, then passed through the shared segment builder.

Tune **noise floor** (default `-35 dB`) if quiet room noise is being kept, or speech is being cut.

## Accurate mode

1. Extract 16 kHz mono PCM WAV via FFmpeg
2. Transcribe with `whisper-cli` (word-level JSON, same flags as krayon-reel)
3. Parse word timestamps (with token-level fallback)
4. Run `build_segments` on word gaps

Requires `whisper-cli` and a GGML model on disk.

## Tool discovery

Rust resolves binaries in this order:

| Tool | Env override | Default fallback |
|------|--------------|------------------|
| ffmpeg | `KRAYON_FFMPEG` | `which ffmpeg`, then `/opt/homebrew/bin` |
| ffprobe | `KRAYON_FFPROBE` | same pattern |
| whisper-cli | `KRAYON_WHISPER_CLI` | `~/Desktop/Projects/whisper.cpp/build/bin/whisper-cli` |
| whisper model | `KRAYON_WHISPER_MODEL` | `~/Desktop/Projects/whisper.cpp/models/ggml-large-v3-turbo.bin` |

Use `check_media_tools_command` (exposed to the UI on load) to verify availability.

## UI

- **Timeline toolbar** — AudioLines button runs Fast mode; chevron opens options (mode, threshold, noise floor)
- **Media bin** — Scissors icon on each video: adds to timeline + runs silence removal in one click
- **Shift+S** — runs on the selected V1 clip

Progress events: `silence://progress` with `{ jobId, phase, progress, message }`.

## Rust modules

```
src-tauri/src/
├── ffmpeg.rs           # binary discovery, ffprobe, process runner
└── silence/
    ├── mod.rs          # Tauri commands + orchestration
    ├── detect.rs       # Fast mode (silencedetect)
    ├── whisper.rs      # Accurate mode (whisper.cpp)
    └── segments.rs     # Shared build_segments + invert_silences
```

## Timeline integration

`replaceWithSegments()` in [`src/lib/timeline/ops.ts`](../src/lib/timeline/ops.ts):

- Intersects analysis segments with the clip's current `[sourceIn, sourceOut]` window
- Replaces the clip (+ linked audio sibling) with N linked pairs laid back-to-back
- Shifts later clips on affected tracks left by the removed duration
- Wrapped in a single undo step via `applySilenceSegments()`

Whisper words are cached in `silence-store` (`wordsByAssetPath`) for future multi-take selection.

## Not yet implemented

- Physical `seg_NNN.mp4` export to disk
- Multi-take / duplicate-sentence selection
- BGM ducking envelopes (from krayon-reel cutlist)
