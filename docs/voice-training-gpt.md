# Voice Training with GPT-SoVITS

Notes from a Gemini conversation on cloning a personal voice for Text-to-Speech (TTS), targeted at Instagram reel scripts. Hardware context: MacBook M4 Air, 24 GB RAM. Project path used: `/Users/rushi/Desktop/Projects/GPT-SoVITS`.

---

## Goal

**Final product:** Text-to-Speech — type a reel script → get audio that sounds like you.

This is not training a general LLM. Use a specialized TTS / voice-cloning model (same idea as ElevenLabs custom voice). Training is one-time; after that, inference (generation) is fast.

---

## Feasibility & hardware

| Question | Answer |
| --- | --- |
| Can you clone from ~70–75 Instagram reels? | Yes. You only need ~1–5 minutes of **clean** voice audio (no music/SFX). |
| Is M4 Air 24 GB enough? | Yes for inference. Training on Apple Silicon often falls back to **CPU**, which is slow but workable if you can wait overnight. Nvidia GPU (e.g. Ubuntu desktop) is much faster for training. |
| Training vs generation | Training = one-time. Inference for a 60s reel ≈ under ~30s even on CPU. |

### Recommended tools

1. **GPT-SoVITS** — best for custom voice; ~1 minute of audio can work; Web UI; needs training.
2. **F5-TTS** — zero/minimal training; ~15s reference clip; upload + type script.

For this workflow we pursued **GPT-SoVITS**.

---

## Training time estimates (M4 CPU)

| Stage | Nvidia GPU | M4 CPU (estimate) |
| --- | --- | --- |
| Audio prep (clean + align) | — | ~10–15 min |
| SoVITS (timbre / acoustic) | ~15–30 min | ~2–4 hours |
| GPT (prosody / text→speech) | ~30–45 min | ~4–6 hours |
| **Total training** | ~1 hour | **~6–10 hours** |

Overnight run on M4 is a reasonable plan.

---

## How much audio: 5 min vs 10 min?

**Quality beats quantity.** With few-shot tools like GPT-SoVITS, 10 minutes is rarely “much better” than 3–5 minutes and can hurt results.

Prefer **3–5 minutes** of:

- Same energy / “reel voice” (no tired vs hyped mix)
- No echo, wind, static, music bleed
- Consistent mic / room

10 minutes of flawless studio audio is fine; from Instagram reels, ruthlessly curate the best 3–5 minutes. More audio also roughly doubles M4 training time.

---

## Phase 1: Prepare reel audio (Mac)

### What matters

Strip background music and SFX so the model only hears raw voice. Pick the best 3–5 reels.

### Extract audio with ffmpeg

1. Install ffmpeg if needed: `brew install ffmpeg`
2. Put selected videos in a folder.
3. Save and run an extraction script (e.g. `extract_audio.sh`) in that folder, or extract manually with ffmpeg to `.wav`.

Gemini also provided an “Audio Preparation Guide” / “Audio Extraction Script” (Aug 2) for batch extraction — use those alongside ffmpeg.

After extraction → isolate vocals (UVR / vocal separation) → then GPT-SoVITS.

---

## Phase 2: Install GPT-SoVITS on Mac M4

Use Terminal: Homebrew tools, isolated Conda env, clone repo, install deps. Full command list was captured in Gemini’s **“GPT-SoVITS Mac Installation Guide”** (Aug 3). High-level flow:

1. Install / use Miniconda, create env (e.g. `GPTSoVits`)
2. Clone GPT-SoVITS
3. Install `requirements.txt` and platform-specific deps
4. Launch Web UI: `python webui.py`

### Stuck downloading g2pw (~638 MB)

If the Web UI hangs on the **g2pw** model download:

1. `Ctrl+C` to cancel
2. Run `python webui.py` again (often resumes / retries)
3. If still stuck >5 min: manually download the ~638 MB file and place it in the expected folder (bypass the auto-downloader)

At ~35 Mbps, ~638 MB should take a few minutes when the download is healthy; silent hangs are common with Hugging Face / GitHub fetches.

---

## Phase 3: Web UI — dataset prep (tab “0-Fetch Datasets”)

With a clean ~5 min `.wav` ready:

### Step 1 — Vocal separation (if music still present)

- Open **Vocal Separation WebUI**
- Upload `.wav`
- Model e.g. **UVR-MDX-NET-Voc_FT**
- Use the vocals-only output going forward

### Step 2 — Speech slicing

- **0b-Speech Slicing Tool**
- Input: path to clean vocal file/folder
- Output: e.g. `output/slicing_opt` (or `sliced_audio`)
- Run until Success  
→ short 3–10s snippets the model can train on

### Step 3 — Speech recognition (ASR)

Produces a `.list` file mapping each slice to text (language tag `en`).

#### Mac path gotcha

Web UI placeholders may show Windows paths (`D:\GPT-SoVITS\...`). On Mac use:

