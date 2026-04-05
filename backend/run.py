"""Simple local entrypoint for running the FastAPI backend."""

from __future__ import annotations

import os

import uvicorn

from app.settings import load_backend_env


def main() -> None:
    """Run the FastAPI backend with a small set of environment overrides."""

    load_backend_env()

    host = os.getenv("AGENTDOWN_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("AGENTDOWN_BACKEND_PORT", "8000"))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
    )


if __name__ == "__main__":
    main()
