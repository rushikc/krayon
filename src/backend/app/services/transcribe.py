from __future__ import annotations

import logging
import time
from functools import lru_cache
from pathlib import Path

from faster_whisper import WhisperModel

from app.config import settings
from app.services.ffmpeg import extract_audio, probe_media
from app.services.segments import Word

logger = logging.getLogger("krayon.whisper")


@lru_cache(maxsize=1)
def get_whisper_model() -> WhisperModel:
    kwargs: dict = {
        "model_size_or_path": settings.whisper_model,
        "device": settings.whisper_device,
        "compute_type": settings.whisper_compute_type,
    }
    if settings.whisper_download_root:
        kwargs["download_root"] = settings.whisper_download_root
    return WhisperModel(**kwargs)


def is_whisper_model_loaded() -> bool:
    return get_whisper_model.cache_info().currsize > 0


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except Exception:
        return False


def whisper_ready() -> bool:
    return whisper_available() and is_whisper_model_loaded()


def warmup_whisper_model() -> None:
    if is_whisper_model_loaded():
        logger.info("Whisper model already loaded (%s)", settings.whisper_model)
        return

    logger.info("Loading Whisper model (%s)…", settings.whisper_model)
    started = time.perf_counter()
    get_whisper_model()
    elapsed = time.perf_counter() - started
    logger.info("Whisper model ready in %.1fs", elapsed)


def transcribe_words(
    source_path: Path,
    wav_path: Path,
    *,
    language: str | None = "en",
    on_progress=None,
) -> list[Word]:
    if on_progress:
        on_progress(0.05, "Extracting audio…")

    extract_audio(source_path, wav_path)

    model = get_whisper_model()

    if on_progress:
        on_progress(0.25, "Transcribing…")

    segments, info = model.transcribe(
        str(wav_path),
        language=language,
        word_timestamps=True,
        vad_filter=True,
    )

    total_duration = float(info.duration or 0.0)
    if total_duration <= 0:
        try:
            total_duration = float(probe_media(wav_path).duration or 0.0)
        except Exception:
            total_duration = 0.0

    words: list[Word] = []
    last_ratio = 0.25
    segment_count = 0

    for segment in segments:
        segment_count += 1
        if segment.words:
            for w in segment.words:
                text = (w.word or "").strip()
                if not text:
                    continue
                words.append(Word(text=text, start=float(w.start), end=float(w.end)))
        else:
            text = (segment.text or "").strip()
            if text:
                words.append(
                    Word(text=text, start=float(segment.start), end=float(segment.end))
                )

        if on_progress and total_duration > 0:
            transcribe_ratio = min(1.0, float(segment.end) / total_duration)
            ratio = 0.25 + 0.75 * transcribe_ratio
            if ratio - last_ratio >= 0.01 or transcribe_ratio >= 0.99:
                on_progress(ratio, f"Transcribing… {int(transcribe_ratio * 100)}%")
                last_ratio = ratio
        elif on_progress and segment_count % 5 == 0:
            on_progress(0.5, f"Transcribing… ({segment_count} segments)")

    words.sort(key=lambda w: (w.start, w.end))

    if on_progress:
        on_progress(1.0, f"Transcribed {len(words)} words")

    return words
