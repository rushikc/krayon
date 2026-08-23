from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from difflib import SequenceMatcher

from app.config import settings
from app.schemas import ClipGroup, ClipItem
from app.services.segments import Segment, Word


FILLER_WORDS = {"um", "uh", "like", "you", "know", "so", "well", "okay", "ok", "ah"}

# Retakes often share the opening line then diverge — 4+ matching words is a strong same-take signal.
MIN_SHARED_PREFIX_WORDS = 4


def normalize_text(text: str) -> str:
    lowered = text.lower()
    cleaned = re.sub(r"[^\w\s]", " ", lowered)
    tokens = [t for t in cleaned.split() if t and t not in FILLER_WORDS]
    return " ".join(tokens)


def shared_prefix_word_count(a: str, b: str) -> int:
    wa, wb = a.split(), b.split()
    count = 0
    for x, y in zip(wa, wb, strict=False):
        if x == y:
            count += 1
        else:
            break
    return count


def prefix_word_ratio(a: str, b: str) -> float:
    wa, wb = a.split(), b.split()
    if not wa or not wb:
        return 0.0
    shared = shared_prefix_word_count(a, b)
    return shared / min(len(wa), len(wb))


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if shared_prefix_word_count(a, b) >= MIN_SHARED_PREFIX_WORDS:
        return 1.0
    ratio = SequenceMatcher(None, a, b).ratio()
    return max(ratio, prefix_word_ratio(a, b))


def group_clips_by_text(
    clip_texts: list[tuple[str, str]],
    *,
    threshold: float | None = None,
) -> dict[str, str]:
    limit = threshold if threshold is not None else settings.clip_similarity_threshold
    groups: list[tuple[str, str, list[str]]] = []
    mapping: dict[str, str] = {}

    for clip_id, text in clip_texts:
        norm = normalize_text(text)
        best_group: str | None = None
        best_score = 0.0

        for group_id, _label, group_norms in groups:
            for group_norm in group_norms:
                score = similarity(norm, group_norm)
                if score >= limit and score > best_score:
                    best_score = score
                    best_group = group_id

        if best_group is None:
            group_id = str(uuid.uuid4())[:8]
            label = text.strip()[:48] or f"Take {len(groups) + 1}"
            groups.append((group_id, label, [norm]))
            mapping[clip_id] = group_id
        else:
            mapping[clip_id] = best_group
            for i, (group_id, label, group_norms) in enumerate(groups):
                if group_id == best_group:
                    groups[i] = (group_id, label, group_norms + [norm])
                    break

    return mapping


def words_in_segment(words: list[Word], seg: Segment) -> list[Word]:
    return [w for w in words if w.end > seg.source_start and w.start < seg.source_end]


def segment_text(words: list[Word], seg: Segment) -> str:
    return " ".join(w.text for w in words_in_segment(words, seg)).strip()


def build_segment_clips(
    stem: str,
    segments: list[Segment],
    words: list[Word],
    *,
    similarity_threshold: float | None = None,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> tuple[list[ClipItem], list[ClipGroup]]:
    clip_text_pairs: list[tuple[str, str]] = []
    raw_clips: list[ClipItem] = []
    total = len(segments)

    for index, segment in enumerate(segments):
        clip_id = f"{stem}_seg_{index:03d}"
        text = segment_text(words, segment)
        duration = segment.source_end - segment.source_start

        item = ClipItem(
            id=clip_id,
            index=index,
            source_start=segment.source_start,
            source_end=segment.source_end,
            duration=duration,
            text=text or f"Segment {index + 1}",
            group_id="pending",
        )
        raw_clips.append(item)
        clip_text_pairs.append((clip_id, item.text))

        if on_progress:
            on_progress(index + 1, total, f"Building segment {index + 1}/{total}")

    group_map = group_clips_by_text(
        clip_text_pairs,
        threshold=similarity_threshold,
    )
    for clip in raw_clips:
        clip.group_id = group_map[clip.id]

    groups_by_id: dict[str, ClipGroup] = {}
    for clip in raw_clips:
        gid = clip.group_id
        if gid not in groups_by_id:
            groups_by_id[gid] = ClipGroup(id=gid, label=clip.text[:48], clip_ids=[])
        groups_by_id[gid].clip_ids.append(clip.id)

    return raw_clips, list(groups_by_id.values())
