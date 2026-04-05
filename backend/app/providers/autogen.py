"""AutoGen SSE provider backed by a real DeepSeek agent."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from app.live_weather import lookup_live_weather
from app.providers.base import (
    ProviderContext,
    build_autogen_model_info,
    build_openai_compatible_base_url,
    serialize_payload,
)


async def stream_autogen_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real AutoGen assistant and forward raw `run_stream()` payloads."""

    try:
        from autogen_agentchat.agents import AssistantAgent
        from autogen_ext.models.openai import OpenAIChatCompletionClient

        def lookup_weather(city: str) -> dict[str, Any]:
            """Return live weather data from the public weather tool."""

            return lookup_live_weather(city)

        model_client = OpenAIChatCompletionClient(
            model=context.settings.deepseek_model,
            api_key=context.settings.deepseek_api_key,
            base_url=build_openai_compatible_base_url(context.settings.deepseek_base_url),
            model_info=build_autogen_model_info(),
            temperature=0,
        )
        agent = AssistantAgent(
            "assistant",
            model_client=model_client,
            tools=[lookup_weather],
            model_client_stream=True,
            system_message=(
                "You are a weather assistant. "
                "When the user asks about weather, you must call the lookup_weather tool before answering. "
                "The tool returns live weather data from a public API."
            ),
        )

        async for event in agent.run_stream(task=context.request.message):  # type: ignore[misc]
            payload = serialize_payload(event)
            event_type = event.__class__.__name__

            if isinstance(payload, dict):
                payload.setdefault("type", event_type)
                yield payload
                continue

            yield {
                "type": event_type,
                "content": payload,
            }
    except Exception as error:
        yield {
            "type": "ErrorEvent",
            "message": str(error),
        }
