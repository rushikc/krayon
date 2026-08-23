from __future__ import annotations

import logging
import traceback

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.logging_setup import log_exception_detail

logger = logging.getLogger("krayon.error")


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    logger.error(
        "ERROR %s %s %s: %s",
        request.method,
        request.url.path,
        exc.status_code,
        detail,
    )
    logger.debug(
        "HTTPException detail path=%s query=%s body=%s",
        request.url.path,
        request.url.query,
        _safe_body_note(request),
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "ERROR %s %s 500: %s",
        request.method,
        request.url.path,
        exc,
    )
    log_exception_detail(
        logger,
        exc,
        context=f"Unhandled {request.method} {request.url.path} ",
    )
    logger.debug(
        "Request context path=%s query=%s body=%s",
        request.url.path,
        request.url.query,
        _safe_body_note(request),
    )
    logger.debug("Full traceback:\n%s", traceback.format_exc())
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def _safe_body_note(request: Request) -> str:
    if request.method not in {"POST", "PUT", "PATCH"}:
        return "(none)"
    return "(body omitted; see application logs for payload details)"
