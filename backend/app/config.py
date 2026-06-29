from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    data_dir: Path = DATA_DIR
    db_url: str = "postgresql://coheremix:coheremix@localhost:5432/coheremix"
    storage_dir: Path = DATA_DIR / "storage"
    demo_dir: Path = Path(__file__).resolve().parent.parent / "demo"
    target_lufs: float = -14.0
    analysis_sample_rate: int = 48000
    max_upload_bytes: int = 100 * 1024 * 1024
    max_duration_s: float = 15 * 60
    ttl_hours: float = 24.0


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.storage_dir.mkdir(parents=True, exist_ok=True)
    return s
