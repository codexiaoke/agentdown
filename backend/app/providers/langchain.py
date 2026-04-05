"""LangChain / LangGraph SSE provider backed by a real DeepSeek agent."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from app.live_weather import lookup_live_weather
from app.providers.base import ProviderContext, serialize_payload


async def stream_langchain_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real LangChain agent and forward raw `astream_events()` payloads."""

    try:
        from langchain.agents import create_agent
        from langchain.tools import tool
        from langchain_deepseek import ChatDeepSeek

        @tool
        def lookup_weather(city: str) -> dict[str, Any]:
            """Return live weather data from the public weather tool."""

            return lookup_live_weather(city)

        agent = create_agent(
            model=ChatDeepSeek(
                model=context.settings.deepseek_model,
                api_key=context.settings.deepseek_api_key,
                api_base=context.settings.deepseek_base_url,
                temperature=0,
                max_retries=2,
            ),
            tools=[lookup_weather],
            system_prompt=(
                "You are a weather assistant. "
                "When the user asks about weather, you must call the lookup_weather tool before answering. "
                "The tool returns live weather data from a public API."
            ),
        )

        async for event in agent.astream_events(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": context.request.message,
                    }
                ]
            },
            version="v2",
        ):
            payload = serialize_payload(event)

            if isinstance(payload, dict):
                yield payload
                continue

            yield {
                "event": "langchain.event",
                "data": payload,
            }
    except Exception as error:
        yield {
            "event": "error",
            "name": "langchain",
            "data": {
                "message": str(error),
            },
        }
