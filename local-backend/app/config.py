import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


class Settings:
    # Vertex AI via Application Default Credentials (gcloud auth application-default login).
    google_cloud_project: str = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    google_cloud_location: str = os.getenv("GOOGLE_CLOUD_LOCATION", "global").strip()
    use_vertex: bool = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "true").lower() in ("1", "true", "yes")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    data_dir: Path = (ROOT / os.getenv("DATA_DIR", "./data")).resolve()
    cors_origins: list[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    max_upload_bytes: int = 20 * 1024 * 1024


settings = Settings()


def ai_backend() -> str:
    if settings.use_vertex and settings.google_cloud_project:
        return "vertex"
    if settings.gemini_api_key:
        return "gemini-api-key"
    return "none"
settings.data_dir.mkdir(parents=True, exist_ok=True)
