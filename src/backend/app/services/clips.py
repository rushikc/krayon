from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from difflib import SequenceMatcher

from app.config import settings
from app.schemas import ClipGroup, ClipItem, WordTiming
from app.services.segments import Segment, Word


FILLER_WORDS = {"um", "uh", "like", "you", "know", "so", "well", "okay", "ok", "ah"}

# Retakes often share the opening line then diverge — 4+ matching words is a strong same-take signal.
MIN_SHARED_PREFIX_WORDS = 4
MIN_SHARED_SUFFIX_WORDS = 4
MIN_CONTAINMENT_WORDS = 3
MAX_CONTINUATION_GAP_SECONDS = 5.0
MIN_SHORT_PREFIX_WORDS = 2
MIN_FUZZY_WORD_COUNT = 4
MIN_FUZZY_RATIO = 0.70


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


def shared_suffix_word_count(a: str, b: str) -> int:
    wa, wb = a.split(), b.split()
    count = 0
    for x, y in zip(reversed(wa), reversed(wb), strict=False):
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


def suffix_word_ratio(a: str, b: str) -> float:
    wa, wb = a.split(), b.split()
    if not wa or not wb:
        return 0.0
    shared = shared_suffix_word_count(a, b)
    return shared / min(len(wa), len(wb))


def _containment_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    shorter, longer = (a, b) if len(a.split()) <= len(b.split()) else (b, a)
    if len(shorter.split()) < MIN_CONTAINMENT_WORDS:
        return False
    return shorter in longer


def _is_word_prefix(short: str, long: str) -> bool:
    sw, lw = short.split(), long.split()
    if len(sw) < MIN_CONTAINMENT_WORDS or len(sw) > len(lw):
        return False
    if lw[: len(sw)] == sw:
        return True
    return shared_prefix_word_count(short, long) >= MIN_CONTAINMENT_WORDS and prefix_word_ratio(short, long) >= 0.8


def _is_word_suffix(short: str, long: str) -> bool:
    sw, lw = short.split(), long.split()
    if len(sw) < MIN_CONTAINMENT_WORDS or len(sw) > len(lw):
        return False
    return lw[-len(sw) :] == sw


def _entire_shorter_is_prefix(a: str, b: str) -> bool:
    wa, wb = a.split(), b.split()
    if not wa or not wb:
        return False
    shorter, longer = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    if len(shorter) < MIN_SHORT_PREFIX_WORDS:
        return False
    return longer[: len(shorter)] == shorter


def _entire_shorter_is_suffix(a: str, b: str) -> bool:
    wa, wb = a.split(), b.split()
    if not wa or not wb:
        return False
    shorter, longer = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
    if len(shorter) < MIN_CONTAINMENT_WORDS:
        return False
    return longer[-len(shorter) :] == shorter


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if shared_prefix_word_count(a, b) >= MIN_SHARED_PREFIX_WORDS:
        return 1.0
    if shared_suffix_word_count(a, b) >= MIN_SHARED_SUFFIX_WORDS:
        return 1.0
    if _containment_match(a, b):
        return 1.0
    if _entire_shorter_is_prefix(a, b) or _entire_shorter_is_suffix(a, b):
        return 1.0
    wa, wb = a.split(), b.split()
    if len(wa) < MIN_FUZZY_WORD_COUNT or len(wb) < MIN_FUZZY_WORD_COUNT:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    return ratio if ratio >= MIN_FUZZY_RATIO else 0.0


def group_clips_by_text(
    clip_texts: list[tuple[str, str]],
    *,
    threshold: float | None = None,
) -> dict[str, str]:
    limit = threshold if threshold is not None else settings.clip_similarity_threshold
    ids = [clip_id for clip_id, _ in clip_texts]
    norms = {clip_id: normalize_text(text) for clip_id, text in clip_texts}

    parent = {clip_id: clip_id for clip_id in ids}

    def find(clip_id: str) -> str:
        while parent[clip_id] != clip_id:
            parent[clip_id] = parent[parent[clip_id]]
            clip_id = parent[clip_id]
        return clip_id

    def union(left: str, right: str) -> None:
        root_left, root_right = find(left), find(right)
        if root_left != root_right:
            parent[root_right] = root_left

    for i, (id_a, _) in enumerate(clip_texts):
        for id_b, _ in clip_texts[i + 1 :]:
            if similarity(norms[id_a], norms[id_b]) >= limit:
                union(id_a, id_b)

    root_to_group: dict[str, str] = {}
    mapping: dict[str, str] = {}
    for clip_id in ids:
        root = find(clip_id)
        if root not in root_to_group:
            root_to_group[root] = str(uuid.uuid4())[:8]
        mapping[clip_id] = root_to_group[root]
    return mapping


def words_in_segment(words: list[Word], seg: Segment) -> list[Word]:
    return [w for w in words if w.end > seg.source_start and w.start < seg.source_end]


def segment_text(words: list[Word], seg: Segment) -> str:
    return " ".join(w.text for w in words_in_segment(words, seg)).strip()


def _combine_clips(left: ClipItem, right: ClipItem) -> ClipItem:
    text = f"{left.text} {right.text}".strip()
    combined_words = list(left.words or []) + list(right.words or [])
    return ClipItem(
        id=left.id,
        index=left.index,
        source_start=left.source_start,
        source_end=right.source_end,
        duration=right.source_end - left.source_start,
        text=text,
        group_id="pending",
        words=combined_words,
        false_start=False,
    )