`/Users/rushi/Desktop/Projects/GPT-SoVITS/...`

Copy path: Finder → Option + right-click → **Copy as Pathname**.

#### English ASR in Web UI

Default FunASR-style dropdown may only show **zh** / **yue**. For English:

**Preferred in UI (when available):**  
**Faster Whisper (多语言)** = multilingual → set ASR language to **en**.

**If UI has no English / ASR fails:** use terminal (see troubleshooting below).

Expected `.list` line shape:

```text
/Users/rushi/GPT-SoVITS/raw/your_audio_01.wav|Your transcript here|en
```

---

## Phase 4: Training tab (“1-GPT-SoVITS-TTS”)

After slicing + a valid `.list` file:

### 1A — Dataset formatting (do before fine-tuning)

Top of page:

- **Experiment/model name:** e.g. `my_voice`
- **Text labelling file:** path to `.list` (e.g. `.../output/asr_opt/slicer_opt.list`)
- **Audio dataset folder:** path to sliced wavs (`.../output/slicer_opt`)

Click **in order**, wait for Success each time:

1. Open Tokenization & BERT Feature Extraction  
2. Open Speech SSL Feature Extraction  
3. Open Semantics Token Extraction  
4. Open Training Set One-Click Formatting  

Then open sub-tab **1B-Fine-Tuning**.

### 1B — Fine-tuning

- GPU info: on Mac expect `0` or `cpu`
- **Batch size:** 4 or 8; drop to **2** on OOM
- **Total epochs:** ~15–20
- Enable **Save latest weights** if available
- Click **Open Training**

Watch the **Terminal**, not only the Web UI (UI often looks frozen). Progress looks like epoch / loss decreasing. Do not close the terminal.

---

## Troubleshooting log (from this setup)

### `asr_opt` missing / no `.list` file

After Web UI ASR, only `output/slicer_opt` existed — no `output/asr_opt`, no `*.list`.

Search:

```bash
find /Users/rushi/Desktop/Projects/GPT-SoVITS/output -name "*.list"
ls -R /Users/rushi/Desktop/Projects/GPT-SoVITS/output
```

Sometimes the `.list` lands inside `slicer_opt` instead of `asr_opt`. If nothing is found, ASR did not actually succeed — run ASR from the terminal.

### Manual Faster-Whisper ASR

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
conda activate GPTSoVits

python tools/asr/fasterwhisper_asr.py \
  -i /Users/rushi/Desktop/Projects/GPT-SoVITS/output/slicer_opt \
  -o /Users/rushi/Desktop/Projects/GPT-SoVITS/output/asr_opt \
  -l en
```

(Adjust `-o` if you want the list next to slices; confirm the script’s expected output path — directory vs `.list` file — for your GPT-SoVITS version.)

### `ModuleNotFoundError: No module named 'faster_whisper'`

Web UI / env was missing ASR deps. Fix:

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
conda activate GPTSoVits
pip install faster-whisper
pip install funasr
```

Then re-run the manual ASR command.

### `FileNotFoundError: logs/my_voice/2-name2text-0.txt`

Training/formatting ran before ASR produced the `.list`. Ignore until ASR succeeds; then refresh Web UI paths and continue from 1A.

### Stuck downloading Faster-Whisper `large-v3` (~3.09 GB)

Log looked like:

```text
Downloading model from HuggingFace: Systran/faster-whisper-large-v3
model.bin: 0% ... 0.00/3.09G
```

At ~35 Mbps, ~3 GB ≈ 12–15+ minutes; progress bars often sit at 0% while connecting.

Options:

1. Wait ~20 minutes with the window open  
2. Cancel (`Ctrl+C`) and use a smaller model:

```bash
python tools/asr/fasterwhisper_asr.py \
  -i output/slicer_opt \
  -o output/slicer_opt/slicer_opt.list \
  -l en \
  -s small
```

`small` (~500 MB) is usually enough for reel transcription. If even that hangs, check network / VPN / Hugging Face throttling.

---

## End-to-end checklist

1. Curate 3–5 min clean voice from reels (no music)
2. Extract + vocal-separate → clean `.wav`
3. Install GPT-SoVITS + env on M4; launch `webui.py`
4. Slice audio → ASR → get `.list` (Faster Whisper `en`; terminal if UI fails)
5. Tab **1A**: tokenization → SSL → semantics → one-click format
6. Tab **1B**: train (~15 epochs, batch 4 on Mac; overnight OK)
7. Inference: paste reel script → generate TTS audio in your voice

---

## Open / follow-up items from the convo

- Confirm `.list` generation after `faster-whisper` install + ASR (small or large-v3)
- Complete 1A formatting buttons without path errors
- Run 1B training overnight on M4
- Optional later: train on Nvidia Ubuntu machine for faster / higher-quality training, then run inference on the Mac
