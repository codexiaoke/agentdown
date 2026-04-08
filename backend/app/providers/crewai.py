"""CrewAI SSE provider backed by real Crew streaming."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
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


def resolve_crewai_session_id(context: ProviderContext) -> str:
    """Return the stable CrewAI session id used for one real CrewAI run."""

    if context.request.session_id:
        return context.request.session_id

    return f"crewai-session-{uuid4()}"
def read_crewai_string(value: Any) -> str | None:
    """Read a non-empty string from an unknown runtime value."""

    if isinstance(value, str) and value:
        return value

    return None


def read_crewai_dict(value: Any) -> dict[str, Any] | None:
    """Read a plain object from an unknown runtime value."""

    if isinstance(value, dict):
        return value

    return None


def attach_crewai_session_id(payload: dict[str, Any], session_id: str) -> dict[str, Any]:
    """Attach the stable session id to a serialized CrewAI SSE payload."""

    payload.setdefault("session_id", session_id)
    return payload


def resolve_crewai_payload_run_id(payload: dict[str, Any]) -> str | None:
    """Extract the most stable run id from a CrewAI payload."""

    return (
        read_crewai_string(payload.get("run_id"))
        or read_crewai_string(payload.get("agent_id"))
        or read_crewai_string(payload.get("task_id"))
    )


def resolve_crewai_payload_run_title(payload: dict[str, Any]) -> str | None:
    """Extract the most readable run title from a CrewAI payload."""

    direct_title = read_crewai_string(payload.get("agent_role"))

    if direct_title:
        return direct_title

    tasks_output = payload.get("tasks_output")

    if not isinstance(tasks_output, list):
        return None

    for item in tasks_output:
        task_output = read_crewai_dict(item)
        task_agent = read_crewai_string(task_output.get("agent")) if task_output else None

        if task_agent:
            return task_agent

    return None


def extract_crewai_final_output(payload: dict[str, Any] | None) -> str:
    """Extract the final assistant text from a serialized `CrewOutput` payload."""

    if payload is None:
        return ""

    raw_output = read_crewai_string(payload.get("raw"))

    if raw_output:
        return raw_output

    tasks_output = payload.get("tasks_output")

    if not isinstance(tasks_output, list):
        return ""

    for item in reversed(tasks_output):
        task_output = read_crewai_dict(item)

        if not task_output:
            continue

        task_raw = read_crewai_string(task_output.get("raw"))

        if task_raw:
            return task_raw

        messages = task_output.get("messages")

        if not isinstance(messages, list):
            continue

        for message in reversed(messages):
            message_payload = read_crewai_dict(message)

            if not message_payload:
                continue

            if read_crewai_string(message_payload.get("role")) != "assistant":
                continue

            content = read_crewai_string(message_payload.get("content"))

            if content:
                return content

    return ""


async def stream_real_crewai_run(
    context: ProviderContext,
    session_id: str,
    emit: Callable[[dict[str, Any]], Awaitable[None]],
) -> dict[str, Any]:
    """Run a real CrewAI crew, emit raw stream packets, and return final metadata."""

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
    final_payload: dict[str, Any] | None = None
    run_id: str | None = None
    run_title: str | None = None

    async for chunk in streaming:
        payload = serialize_payload(chunk)

        if isinstance(payload, dict):
            final_payload = payload if payload.get("type") == "CrewOutput" else final_payload
            run_id = run_id or resolve_crewai_payload_run_id(payload)
            run_title = run_title or resolve_crewai_payload_run_title(payload)
            await emit(attach_crewai_session_id(payload, session_id))
            continue

        await emit(
            attach_crewai_session_id(
                {
                    "content": payload,
                },
                session_id,
            )
        )

    result = getattr(streaming, "result", None)

    if result is not None:
        payload = serialize_payload(result)

        if isinstance(payload, dict):
            payload.setdefault("type", result.__class__.__name__)
            final_payload = payload
            run_id = run_id or resolve_crewai_payload_run_id(payload)
            run_title = run_title or resolve_crewai_payload_run_title(payload)
            await emit(attach_crewai_session_id(payload, session_id))
        else:
            fallback_payload = attach_crewai_session_id(
                {
                    "type": result.__class__.__name__,
                    "content": payload,
                },
                session_id,
            )
            await emit(fallback_payload)

    final_output = extract_crewai_final_output(final_payload)

    return {
        "run_id": run_id,
        "run_title": run_title,
        "final_output": final_output,
        "final_payload": final_payload,
    }


async def drain_crewai_packet_queue(
    queue: asyncio.Queue[dict[str, Any]],
    task: "asyncio.Task[Any]",
) -> AsyncIterator[dict[str, Any]]:
    """Drain streamed CrewAI packets while the backing Flow task is still running."""

    while True:
        if task.done() and queue.empty():
            break

        try:
            payload = await asyncio.wait_for(queue.get(), timeout=0.05)
        except asyncio.TimeoutError:
            continue

        yield payload


async def stream_standard_crewai_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run the standard CrewAI streaming path without human feedback."""

    session_id = resolve_crewai_session_id(context)
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def buffered_emit(payload: dict[str, Any]) -> None:
        """Push one serialized CrewAI packet into the outer SSE queue."""

        await queue.put(payload)

    task = asyncio.create_task(
        stream_real_crewai_run(
            context,
            session_id=session_id,
            emit=buffered_emit,
        )
    )

    async for payload in drain_crewai_packet_queue(queue, task):
        yield payload

    await task


async def stream_crewai_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real CrewAI stream over the shared SSE endpoint."""

    session_id = resolve_crewai_session_id(context)

    try:
        async for payload in stream_standard_crewai_events(context):
            yield payload
    except Exception as error:
        yield {
            "type": "ErrorEvent",
            "message": str(error),
            "session_id": session_id,
        }
