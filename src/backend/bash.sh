#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_DIR=".krayonenv"
DEPS_MARKER="$ENV_DIR/.deps-installed"

if [[ ! -d "$ENV_DIR" ]]; then
  python3 -m venv "$ENV_DIR"
fi

if [[ "${VIRTUAL_ENV:-}" != "$(pwd)/$ENV_DIR" ]]; then
  source "$ENV_DIR/bin/activate"
fi

if [[ ! -f "$DEPS_MARKER" ]] || [[ requirements.txt -nt "$DEPS_MARKER" ]]; then
  pip install -r requirements.txt
  touch "$DEPS_MARKER"
fi

WHISPER_MODEL="${KRAYON_WHISPER_MODEL:-base}"
WHISPER_MARKER="$ENV_DIR/.whisper-ready-${WHISPER_MODEL}"

if [[ ! -f "$WHISPER_MARKER" ]]; then
  echo "→ Downloading Whisper model (${WHISPER_MODEL}) — one-time setup…"
  python -c "from app.services.transcribe import warmup_whisper_model; warmup_whisper_model()"
  touch "$WHISPER_MARKER"
fi

exec uvicorn app.main:app --reload --port 8000
