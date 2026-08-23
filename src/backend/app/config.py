from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KRAYON_", env_file=".env", extra="ignore")

    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    whisper_model: str = "base"
    whisper_device: str = "auto"
    whisper_compute_type: str = "auto"
    whisper_download_root: str | None = None
    whisper_warmup_on_startup: bool = True

    proxy_size_threshold_bytes: int = 1 * 1024 * 1024 * 1024  # 1 GB
    proxy_max_height: int = 480
    proxy_fps: int = 24
    proxy_crf: int = 28

    silence_threshold: float = 0.4
    silence_pad: float = 0.05
    min_segment_seconds: float = 0.05

    clip_similarity_threshold: float = 0.82

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


settings = Settings()
