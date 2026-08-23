from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("krayon.request")

STREAM_PREFIXES = (
    "/api/media/stream/",
    "/api/media/proxy/",
    "/api/media/clip/",
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        is_stream = any(path.startswith(prefix) for prefix in STREAM_PREFIXES)

        if is_stream:
            return await call_next(request)

        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                "%s %s %s %dms",
                request.method,
                path,
                status_code,
                elapsed_ms,
            )
