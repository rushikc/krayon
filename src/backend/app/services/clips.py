from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from difflib import SequenceMatcher
from pathlib import Path

from app.config import settings
from app.schemas import ClipGroup, ClipItem
from app.services.ffmpeg import probe_media, run_command
from app.services.segments import Segment, Word


FILLER_WORDS = {"um", "uh", "like", "you", "know", "so", "well", "okay", "ok", "ah"}


def normalize_text(text: str) -> str:
    lowered = text.lower()
    cleaned = re.sub(r"[^\w\s]", " ", lowered)
    tokens = [t for t in cleaned.split() if t and t not in FILLER_WORDS]
    return " ".join(tokens)


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def group_clips_by_text(
    clip_texts: list[tuple[str, str]],
    *,
    threshold: float | None = None,
) -> dict[str, str]:
    limit = threshold if threshold is not None else settings.clip_similarity_threshold
    groups: list[tuple[str, str, str]] = []
    mapping: dict[str, str] = {}

    for clip_id, text in clip_texts:
        norm = normalize_text(text)
        best_group: str | None = None
        best_score = 0.0

        for group_id, _label, group_norm in groups:
            score = similarity(norm, group_norm)
            if score >= limit and score > best_score:
                best_score = score
                best_group = group_id

        if best_group is None:
            group_id = str(uuid.uuid4())[:8]
            label = text.strip()[:48] or f"Take {len(groups) + 1}"
            groups.append((group_id, label, norm))
            mapping[clip_id] = group_id
        else:
            mapping[clip_id] = best_group

    return mapping


def words_in_segment(words: list[Word], seg: Segment) -> list[Word]:
    return [w for w in words if w.end > seg.source_start and w.start < seg.source_end]


def segment_text(words: list[Word], seg: Segment) -> str:
    return " ".join(w.text for w in words_in_segment(words, seg)).strip()


def _cut_clip_cmd(input_path: Path, segment: Segment, clip_path: Path, *, cut_mode: str) -> list[str]:
    """Frame-accurate cut: -ss after -i, end bound via -to."""
    start = f"{segment.source_start:.3f}"
    end = f"{segment.source_end:.3f}"
    if cut_mode == "copy":
        return [
            settings.ffmpeg,
            "-y",
            "-i",
            str(input_path),
            "-ss",
            start,
            "-to",
            end,
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            "-movflags",
            "+faststart",
            str(clip_path),
        ]
    return [
        settings.ffmpeg,
        "-y",
        "-i",
        str(input_path),
        "-ss",
        start,
        "-to",
        end,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(clip_path),
    ]


def extract_segment_clips(
    input_path: Path,
    segments: list[Segment],
    words: list[Word],
    *,
    out_dir: Path,
    cut_mode: str = "reencode",
    on_progress: Callable[[int, int, str], None] | None = None,
) -> tuple[list[ClipItem], list[ClipGroup]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = input_path.stem

    clip_text_pairs: list[tuple[str, str]] = []
    raw_clips: list[ClipItem] = []
    total = len(segments)

    for index, segment in enumerate(segments):
        clip_id = f"{stem}_seg_{index:03d}"
        clip_path = out_dir / f"seg_{index:03d}.mp4"
        text = segment_text(words, segment)

        if not clip_path.exists():
            run_command(_cut_clip_cmd(input_path, segment, clip_path, cut_mode=cut_mode))

        probe = probe_media(clip_path)
        duration = probe.duration if probe.duration else segment.duration

        item = ClipItem(
            id=clip_id,
            index=index,
            path=str(clip_path),
            source_start=segment.source_start,
            source_end=segment.source_end,
            duration=duration,
            text=text or f"Segment {index + 1}",
            group_id="pending",
        )
        raw_clips.append(item)
        clip_text_pairs.append((clip_id, item.text))

        if on_progress:
            on_progress(index + 1, total, f"Cutting clip {index + 1}/{total}")

    group_map = group_clips_by_text(clip_text_pairs)
    for clip in raw_clips:
        clip.group_id = group_map[clip.id]

    groups_by_id: dict[str, ClipGroup] = {}
    for clip in raw_clips:
        gid = clip.group_id
        if gid not in groups_by_id:
            groups_by_id[gid] = ClipGroup(id=gid, label=clip.text[:48], clip_ids=[])
        groups_by_id[gid].clip_ids.append(clip.id)

    return raw_clips, list(groups_by_id.values())
