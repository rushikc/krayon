# GPT-SoVITS — Commands & UI steps

Copy-paste reference for MacBook M4 Air.  
**Project root:** `/Users/rushi/Desktop/Projects/GPT-SoVITS`  
**Conda env:** `GPTSoVits`  
**Web UI:** `http://localhost:9874/`

Plain-English flow: [`voice-training-steps.md`](./voice-training-steps.md).

Always start from the project root unless noted:

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
conda activate GPTSoVits
```

---

## 1. Launch Web UI

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
conda activate GPTSoVits
python webui.py
```

Open: `http://localhost:9874/`

Stop with `Ctrl+C` in the Terminal.

---

## 2. Tab 0 — Fetch Datasets (UI)

### 0a — Vocal separation (only if music/SFX remain)

1. Tab **0-Fetch Datasets** → **0a-UVR5 WebUI**
2. Click **Open Vocal Separation WebUI**
3. Upload clean candidate audio
4. Model: `UVR-MDX-NET-Voc_FT` (or similar vocals model)
5. Use the vocals-only output for slicing

### 0b — Speech slicing (Web UI — first attempt)

| Field | Value |
| --- | --- |
| Audio slicer input | path to clean `.wav` / folder |
| Audio slicer output folder | `output/slicer_opt` |
| Noise gate threshold | `-34` |
| min_length | `4000` |
| Minimum interval | `300` |
| hop_size | `10` |
| Max silence kept | `500` |
| Loudness multiplier | `0.9` |
| alpha_mix | `0.25` |
| CPU threads | `4` |

Click **Open Speech Slicing**.

> Note: on continuous speech this produced only **2** oversized clips. Prefer the ffmpeg re-slice below.

### 0c — ASR (prefer Terminal; see §3)

If using UI: model **Faster Whisper (多语言)**, language **en**, then **Open Speech Recognition**.  
If English isn’t available or no `.list` appears → use Terminal ASR.

---

## 3. Re-slice audio into ~8s clips (required)

