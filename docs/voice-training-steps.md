# GPT-SoVITS — Steps (plain English)

Personal voice cloning for Text-to-Speech (TTS). Type a reel script → get audio that sounds like you.

**Machine:** MacBook M4 Air, 24 GB RAM  
**Project:** `/Users/rushi/Desktop/Projects/GPT-SoVITS`  
**Web UI:** `http://localhost:9874/`

For copy-paste commands and UI field values, see [`voice-training-cmd.md`](./voice-training-cmd.md).  
For background / Gemini notes, see [`voice-training-gpt.md`](./voice-training-gpt.md).

---

## What you’re building

You are **not** training a general LLM. You’re fine-tuning **GPT-SoVITS**, a voice-cloning TTS model (similar idea to ElevenLabs custom voice).

- **Training** = one-time (slow on M4 CPU, often overnight)
- **Generation (inference)** = fast after that (~under 30s for a 60s reel)

**Rule of thumb:** quality of audio matters more than quantity. Aim for about **3–5 minutes** of clean voice (no music, same energy).

---

## Step overview

| # | Step | Status |
| --- | --- | --- |
| 1 | Install GPT-SoVITS + conda env | done |
| 2 | Prepare clean voice audio from reels | done |
| 3 | Slice audio into short clips | done (re-sliced to ~8s) |
| 4 | Transcribe clips (ASR → `.list` file) | done (`slicer_opt.list`, 39 lines) |
| 5 | Format training set (Tab 1A) | next |
| 6 | Fine-tune model (Tab 1B) | not started |
| 7 | Generate TTS from a script | not started |

---

## 1. Setup

Install GPT-SoVITS on the Mac, create the `GPTSoVits` conda environment, download pretrained models, launch the Web UI.

Example: open Terminal, go to the project folder, activate the env, run `python webui.py`, then open `http://localhost:9874/`.

---

## 2. Prepare clean voice audio

From Instagram reels (~70 available), pick the best few minutes of your “reel voice.”

1. Extract audio from videos (ffmpeg).
2. Remove background music / SFX (UVR / vocal separation in Tab **0a**).
3. Keep one clean mono `.wav` (or a few) of continuous talking.

Example: a ~5 minute clean wav of system-design reel narration, no beat underneath.

---

## 3. Slice into short clips

GPT-SoVITS needs **short** clips (about **3–10 seconds**), not multi-minute files.

**What went wrong first:** Web UI slicer only produced **2** chunks — one ~41s and one ~4.5 minutes. Formatting later failed because those were too long.

**Fix:** re-slice with ffmpeg into fixed **~8 second** segments → ended with **40** short `.wav` files under `output/slicer_opt/`.

Example of a good slice set: `slice_0000.wav`, `slice_0001.wav`, … dozens of files, each a short sentence or two.

---

## 4. Speech recognition (ASR)

Each short wav needs a matching transcript so the model learns “this sound = these words.”

Output is a `.list` file, one line per clip:

```text
/path/to/slice_0000.wav|slicer_opt|EN|This is a system design question...
```

**What went wrong first:** Web UI ASR didn’t create the list (missing `faster_whisper`, English not obvious in dropdown, downloads hanging).

**Fix:** run Faster-Whisper from the terminal, using already-downloaded models under `tools/asr/models/` (`large-v3-turbo` preferred). Language = English.

Current result: `output/asr_opt/slicer_opt.list` (~39 lines for 40 slices).

---

## 5. Format the training set (Tab 1A) — next

In the Web UI, open **1-GPT-SoVITS-TTS** → **1A-Dataset Formatting**.

You point the UI at:

- the `.list` file (transcripts)
- the folder of short `.wav` clips

Then run feature extraction so the model can train:

1. Tokenization + BERT features (text side)
2. Speech SSL / HuBERT features (audio side) → writes `logs/<name>/5-wav32k/`
3. Semantics tokens
4. Or use **One-Click Formatting** after paths are set

Use a real experiment name like `my_voice` (not the default `xxx`). Version: `v2Pro`. Set the pretrained SoVITS-G path to the v2Pro file.

**What failed before:** One-Click errored because (a) clips were too long → empty `5-wav32k`, (b) `x-transformers` too new for Python 3.9, (c) semantic output file never created.

After a successful run you should see files under `logs/my_voice/` (bert, cnhubert, wav32k, semantics, etc.).

---

## 6. Fine-tune (Tab 1B) — later

Open **1B-Fine-Tuning**.

On Mac: training runs on **CPU** (slow). Start with batch size ~4, epochs ~15–20. Watch the **Terminal** for loss/epoch progress (the Web UI often looks frozen). Overnight is fine.

---

## 7. Generate audio — later

Once weights are saved, use the TTS / inference UI: paste a new reel script → export wav that sounds like you.

---

## Current folder picture

```text
GPT-SoVITS/
├── output/
│   ├── slicer_opt/          # ~40 short .wav clips (~8s each)
│   ├── asr_opt/
│   │   └── slicer_opt.list  # transcripts for those clips
│   ├── slicer_opt_backup/   # old too-long slices (kept for safety)
│   └── training_full.wav    # concatenated clean audio used for re-slice
├── tools/asr/models/
│   ├── faster-whisper-large-v3/
│   └── faster-whisper-large-v3-turbo/
└── logs/                    # training artifacts (clean & recreate after fixes)
```

---

## Next action

1. ~~Confirm `x-transformers` import~~ — done  
2. ~~ASR list + clean old logs~~ — done (`39` lines; `logs/xxx`, `my_voice`, `my-voice` removed)  
3. Restart Web UI → Tab **1A** with correct paths → One-Click (or the three buttons in order)  
4. Then Tab **1B** training overnight  

Commands/UI values: [`voice-training-cmd.md`](./voice-training-cmd.md) §7.
