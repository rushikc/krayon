"""Real Gemini calls (google-genai). This is the only place the API key is used."""
from typing import Any

import logging
import time
import warnings

from ..config import ai_backend, settings

# ADC user credentials without a quota project are fine for Vertex here.
warnings.filterwarnings("ignore", message="Your application has authenticated using end user credentials")

_TYPE_KEYS = {"type"}
_ALLOWED = {"type", "properties", "items", "required", "description", "enum", "nullable", "format",
            "propertyOrdering", "minItems", "maxItems", "minimum", "maximum", "anyOf"}


class GeminiNotConfigured(RuntimeError):
    pass


def normalize_schema(schema: Any) -> Any:
    """Turn a firebase/ai Schema JSON (lowercase OpenAPI subset) into a google-genai schema dict."""
    if isinstance(schema, list):
        return [normalize_schema(s) for s in schema]
    if not isinstance(schema, dict):
        return schema
    out: dict[str, Any] = {}
    for key, value in schema.items():
        if key not in _ALLOWED:
            continue
        if key == "type" and isinstance(value, str):
            out[key] = value.upper()
        elif key == "properties":
            out[key] = {k: normalize_schema(v) for k, v in value.items()}
        elif key in ("items",):
            out[key] = normalize_schema(value)
        elif key == "anyOf":
            out[key] = [normalize_schema(v) for v in value]
        else:
            out[key] = value
    return out


_client = None
log = logging.getLogger("krayon.gemini")


def _get_client():
    global _client
    backend = ai_backend()
    if backend == "none":
        raise GeminiNotConfigured(
            "No AI backend configured: set GOOGLE_CLOUD_PROJECT (Vertex via gcloud ADC) or GEMINI_API_KEY in local-backend/.env")
    if _client is None:
        from google import genai

        if backend == "vertex":
            _client = genai.Client(vertexai=True, project=settings.google_cloud_project,
                                   location=settings.google_cloud_location)
        else:
            _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def generate_json(prompt: str, response_schema: dict | None, file_bytes: bytes | None = None,
                  mime_type: str | None = None, model: str | None = None) -> str:
    from google.genai import types

    client = _get_client()
    parts: list[Any] = []
    if file_bytes is not None:
        parts.append(types.Part.from_bytes(data=file_bytes, mime_type=mime_type or "application/octet-stream"))
    parts.append(prompt)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=normalize_schema(response_schema) if response_schema else None,
    )
    info = {"event": "gemini", "backend": ai_backend(), "model": model or settings.gemini_model,
            "prompt_chars": len(prompt), "file_bytes": len(file_bytes) if file_bytes is not None else 0,
            "file_type": mime_type, "has_schema": bool(response_schema)}
    start = time.perf_counter()
    try:
        result = client.models.generate_content(model=info["model"], contents=parts, config=config)
    except Exception as exc:
        info["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)
        log.exception("Gemini call failed: %s", type(exc).__name__, extra={"data": {**info, "error": str(exc)[:1000]}})
        raise
    info["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)
    usage = getattr(result, "usage_metadata", None)
    if usage is not None:
        # Key is "usage", not "tokens": the log redactor masks keys containing "token".
        info["usage"] = {"prompt": usage.prompt_token_count, "output": usage.candidates_token_count,
                         "thoughts": getattr(usage, "thoughts_token_count", None), "total": usage.total_token_count}
    text = result.text or ""
    info["response_chars"] = len(text)
    candidates = getattr(result, "candidates", None) or []
    if candidates:
        info["finish_reason"] = str(getattr(candidates[0], "finish_reason", None))
    log.info("Gemini %s %.0f ms", info["model"], info["latency_ms"], extra={"data": info})
    log.debug("Gemini response text", extra={"data": {"event": "gemini.text", "text": text[:2000]}})
    return text
