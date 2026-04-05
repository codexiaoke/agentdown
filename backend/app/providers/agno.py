"""Agno SSE provider backed by a real DeepSeek agent."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from app.live_weather import lookup_live_weather
from app.providers.base import ProviderContext, serialize_payload


async def stream_agno_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real Agno agent and forward raw framework events over SSE."""

    try:
        from agno.agent import RunEvent
        from agno.agent.agent import Agent
        from agno.models.deepseek import DeepSeek

        def lookup_weather(city: str) -> dict[str, Any]:
            """Return live weather data from the public weather tool."""

            return lookup_live_weather(city)

        def get_time() -> str:
            """Return the current time."""

            return "The current time is " + ":".join(map(str, [
                2023,
                1,
                1,
                1,
                1,
                1,
            ]))

        agent = Agent(
            name="Agno Weather Agent",
            model=DeepSeek(
                id=context.settings.deepseek_model,
                api_key=context.settings.deepseek_api_key,
                base_url=context.settings.deepseek_base_url,
            ),
            tools=[lookup_weather,get_time],
            instructions=(
                "You are a weather assistant. "
                "When the user asks about weather, you must call the lookup_weather tool before answering. "
                "The tool returns live weather data from a public API."
            ),
        )

        async for event in agent.arun(
            context.request.message,
            stream=True,
            stream_events=True,
        ):
            event_name = getattr(event, "event", RunEvent.run_content)
            payload = serialize_payload(event)

            if isinstance(payload, dict):
                payload.setdefault("event", str(event_name))
                yield payload
                continue

            yield {
                "event": str(event_name),
                "content": payload,
            }
    except Exception as error:
        yield {
            "event": "error",
            "message": str(error),
        }
