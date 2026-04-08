"""Application settings helpers for the FastAPI backend."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(slots=True)
class BackendSettings:
    """Runtime settings loaded from environment variables."""

    deepseek_api_key: str | None
    deepseek_model: str
    deepseek_base_url: str
    cors_origins: list[str]
    agno_paused_run_store: str
    redis_url: str | None
    agno_paused_run_ttl_seconds: int
    autogen_paused_run_store: str
    autogen_paused_run_ttl_seconds: int


def _backend_dir() -> Path:
    """Return the absolute backend directory that contains the `.env` file."""

    return Path(__file__).resolve().parent.parent


def _parse_dotenv_value(raw_value: str) -> str:
    """Parse a single dotenv value and remove matching outer quotes."""

    value = raw_value.strip()

    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]

    return value


def load_backend_env() -> Path:
    """Load `backend/.env` into `os.environ` without overwriting existing variables."""

    env_path = _backend_dir() / ".env"

    if not env_path.exists():
        return env_path

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, raw_value = line.split("=", 1)
        env_key = key.strip()

        if not env_key or env_key in os.environ:
            continue

        os.environ[env_key] = _parse_dotenv_value(raw_value)

    return env_path


def _parse_cors_origins(raw_value: str | None) -> list[str]:
    """Parse a comma-separated CORS origin string into a clean list."""

    if not raw_value:
        return [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ]

    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


def _parse_deepseek_base_url(raw_value: str | None) -> str:
    """Normalize the configured DeepSeek base URL and provide the official default."""

    if not raw_value:
        return "https://api.deepseek.com"

    normalized = raw_value.strip().rstrip("/")
    return normalized or "https://api.deepseek.com"


def _parse_agno_paused_run_store(raw_value: str | None) -> str:
    """Normalize the configured Agno paused run store backend."""

    if not raw_value:
        return "memory"

    normalized = raw_value.strip().lower()
    return normalized or "memory"


def _parse_positive_int(raw_value: str | None, default_value: int) -> int:
    """Parse a positive integer environment value and fall back safely."""

    if not raw_value:
        return default_value

    try:
        parsed = int(raw_value)
    except ValueError:
        return default_value

    return parsed if parsed > 0 else default_value


def load_settings() -> BackendSettings:
    """Load backend settings from the current process environment."""

    load_backend_env()

    redis_url = os.getenv("AGENTDOWN_REDIS_URL")
    agno_paused_run_store = os.getenv("AGENTDOWN_AGNO_PAUSED_RUN_STORE")
    autogen_paused_run_store = os.getenv("AGENTDOWN_AUTOGEN_PAUSED_RUN_STORE")
    if not agno_paused_run_store and redis_url:
        agno_paused_run_store = "redis"

    if not autogen_paused_run_store and redis_url:
        autogen_paused_run_store = "redis"

    return BackendSettings(
        deepseek_api_key=os.getenv("DEEPSEEK_API_KEY"),
        deepseek_model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        deepseek_base_url=_parse_deepseek_base_url(os.getenv("DEEPSEEK_BASE_URL")),
        cors_origins=_parse_cors_origins(os.getenv("AGENTDOWN_CORS_ORIGINS")),
        agno_paused_run_store=_parse_agno_paused_run_store(agno_paused_run_store),
        redis_url=redis_url,
        agno_paused_run_ttl_seconds=_parse_positive_int(
            os.getenv("AGENTDOWN_AGNO_PAUSED_RUN_TTL_SECONDS"),
            3600,
        ),
        autogen_paused_run_store=_parse_agno_paused_run_store(autogen_paused_run_store),
        autogen_paused_run_ttl_seconds=_parse_positive_int(
            os.getenv("AGENTDOWN_AUTOGEN_PAUSED_RUN_TTL_SECONDS"),
            3600,
        ),
    )
