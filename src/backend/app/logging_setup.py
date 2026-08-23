from __future__ import annotations

import logging
import sys
import threading
import time
import traceback
from datetime import datetime
from logging import Handler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"
WINDOW_SECONDS = 5 * 60
MAX_LOG_FILES = 30
RETENTION_INTERVAL_SECONDS = 60

_logger_configured = False
_retention_thread: threading.Thread | None = None


class TimedWindowFileHandler(Handler):
    """Rotate log files every 5 minutes while the process keeps running."""

    def __init__(self, log_dir: Path, window_seconds: int = WINDOW_SECONDS) -> None:
        super().__init__()
        self.log_dir = log_dir
        self.window_seconds = window_seconds
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._window_start = 0.0
        self._stream = None
        self._current_path: Path | None = None
        self._open_new_file()

    def _window_path(self, start: float) -> Path:
        stamp = datetime.fromtimestamp(start).strftime("%Y-%m-%dT%H-%M-%S")
        return self.log_dir / f"krayon_{stamp}.log"

    def _open_new_file(self) -> None:
        if self._stream:
            self._stream.close()
        self._window_start = time.time()
        self._current_path = self._window_path(self._window_start)
        self._stream = open(self._current_path, "a", encoding="utf-8")

    def _maybe_rotate(self) -> None:
        if time.time() - self._window_start >= self.window_seconds:
            self._open_new_file()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._maybe_rotate()
            msg = self.format(record)
            if self._stream:
                self._stream.write(msg + "\n")
                self._stream.flush()
        except Exception:
            self.handleError(record)

    def close(self) -> None:
        if self._stream:
            self._stream.close()
            self._stream = None
        super().close()


def prune_old_logs(log_dir: Path, max_files: int = MAX_LOG_FILES) -> None:
    files = sorted(log_dir.glob("krayon_*.log"), key=lambda p: p.stat().st_mtime)
    while len(files) > max_files:
        oldest = files.pop(0)
        try:
            oldest.unlink()
        except OSError:
            pass


def _retention_loop(log_dir: Path) -> None:
    while True:
        time.sleep(RETENTION_INTERVAL_SECONDS)
        try:
            prune_old_logs(log_dir)
        except Exception:
            pass


def setup_logging() -> None:
    global _logger_configured
    if _logger_configured:
        return
    _logger_configured = True

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    prune_old_logs(LOG_DIR)

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = TimedWindowFileHandler(LOG_DIR)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)

    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(fmt)

    root.handlers.clear()
    root.addHandler(file_handler)
    root.addHandler(console_handler)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").propagate = True


def start_log_retention() -> None:
    global _retention_thread
    if _retention_thread and _retention_thread.is_alive():
        return
    _retention_thread = threading.Thread(
        target=_retention_loop,
        args=(LOG_DIR,),
        daemon=True,
        name="krayon-log-retention",
    )
    _retention_thread.start()


def log_exception_detail(logger: logging.Logger, exc: BaseException, *, context: str = "") -> None:
    logger.error("%s%s: %s", context, type(exc).__name__, exc)
    logger.debug("Traceback:\n%s", "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
