#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_DIR=".krayonenv"

pick_python() {
  local candidate
  for candidate in python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  echo "No suitable python3 found." >&2
  exit 1
}

PYTHON_BIN="${KRAYON_PYTHON:-$(pick_python)}"

if [[ ! -d "$ENV_DIR" ]]; then
  "$PYTHON_BIN" -m venv "$ENV_DIR"
fi

# shellcheck disable=SC1091
source "$ENV_DIR/bin/activate"

pip install -q -r requirements.txt
exec python -m pytest tests -q
