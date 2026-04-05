"""Base types and shared helpers for provider streaming endpoints."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

from app.models import ProviderDescriptor, StreamRequest
from app.settings import BackendSettings


@dataclass(slots=True)
class ProviderContext:
    """Execution context passed to each provider stream."""

    request: StreamRequest
    settings: BackendSettings


def create_provider_descriptors() -> list[ProviderDescriptor]:
    """Return the provider endpoints currently exposed by the FastAPI app."""

    return [
        ProviderDescriptor(
            id="agno",
            path="/api/stream/agno",
            label="Agno",
            note="基于 DeepSeek 的真实 Agno Agent SSE。",
        ),
        ProviderDescriptor(
            id="langchain",
            path="/api/stream/langchain",
            label="LangChain / LangGraph",
            note="基于 DeepSeek 的真实 LangChain Agent SSE。",
        ),
        ProviderDescriptor(
            id="autogen",
            path="/api/stream/autogen",
            label="AutoGen",
            note="基于 DeepSeek 的真实 AutoGen Agent SSE。",
        ),
        ProviderDescriptor(
            id="crewai",
            path="/api/stream/crewai",
            label="CrewAI",
            note="基于 DeepSeek 的真实 CrewAI 流式执行。",
        ),
    ]


def can_use_deepseek_backed_framework(settings: BackendSettings) -> bool:
    """Return whether real framework execution can use the configured DeepSeek key."""

    return bool(settings.deepseek_api_key)


def build_openai_compatible_base_url(base_url: str) -> str:
    """Return a DeepSeek base URL that is safe for OpenAI-compatible SDK clients."""

    normalized = base_url.strip().rstrip("/")

    if normalized.endswith("/v1"):
        return normalized

    return f"{normalized}/v1"


def build_autogen_model_capabilities() -> dict[str, bool]:
    """Return conservative model capabilities for DeepSeek chat models in AutoGen."""

    return {
        "vision": False,
        "function_calling": True,
        "json_output": False,
    }


def build_autogen_model_info() -> dict[str, Any]:
    """Return the extended model info required by AutoGen for custom endpoints."""

    capabilities = build_autogen_model_capabilities()
    return {
        **capabilities,
        "family": "unknown",
        "structured_output": False,
    }


def build_crewai_model_name(model_name: str) -> str:
    """Return the CrewAI model identifier used for DeepSeek OpenAI-compatible calls."""

    return model_name


def serialize_payload(value: Any) -> Any:
    """Convert framework objects into JSON-safe values for SSE transport."""

    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, dict):
        return {str(key): serialize_payload(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [serialize_payload(item) for item in value]

    if hasattr(value, "model_dump"):
        return serialize_payload(value.model_dump())  # type: ignore[no-any-return]

    if hasattr(value, "dict"):
        return serialize_payload(value.dict())  # type: ignore[no-any-return]

    if hasattr(value, "__dict__"):
        return serialize_payload(vars(value))

    return str(value)


def pretty_json(data: dict[str, Any]) -> str:
    """Return a readable JSON string for providers that want string tool output."""

    return json.dumps(data, ensure_ascii=False, indent=2)
