from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("krayon.pipeline")


@dataclass
class PipelineContext:
    job_id: str
    version_id: str | None = None
    media_id: str | None = None
    source: Path | None = None
    _phase_started: float = field(default_factory=time.perf_counter, repr=False)
    _job_started: float = field(default_factory=time.perf_counter, repr=False)

    @property
    def source_name(self) -> str:
        return self.source.name if self.source else "unknown"

    def _suffix(self, **extra: object) -> str:
        parts = [
            f"job_id={self.job_id}",
        ]
        if self.version_id:
            parts.append(f"version_id={self.version_id}")
        if self.media_id:
            parts.append(f"media_id={self.media_id}")
        parts.append(f"source={self.source_name}")
        for key, value in extra.items():
            parts.append(f"{key}={value}")
        return " ".join(parts)

    def _elapsed_ms(self, since: float | None = None) -> int:
        start = since if since is not None else self._phase_started
        return int((time.perf_counter() - start) * 1000)

    def reset_phase_timer(self) -> None:
        self._phase_started = time.perf_counter()

    def job_start(self, **extra: object) -> None:
        logger.info("pipeline job start %s", self._suffix(**extra))

    def job_finish(self, **extra: object) -> None:
        elapsed_ms = extra.pop("elapsed_ms", self._elapsed_ms(self._job_started))
        logger.info(
            "pipeline job finish %s",
            self._suffix(elapsed_ms=elapsed_ms, **extra),
        )

    def phase(self, phase: str, message: str, *, level: int = logging.INFO, **extra: object) -> None:
        logger.log(level, "pipeline %s %s", message, self._suffix(phase=phase, **extra))

    def phase_complete(self, phase: str, **extra: object) -> None:
        elapsed_ms = extra.pop("elapsed_ms", self._elapsed_ms())
        logger.info(
            "pipeline phase complete %s",
            self._suffix(phase=phase, elapsed_ms=elapsed_ms, **extra),
        )
        self.reset_phase_timer()

    def error(self, phase: str, exc: BaseException) -> None:
        logger.error(
            "pipeline failed %s",
            self._suffix(phase=phase, error=str(exc)),
            exc_info=True,
        )
