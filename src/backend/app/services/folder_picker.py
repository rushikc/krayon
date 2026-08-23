from __future__ import annotations

import subprocess
import sys


def pick_folder_macos(*, prompt: str = "Select media folder") -> str | None:
    """Open the native macOS folder picker and return an absolute POSIX path."""
    if sys.platform != "darwin":
        raise RuntimeError("Native folder picker is only supported on macOS")

    script = f'POSIX path of (choose folder with prompt "{prompt}")'
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        # User cancelled or dialog failed
        return None

    path = result.stdout.strip().rstrip("/")
    return path or None
