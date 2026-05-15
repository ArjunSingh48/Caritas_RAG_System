from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    upload_dir: str = "uploads"
    max_upload_size_mb: int = 50
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_url: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    SQL_MODEL: str = "gemma4:e4b"  # if have compute: gemma4:26b or gemma4:31b
    ANSWER_MODEL: str = "gemma4:e4b"  # if have compute: gemma4:26b or gemma4:31b
    GENERATE_COLUMN_DESCRIPTION: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
