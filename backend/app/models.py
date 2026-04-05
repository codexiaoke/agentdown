"""Shared request and response models for the FastAPI backend."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StreamRequest(BaseModel):
    """Common request body accepted by all real streaming endpoints."""

    message: str = Field(
        default="帮我查一下北京天气。",
        description="The user prompt passed to the agent framework.",
    )


class ProviderDescriptor(BaseModel):
    """Metadata for a provider endpoint exposed by the backend."""

    id: str
    path: str
    label: str
    note: str | None = None


class HealthResponse(BaseModel):
    """Simple health check payload for the backend root API."""

    service: str
    providers: list[ProviderDescriptor]
