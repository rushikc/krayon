from pydantic import BaseModel, ConfigDict, Field


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


class ToolStatus(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    ffmpeg: bool
    ffprobe: bool
    whisper_ready: bool
    whisper_model: str


class MediaFileInfo(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    id: str
    path: str
    name: str
    size: int
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    fps: float | None = None
    needs_proxy: bool = False
    proxy_ready: bool = False


class FolderScanRequest(BaseModel):
    path: str


class FolderScanResponse(BaseModel):
    path: str
    files: list[MediaFileInfo]


class WordTiming(BaseModel):
    text: str
    start: float
    end: float


class SourceSegment(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    source_start: float
    source_end: float


class SilenceOptions(BaseModel):
    silence_threshold: float = Field(default=0.4, alias="silenceThreshold")
    pad: float = 0.05
    language: str | None = "en"
    threads: int = 4

    model_config = {"populate_by_name": True}


class SilenceAnalyzeRequest(BaseModel):
    path: str
    options: SilenceOptions = Field(default_factory=SilenceOptions)


class SilenceAnalysis(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    source_duration: float
    fps: float
    segments: list[SourceSegment]
    removed_seconds: float
    words: list[WordTiming]


class ClipItem(BaseModel):
    id: str
    index: int
    path: str | None = None
    source_start: float = Field(alias="sourceStart")
    source_end: float = Field(alias="sourceEnd")
    duration: float
    text: str
    group_id: str = Field(alias="groupId")

    model_config = {"populate_by_name": True}


class ClipGroup(BaseModel):
    id: str
    label: str
    clip_ids: list[str] = Field(alias="clipIds")

    model_config = {"populate_by_name": True}


class ClipsGenerateRequest(BaseModel):
    path: str
    options: SilenceOptions = Field(default_factory=SilenceOptions)
    similarity_threshold: float = Field(default=0.65, alias="similarityThreshold")

    model_config = {"populate_by_name": True}


class ClipsGenerateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    source_path: str
    groups: list[ClipGroup]
    clips: list[ClipItem]


class JobProgress(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    job_id: str
    phase: str
    progress: float
    step_progress: float = 0.0
    message: str


class EditorVersionSummary(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    version_id: str
    created_at: str
    label: str
    clip_count: int
    removed_seconds: float
    options: SilenceOptions


class EditorStateIndex(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    media_id: str
    source_path: str
    active_version_id: str
    versions: list[EditorVersionSummary]


class EditorStateManifest(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    version_id: str
    created_at: str
    media_id: str
    source_path: str
    options: SilenceOptions
    similarity_threshold: float
    analysis: SilenceAnalysis
    clips: list[ClipItem]
    groups: list[ClipGroup]
    clip_count: int
    removed_seconds: float
    clips_dir: str | None = None


class EditorStateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    exists: bool = True
    index: EditorStateIndex
    active_version: EditorStateManifest


class SetActiveVersionRequest(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True)

    version_id: str
