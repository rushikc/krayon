"""Logging for the local backend: console + rotating files under logs/.

  logs/app.log    human-readable lines
  logs/app.jsonl  one JSON object per line (grep/jq friendly)

Every record carries the current request id (contextvar set by RequestLogMiddleware).
Structured fields go in `extra={"data": {...}}` and show up as top-level keys in app.jsonl.
"""
import contextvars
import json
import logging
import logging.config
import os
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = (ROOT / os.getenv("LOG_DIR", "./logs")).resolve()
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_BODY_MAX = int(os.getenv("LOG_BODY_MAX", "2000"))

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_SECRET_KEY = re.compile(r"(authorization|cookie|api[-_]?key|token|secret|password|credential)", re.I)
_SECRET_VALUE = re.compile(r"(AIza[0-9A-Za-z_\-]{30,}|ya29\.[0-9A-Za-z_\-.]+|Bearer\s+[0-9A-Za-z_\-.=]+)")


def redact(value):
    """Recursively mask secret-looking keys and values."""
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if _SECRET_KEY.search(str(k)) else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return _SECRET_VALUE.sub("[REDACTED]", value)
    return value


def truncate(text: str, limit: int = LOG_BODY_MAX) -> str:
    return text if len(text) <= limit else f"{text[:limit]}…[+{len(text) - limit} chars]"


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        out = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(record.created)) + f".{int(record.msecs):03d}"
                  + time.strftime("%z", time.localtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "msg": redact(record.getMessage()),
        }
        data = getattr(record, "data", None)
        if isinstance(data, dict):
            out.update(redact(data))
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    def format(self, record):
        line = super().format(record)
        data = getattr(record, "data", None)
        if isinstance(data, dict) and data:
            line += " " + truncate(json.dumps(redact(data), default=str, ensure_ascii=False), LOG_BODY_MAX * 2)
        return redact(line) if not record.exc_info else line


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    rotating = {"class": "logging.handlers.RotatingFileHandler", "maxBytes": 5_000_000, "backupCount": 5,
                "encoding": "utf-8", "filters": ["rid"]}
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {"rid": {"()": RequestIdFilter}},
        "formatters": {
            "text": {"()": TextFormatter, "fmt": "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"},
            "json": {"()": JsonFormatter},
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "text", "filters": ["rid"]},
            "file_text": {**rotating, "formatter": "text", "filename": str(LOG_DIR / "app.log")},
            "file_json": {**rotating, "formatter": "json", "filename": str(LOG_DIR / "app.jsonl")},
        },
        "root": {"level": LOG_LEVEL, "handlers": ["console", "file_text", "file_json"]},
        "loggers": {
            # uvicorn's own logs go to the same files; access lines are replaced by our middleware.
            "uvicorn": {"handlers": [], "propagate": True, "level": LOG_LEVEL},
            "uvicorn.error": {"handlers": [], "propagate": True, "level": LOG_LEVEL},
            "uvicorn.access": {"handlers": [], "propagate": False, "level": "WARNING"},
            # Noisy third-party loggers.
            "httpx": {"level": "WARNING"}, "httpcore": {"level": "WARNING"},
            "google_genai": {"level": "WARNING"}, "urllib3": {"level": "WARNING"}, "multipart": {"level": "WARNING"},
        },
    })
