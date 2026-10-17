"""ASGI middleware that logs every request/response with a request id."""
import json
import logging
import time
import uuid
from urllib.parse import parse_qsl

from .logging_setup import redact, request_id_var, truncate

log = logging.getLogger("krayon.http")
_REDACT_HEADERS = {"authorization", "cookie", "x-api-key", "x-goog-api-key", "x-firebase-appcheck"}


def _describe_body(content_type: str, body: bytes):
    if not body:
        return None
    ctype = content_type.lower()
    if "multipart/form-data" in ctype and "boundary=" in ctype:
        boundary = ctype.split("boundary=", 1)[1].split(";")[0].strip().strip('"').encode()
        fields: dict = {}
        files: list = []
        for part in body.split(b"--" + boundary):
            if b"\r\n\r\n" not in part:
                continue
            head, _, content = part.partition(b"\r\n\r\n")
            content = content[:-2] if content.endswith(b"\r\n") else content
            headers = head.decode(errors="replace")
            name = filename = None
            ptype = "text/plain"
            for line in headers.split("\r\n"):
                low = line.lower()
                if low.startswith("content-disposition"):
                    for item in line.split(";"):
                        k, _, v = item.strip().partition("=")
                        if k == "name": name = v.strip('"')
                        if k == "filename": filename = v.strip('"')
                elif low.startswith("content-type"):
                    ptype = line.split(":", 1)[1].strip()
            if filename is not None:
                files.append({"field": name, "filename": filename, "content_type": ptype, "size": len(content)})
            elif name:
                fields[name] = truncate(content.decode(errors="replace"), 200)
        return {"form": redact(fields), "files": files}
    if "application/x-www-form-urlencoded" in ctype:
        return {"form": redact(dict(parse_qsl(body.decode(errors="replace"))))}
    text = body.decode(errors="replace")
    if "json" in ctype:
        try:
            parsed = redact(json.loads(text))
            return _shorten(parsed)
        except ValueError:
            pass
    return truncate(redact(text))


def _shorten(value, limit=None):
    """Keep JSON structure but cap long strings and the whole size."""
    from .logging_setup import LOG_BODY_MAX
    def cap(v):
        if isinstance(v, str):
            return truncate(v, 500)
        if isinstance(v, dict):
            return {k: cap(x) for k, x in v.items()}
        if isinstance(v, list):
            return [cap(x) for x in v[:50]] + ([f"…[+{len(v) - 50} items]"] if len(v) > 50 else [])
        return v
    out = cap(value)
    if len(json.dumps(out, default=str)) > (limit or LOG_BODY_MAX) * 2:
        return truncate(json.dumps(out, default=str), limit or LOG_BODY_MAX)
    return out


class RequestLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode(errors="replace") for k, v in scope.get("headers", [])}
        rid = headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        start = time.perf_counter()
        req_body = bytearray()
        resp = {"status": 500, "headers": {}, "body": bytearray(), "started": False}

        async def recv():
            message = await receive()
            if message["type"] == "http.request":
                req_body.extend(message.get("body", b""))
            return message

        async def snd(message):
            if message["type"] == "http.response.start":
                resp["status"] = message["status"]
                resp["started"] = True
                message.setdefault("headers", [])
                message["headers"] = list(message["headers"]) + [(b"x-request-id", rid.encode())]
                resp["headers"] = {k.decode().lower(): v.decode(errors="replace") for k, v in message["headers"]}
            elif message["type"] == "http.response.body" and len(resp["body"]) < 64_000:
                resp["body"].extend(message.get("body", b""))
            await send(message)

        base = {
            "event": "request",
            "method": scope["method"],
            "path": scope["path"],
            "query": redact(dict(parse_qsl(scope.get("query_string", b"").decode()))),
            "user": headers.get("x-user-id", "local-user"),
            "client": (scope.get("client") or ["-"])[0],
        }
        try:
            await self.app(scope, recv, snd)
        except Exception:
            log.exception("Unhandled exception on %s %s", scope["method"], scope["path"], extra={"data": {**base, "event": "error"}})
            if not resp["started"]:
                body = json.dumps({"detail": "Internal server error", "requestId": rid}).encode()
                await snd({"type": "http.response.start", "status": 500, "headers": [(b"content-type", b"application/json")]})
                await snd({"type": "http.response.body", "body": body})
        finally:
            duration = round((time.perf_counter() - start) * 1000, 1)
            status = resp["status"]
            safe_headers = {k: ("[REDACTED]" if k in _REDACT_HEADERS else v) for k, v in headers.items()
                            if k in _REDACT_HEADERS or k in ("content-type", "content-length", "user-agent", "x-user-id", "origin")}
            data = {
                **base,
                "event": "response",
                "status": status,
                "duration_ms": duration,
                "request_headers": safe_headers,
                "request_body": _describe_body(headers.get("content-type", ""), bytes(req_body)),
                "response_type": resp["headers"].get("content-type"),
                "response_body": _describe_body(resp["headers"].get("content-type", ""), bytes(resp["body"])),
            }
            level = logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO
            log.log(level, "%s %s -> %s (%.1f ms)", scope["method"], scope["path"], status, duration, extra={"data": data})
            request_id_var.reset(token)