def _has_reconstruction_anchor(left_norm: str, right_norm: str, other_norms: list[str]) -> bool:
    if len(right_norm.split()) < MIN_CONTAINMENT_WORDS:
        return False
    left_len = len(left_norm.split())
    right_len = len(right_norm.split())
    for other in other_norms:
        if len(other.split()) <= max(left_len, right_len):
            continue
        if _is_word_prefix(left_norm, other) and _is_word_suffix(right_norm, other):
            return True
    return False


def merge_continuation_clips(clips: list[ClipItem], stem: str) -> list[ClipItem]:
    if len(clips) < 2:
        return clips

    merged: list[ClipItem] = []
    i = 0
    while i < len(clips):
        current = clips[i]
        j = i + 1
        while j < len(clips):
            gap = clips[j].source_start - current.source_end
            if gap < 0 or gap > MAX_CONTINUATION_GAP_SECONDS:
                break
            left_norm = normalize_text(current.text)
            right_norm = normalize_text(clips[j].text)
            others = [
                normalize_text(clip.text)
                for k, clip in enumerate(clips)
                if k < i or k > j
            ]
            if not _has_reconstruction_anchor(left_norm, right_norm, others):
                break
            current = _combine_clips(current, clips[j])
            j += 1
        merged.append(current)
        i = j

    return _reindex_clips(merged, stem)


def _normalized_token(text: str) -> str:
    return normalize_text(text)


def find_restart_index(words: list[WordTiming]) -> int | None:
    tokens: list[tuple[int, str]] = []
    for index, word in enumerate(words):
        token = _normalized_token(word.text)
        if token:
            tokens.append((index, token))

    token_list = [token for _, token in tokens]
    n = len(token_list)
    if n < MIN_SHARED_PREFIX_WORDS * 2:
        return None

    for start in range(MIN_SHARED_PREFIX_WORDS, n - MIN_SHARED_PREFIX_WORDS + 1):
        match = 0
        while (
            match < start
            and start + match < n
            and token_list[match] == token_list[start + match]
        ):
            match += 1
        if match < MIN_SHARED_PREFIX_WORDS:
            continue
        if start < MIN_CONTAINMENT_WORDS or n - start < MIN_CONTAINMENT_WORDS:
            continue
        return tokens[start][0]
    return None


def _clip_slice(
    clip: ClipItem,
    words: list[WordTiming],
    *,
    source_start: float,
    source_end: float,
    false_start: bool,
) -> ClipItem:
    text = " ".join(word.text for word in words).strip()
    return ClipItem(
        id=clip.id,
        index=clip.index,
        source_start=source_start,
        source_end=source_end,
        duration=max(0.0, source_end - source_start),
        text=text or clip.text,
        group_id=clip.group_id,
        words=words,
        false_start=false_start,
    )


def _split_clip_at_restarts(clip: ClipItem) -> list[ClipItem]:
    words = list(clip.words or [])
    restart_at = find_restart_index(words)
    if restart_at is None:
        return [clip]

    left_words = words[:restart_at]
    right_words = words[restart_at:]
    if not left_words or not right_words:
        return [clip]

    left = _clip_slice(
        clip,
        left_words,
        source_start=clip.source_start,
        source_end=left_words[-1].end,
        false_start=True,
    )
    right = _clip_slice(
        clip,
        right_words,
        source_start=right_words[0].start,
        source_end=clip.source_end,
        false_start=False,
    )
    return [left, *_split_clip_at_restarts(right)]


def _reindex_clips(clips: list[ClipItem], stem: str) -> list[ClipItem]:
    return [
        clip.model_copy(update={"id": f"{stem}_seg_{index:03d}", "index": index})
        for index, clip in enumerate(clips)
    ]


def split_restart_clips(clips: list[ClipItem], stem: str) -> list[ClipItem]:
    split: list[ClipItem] = []
    for clip in clips:
        split.extend(_split_clip_at_restarts(clip))
    return _reindex_clips(split, stem)


def _groups_from_clips(clips: list[ClipItem]) -> list[ClipGroup]:
    members: dict[str, list[ClipItem]] = {}
    for clip in clips:
        members.setdefault(clip.group_id, []).append(clip)

    groups: list[ClipGroup] = []
    for gid, group_clips in members.items():
        longest = max(group_clips, key=lambda item: len(item.text))
        groups.append(
            ClipGroup(
                id=gid,
                label=longest.text[:48],
                clip_ids=[item.id for item in group_clips],
            )
        )
    return groups


def build_segment_clips(
    stem: str,
    segments: list[Segment],
    words: list[Word],
    *,
    similarity_threshold: float | None = None,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> tuple[list[ClipItem], list[ClipGroup]]:
    raw_clips: list[ClipItem] = []
    total = len(segments)

    for index, segment in enumerate(segments):
        clip_id = f"{stem}_seg_{index:03d}"
        seg_words = words_in_segment(words, segment)
        text = " ".join(w.text for w in seg_words).strip()
        duration = segment.source_end - segment.source_start

        item = ClipItem(
            id=clip_id,
            index=index,
            source_start=segment.source_start,
            source_end=segment.source_end,
            duration=duration,
            text=text or f"Segment {index + 1}",
            group_id="pending",
            words=[WordTiming(text=w.text, start=w.start, end=w.end) for w in seg_words],
        )
        raw_clips.append(item)

        if on_progress:
            on_progress(index + 1, total, f"Building segment {index + 1}/{total}")

    raw_clips = merge_continuation_clips(raw_clips, stem)
    clip_text_pairs = [(clip.id, clip.text) for clip in raw_clips]
    group_map = group_clips_by_text(
        clip_text_pairs,
        threshold=similarity_threshold,
    )
    for clip in raw_clips:
        clip.group_id = group_map[clip.id]

    raw_clips = split_restart_clips(raw_clips, stem)
    return raw_clips, _groups_from_clips(raw_clips)