Backup old slices, concat, then segment:

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
mkdir -p output/slicer_opt_backup
mv output/slicer_opt/*.wav output/slicer_opt_backup/

ffmpeg -y -i output/slicer_opt_backup/training-audio.wav_0000000000_0001307840.wav \
         -i output/slicer_opt_backup/training-audio.wav_0001307840_0010186880.wav \
         -filter_complex "concat=n=2:v=0:a=1" output/training_full.wav

ffmpeg -y -i output/training_full.wav -f segment -segment_time 8 \
  -c:a pcm_s16le -ar 32000 -ac 1 output/slicer_opt/slice_%04d.wav

ls output/slicer_opt | wc -l
# expect ~40 (many short files), not 2
```

Check durations (optional):

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 output/slicer_opt/slice_0000.wav
```

---

## 4. ASR with local Faster-Whisper models

Models already on disk:

```text
tools/asr/models/faster-whisper-large-v3/
tools/asr/models/faster-whisper-large-v3-turbo/
```

**Preferred (local turbo, no download):**

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
conda activate GPTSoVits

HF_HUB_OFFLINE=1 python tools/asr/fasterwhisper_asr.py \
  -i output/slicer_opt \
  -o output/asr_opt \
  -l en \
  -s large-v3-turbo \
  -p float32
```

**Alternate (full large-v3, also local):**

```bash
HF_HUB_OFFLINE=1 python tools/asr/fasterwhisper_asr.py \
  -i output/slicer_opt \
  -o output/asr_opt \
  -l en \
  -s large-v3 \
  -p float32
```

Allowed `-s` values in this install: `medium`, `medium.en`, `large-v2`, `large-v3`, `large-v3-turbo`  
(`small` is **not** valid here.)

Verify:

```bash
ls output/asr_opt/*.list
wc -l output/asr_opt/slicer_opt.list
# should be ~one line per wav (e.g. ~39–40)
```

`.list` line format:

```text
/path/to/slice.wav|slicer_opt|EN|transcript text here
```

---

## 5. Fix Python package for Tab 1 (Mac / Python 3.9)

Pin `x-transformers` so GPT-SoVITS imports work:

```bash
conda activate GPTSoVits
pip install "x-transformers==1.31.14"

# correct check (GPT-SoVITS import path):
python -c "from x_transformers.x_transformers import RotaryEmbedding; print('ok')"
```

If 1.31.14 still breaks elsewhere:

```bash
pip install "x-transformers==1.27.14"
```

Ignore harmless `FutureWarning` about `torch.cuda.amp.autocast`.

---

## 6. Clean failed formatting logs

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
rm -rf logs/xxx logs/my_voice logs/my-voice
```

---

## 7. Tab 1A — Dataset formatting (UI)

Restart UI if needed:

```bash
python webui.py
```

Open **1-GPT-SoVITS-TTS** → **1A-Dataset Formatting Tool**.

| Field | Value |
| --- | --- |
| Experiment/model name | `my_voice` (not `xxx`) |
| GPU Information | `0` / CPU |
| Version | `v2Pro` |
| Text labelling file | `/Users/rushi/Desktop/Projects/GPT-SoVITS/output/asr_opt/slicer_opt.list` |
| Audio dataset folder | `/Users/rushi/Desktop/Projects/GPT-SoVITS/output/slicer_opt` |
| BERT pretrained | `GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large` |
| HuBERT / SSL | `GPT_SoVITS/pretrained_models/chinese-hubert-base` |
| Pretrained SoVITS-G | `GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth` |

**Option A — one click**

1. Fill paths above  
2. Click **Open Training Set One-Click Formatting**  
3. Watch Terminal until Success (not Error)

**Option B — manual order**

1. **Open Tokenization & BERT Feature Extraction** → wait Success  
2. **Open Speech SSL Feature Extraction** → wait Success  
3. **Open Semantics Token Extraction** → wait Success  
4. **Open Training Set One-Click Formatting** (if still needed)

Success check:

```bash
ls logs/my_voice/5-wav32k | head
ls logs/my_voice/4-cnhubert | head
ls logs/my_voice/ | head
# 5-wav32k must NOT be empty
```

---

## 8. Tab 1B — Fine-tuning (UI) — later

| Setting | Suggested (M4) |
| --- | --- |
| Experiment name | `my_voice` |
| Batch size | `4` (drop to `2` on OOM) |
| Total epochs | `15`–`20` |
| Device | CPU |
| Save latest weights | enabled if available |

Click **Open Training**. Watch **Terminal** for epoch/loss — do not close it. Overnight is normal on M4 CPU.

---

## FAQ — issues we hit & fixes

### Q1. `ModuleNotFoundError: No module named 'faster_whisper'`

ASR deps missing in the env.

```bash
conda activate GPTSoVits
pip install faster-whisper funasr
```

Then re-run the ASR command in §4.

---

### Q2. Web UI ASR only shows `zh` / `yue` (no English)

Use Terminal Faster-Whisper instead of the orange ASR button (see §4).  
In UI, if available, pick **Faster Whisper (多语言)** and set language to `en`.

---

### Q3. No `asr_opt` folder / no `.list` file after ASR

Search:

```bash
find /Users/rushi/Desktop/Projects/GPT-SoVITS/output -name "*.list"
ls -R /Users/rushi/Desktop/Projects/GPT-SoVITS/output
```

If nothing found, run Terminal ASR (§4). Do not start Tab 1 formatting until the `.list` exists.

---

### Q4. Stuck downloading `g2pw` (~638 MB) or Hugging Face models

```bash
# cancel hung download
Ctrl+C

# retry Web UI
python webui.py
```

For ASR, force local models:

```bash
HF_HUB_OFFLINE=1 python tools/asr/fasterwhisper_asr.py ...
```

At ~35 Mbps, large downloads can sit at 0% for a while; if no progress after ~5–10 minutes, cancel and retry or use a model already under `tools/asr/models/`.

---

### Q5. `fasterwhisper_asr.py: invalid choice: 'small'`

This install does not support `-s small`. Use:

```bash
-s large-v3-turbo
# or
-s large-v3
# or
-s medium.en
```

---

### Q6. Stuck on Faster-Whisper download `0.00/3.09G`

You’re pulling `large-v3` from the network. Prefer local turbo:

```bash
HF_HUB_OFFLINE=1 python tools/asr/fasterwhisper_asr.py \
  -i output/slicer_opt \
  -o output/asr_opt \
  -l en \
  -s large-v3-turbo \
  -p float32
```

---

### Q7. `TypeError: unsupported operand type(s) for |: 'type' and 'types.GenericAlias'` (`x_transformers`)

Python **3.9** + new `x-transformers` (uses `int | tuple`, needs 3.10+).

```bash
pip install "x-transformers==1.31.14"
python -c "from x_transformers.x_transformers import RotaryEmbedding; print('ok')"
```

---

### Q8. `ImportError: cannot import name 'RotaryEmbedding' from 'x_transformers'`

Wrong test import. Use the subpath GPT-SoVITS uses:

```bash
python -c "from x_transformers.x_transformers import RotaryEmbedding; print('ok')"
```

Not: `from x_transformers import RotaryEmbedding`.

---

### Q9. One-Click formatting: `LibsndfileError` opening `logs/.../5-wav32k/....wav`

`5-wav32k` is empty because SSL never wrote files. Usual cause: **clips too long** (multi-minute / 40s+).

Fix:

1. Re-slice to ~8s (§3)  
2. Re-run ASR (§4)  
3. Clean logs (§6)  
4. Re-run Tab 1A (§7)

Check:

```bash
ls logs/my_voice/5-wav32k
# must list wav files after SSL succeeds
```

---

### Q10. `FileNotFoundError: logs/.../6-name2semantic-0.tsv`

Cascade from earlier formatting failure (empty wav32k and/or `x_transformers` crash). Fix Q7 + Q9, then re-run 1A.

Also seen: `FileNotFoundError: logs/my_voice/2-name2text-0.txt` when jumping to training before ASR/formatting finished — finish ASR + 1A first.

---

### Q11. Experiment name / paths look wrong (`logs/xxx`, Windows `D:\...`)

- Default experiment name in UI is `xxx` — change to `my_voice`
- On Mac use absolute Unix paths, e.g. `/Users/rushi/Desktop/Projects/GPT-SoVITS/output/slicer_opt`
- Finder tip: Option + right-click → **Copy as Pathname**

---

### Q12. Pretrained SoVITS-G path empty on 1Ac

Set explicitly:

```text
GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth
```

Confirm files exist:

```bash
ls GPT_SoVITS/pretrained_models/v2Pro/
# expect s2Gv2Pro.pth and s2Dv2Pro.pth
```

---

### Q13. Web UI freezes during training / formatting

Normal. Watch the Terminal for progress (`Epoch`, `loss`, Success messages). Do not close the Terminal or stop `webui.py` until the step finishes.

---

### Q14. OOM / Memory Error during training on M4

In Tab 1B, lower batch size:

```text
batch size: 2
```

Keep epochs around 15–20.

---

### Q15. `OSError: chinese-hubert-base does not appear to have a file named preprocessor_config.json`

HuBERT folder is incomplete (only `config.json` + `pytorch_model.bin`). SSL step fails → `5-wav32k` stays empty → SV `LibsndfileError`.

Download missing file + v2Pro GPT base (`s1v3.ckpt`):

```bash
cd /Users/rushi/Desktop/Projects/GPT-SoVITS
conda activate GPTSoVits

python <<'PY'
from huggingface_hub import hf_hub_download
import shutil, os

path = hf_hub_download(repo_id="lj1995/GPT-SoVITS", filename="chinese-hubert-base/preprocessor_config.json")
dest = "GPT_SoVITS/pretrained_models/chinese-hubert-base/preprocessor_config.json"
shutil.copy2(path, dest)
print("hubert preprocessor", os.path.getsize(dest))

path2 = hf_hub_download(repo_id="lj1995/GPT-SoVITS", filename="s1v3.ckpt")
dest2 = "GPT_SoVITS/pretrained_models/s1v3.ckpt"
shutil.copy2(path2, dest2)
print("s1v3.ckpt", os.path.getsize(dest2))
PY

ls GPT_SoVITS/pretrained_models/chinese-hubert-base/
ls -lh GPT_SoVITS/pretrained_models/s1v3.ckpt
```

Then clean partial logs and re-run One-Click:

```bash
rm -rf logs/my_voice
python webui.py
# Tab 1A → Open Training Set One-Click Formatting again
```

Also ignore benign BERT warning (“Some weights … were not used”) and `ph not in symbols` for odd characters.

---

### Q16. Startup warning: `No Such Model: GPT_SoVITS/pretrained_models/s1v3.ckpt`

Required for **v2Pro**. Fixed by downloading `s1v3.ckpt` as in Q15.

---

## Quick path cheat sheet

| What | Path |
| --- | --- |
| Project | `/Users/rushi/Desktop/Projects/GPT-SoVITS` |
| Short wavs | `.../output/slicer_opt/` |
| Transcripts | `.../output/asr_opt/slicer_opt.list` |
| ASR models | `.../tools/asr/models/faster-whisper-large-v3-turbo/` |
| Train logs | `.../logs/my_voice/` |
| SoVITS-G (v2Pro) | `.../GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth` |
