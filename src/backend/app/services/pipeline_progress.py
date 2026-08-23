from __future__ import annotations

PHASE_WEIGHTS: dict[str, tuple[float, float]] = {
    "starting": (0.00, 0.02),
    "transcribing": (0.02, 0.72),
    "segmenting": (0.72, 0.76),
    "cutting": (0.76, 0.96),
    "grouping": (0.96, 0.99),
    "complete": (1.0, 1.0),
    "error": (1.0, 1.0),
}


def overall_progress(phase: str, step_progress: float) -> float:
    lo, hi = PHASE_WEIGHTS.get(phase, (0.0, 1.0))
    clamped = max(0.0, min(1.0, step_progress))
    return lo + (hi - lo) * clamped
