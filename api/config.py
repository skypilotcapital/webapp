"""
Application settings — loaded once from environment variables / .env file.

All configuration lives here. Nothing else in the codebase should read
os.environ directly.
"""

import json
import pathlib
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always look for .env in the api/ directory, regardless of where
# uvicorn is launched from (monorepo root vs api/ subdirectory).
_ENV_FILE = pathlib.Path(__file__).parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), env_file_encoding="utf-8")

    # PostgreSQL connection
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str
    db_user: str
    db_password: str

    # Reports directory — absolute path to the folder containing report subdirectories.
    # On the droplet: /root/Main/Reports
    # Leave blank for local dev (reports list will return empty gracefully).
    reports_dir: str = ""

    # CORS — JSON-encoded list of allowed origins, e.g. '["https://app.vercel.app"]'
    cors_origins: List[str] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache
def get_settings() -> Settings:
    """Return the singleton Settings instance (cached after first call)."""
    return Settings()
