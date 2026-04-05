"""Provider registry for the FastAPI backend."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import TypeAlias

from app.providers.agno import stream_agno_events
from app.providers.autogen import stream_autogen_events
from app.providers.base import ProviderContext
from app.providers.crewai import stream_crewai_events
from app.providers.langchain import stream_langchain_events


ProviderStreamFactory: TypeAlias = Callable[[ProviderContext], AsyncIterator[dict[str, object]]]


PROVIDER_REGISTRY: dict[str, ProviderStreamFactory] = {
    "agno": stream_agno_events,
    "langchain": stream_langchain_events,
    "autogen": stream_autogen_events,
    "crewai": stream_crewai_events,
}
