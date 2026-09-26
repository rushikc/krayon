from __future__ import annotations

PHASE_WEIGHTS: dict[str, tuple[float, float]] = {
    "starting": (0.00, 0.02),
    "transcribing": (0.02, 0.86),
    "segmenting": (0.86, 0.90),
    "grouping": (0.90, 0.94),
    "extracting_audio": (0.94, 0.99),
    "complete": (1.0, 1.0),
    "error": (1.0, 1.0),
}

REBUILD_PHASE_WEIGHTS: dict[str, tuple[float, float]] = {
    "starting": (0.00, 0.05),
    "segmenting": (0.05, 0.20),
    "grouping": (0.20, 0.35),
    "extracting_audio": (0.35, 0.99),
    "complete": (1.0, 1.0),
    "error": (1.0, 1.0),
}


def overall_progress(phase: str, step_progress: float, *, rebuild: bool = False) -> float:
    weights = REBUILD_PHASE_WEIGHTS if rebuild else PHASE_WEIGHTS
    lo, hi = weights.get(phase, (0.0, 1.0))
    clamped = max(0.0, min(1.0, step_progress))
    return lo + (hi - lo) * clamped
