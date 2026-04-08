"""CrewAI SSE provider backed by a real DeepSeek crew."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from app.live_weather import lookup_live_weather
from app.providers.base import (
    ProviderContext,
    build_crewai_model_name,
    build_openai_compatible_base_url,
    pretty_json,
    serialize_payload,
)


async def stream_crewai_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real CrewAI crew and forward raw streaming chunks over SSE."""

    session_id = context.request.session_id or f"crewai-session-{uuid4()}"

    def attach_session_id(payload: dict[str, Any]) -> dict[str, Any]:
        """Ensure every emitted CrewAI packet carries a stable session id."""

        return {
            "session_id": session_id,
            **payload,
        }

    try:
        from crewai import Agent, Crew, LLM, Process, Task
        from crewai.tools import tool

        @tool("lookup_weather")
        def lookup_weather(city: str) -> str:
            """Return live weather data as a JSON string for the CrewAI tool layer."""

            return pretty_json(lookup_live_weather(city))

        llm = LLM(
            model=build_crewai_model_name(context.settings.deepseek_model),
            api_key=context.settings.deepseek_api_key,
            base_url=build_openai_compatible_base_url(context.settings.deepseek_base_url),
            temperature=0,
        )
        agent = Agent(
            role="Weather Researcher",
            goal="Answer the user's weather question with tool-backed data.",
            backstory=(
                "You are a careful weather assistant. "
                "You must call the lookup_weather tool before writing the final answer. "
                "The tool returns live weather data from a public API."
            ),
            tools=[lookup_weather],
            llm=llm,
            allow_delegation=False,
            verbose=False,
        )
        task = Task(
            description=f"用户请求：{context.request.message}",
            expected_output="一个简洁的中文天气总结，说明天气、温度、湿度和风向。",
            agent=agent,
        )
        crew = Crew(
            agents=[agent],
            tasks=[task],
            process=Process.sequential,
            stream=True,
            verbose=False,
        )

        kickoff = crew.kickoff_async if hasattr(crew, "kickoff_async") else crew.akickoff
        streaming = await kickoff()

        async for chunk in streaming:
            payload = serialize_payload(chunk)

            if isinstance(payload, dict):
                yield attach_session_id(payload)
                continue

            yield attach_session_id({
                "content": payload,
            })

        result = getattr(streaming, "result", None)

        if result is not None:
            payload = serialize_payload(result)

            if isinstance(payload, dict):
                payload.setdefault("type", result.__class__.__name__)
                yield attach_session_id(payload)
            else:
                yield attach_session_id({
                    "type": result.__class__.__name__,
                    "content": payload,
                })
    except Exception as error:
        yield attach_session_id({
            "type": "ErrorEvent",
            "message": str(error),
        })
