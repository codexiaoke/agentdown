"""AutoGen SSE provider backed by a real DeepSeek team and official handoff HITL."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.autogen_state import AutoGenPausedSessionRecord, get_autogen_paused_session_store
from app.live_weather import lookup_live_weather
from app.providers.base import (
    ProviderContext,
    build_autogen_model_info,
    build_openai_compatible_base_url,
    serialize_payload,
)


def is_autogen_hitl_mode(mode: str | None) -> bool:
    """Return whether the current request should enable AutoGen handoff HITL."""

    if mode is None:
        return False

    return mode.strip().lower() == "hitl"


def resolve_autogen_session_id(context: ProviderContext) -> str:
    """Return the stable AutoGen session id used for pause/resume recovery."""

    if context.request.session_id:
        return context.request.session_id

    return f"autogen-session-{uuid4()}"


def build_autogen_system_message(enable_hitl: bool) -> str:
    """Return the AutoGen system prompt for normal or HITL execution."""

    if enable_hitl:
        return (
            "You are a weather assistant. "
            "When the user asks about weather, do not call lookup_weather immediately. "
            "First hand off to human and wait for their reply. "
            "After the human replies, call lookup_weather, then provide a concise final answer in markdown."
        )

    return (
        "You are a weather assistant. "
        "When the user asks about weather, you must call lookup_weather before answering. "
        "After the tool returns, provide a concise final answer in markdown."
    )


def create_autogen_team(context: ProviderContext, *, enable_hitl: bool) -> Any:
    """Create the real AutoGen team used by the streaming endpoint."""

    from autogen_agentchat.agents import AssistantAgent
    from autogen_agentchat.base import Handoff
    from autogen_agentchat.conditions import HandoffTermination
    from autogen_agentchat.teams import RoundRobinGroupChat
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
        max_retries=2,
        parallel_tool_calls=False,
    )

    handoffs = None
    termination_condition = None

    if enable_hitl:
        handoffs = [
            Handoff(
                target="human",
                description="Ask the human to confirm or guide the next weather lookup step.",
                message="请确认是否继续执行天气查询，并补充需要的人类指令。",
            )
        ]
        termination_condition = HandoffTermination("human")

    assistant = AssistantAgent(
        "assistant",
        model_client=model_client,
        tools=[lookup_weather],
        handoffs=handoffs,
        model_client_stream=True,
        reflect_on_tool_use=True,
        system_message=build_autogen_system_message(enable_hitl),
    )

    return RoundRobinGroupChat(
        [assistant],
        termination_condition=termination_condition,
        max_turns=1,
    )


def create_autogen_resume_input(context: ProviderContext) -> str:
    """Return the human reply content used to continue a paused AutoGen handoff."""

    resume = context.request.autogen_resume

    if resume is None:
        raise ValueError("AutoGen resume payload is missing.")

    content = resume.content.strip()

    if not content:
        raise ValueError("AutoGen resume content cannot be empty.")

    return content


def is_autogen_handoff_stop_reason(stop_reason: Any) -> bool:
    """Return whether the current AutoGen task stopped because of a human handoff."""

    if not isinstance(stop_reason, str):
        return False

    normalized = stop_reason.strip().lower()
    return normalized.startswith("handoff to human")


def attach_autogen_session_id(payload: dict[str, Any], session_id: str) -> dict[str, Any]:
    """Attach the current session id to a serialized AutoGen event payload."""

    payload.setdefault("session_id", session_id)
    return payload


async def save_autogen_paused_session(
    context: ProviderContext,
    session_id: str,
    team: Any,
) -> None:
    """Persist the current AutoGen team state for later HITL resume."""

    paused_session_store = get_autogen_paused_session_store(context.settings)
    serialized_state = serialize_payload(await team.save_state())

    if not isinstance(serialized_state, dict):
        raise ValueError("AutoGen team state must serialize into a dictionary payload.")

    await paused_session_store.save(
        AutoGenPausedSessionRecord(
            session_id=session_id,
            status="paused",
            team_state=serialized_state,
            request_payload=context.request.model_dump(exclude_none=True),
            saved_at=datetime.now(timezone.utc).isoformat(),
        )
    )


async def load_autogen_paused_session(
    context: ProviderContext,
    session_id: str,
    team: Any,
) -> None:
    """Load a previously paused AutoGen team state into the new team instance."""

    paused_session_store = get_autogen_paused_session_store(context.settings)
    paused_record = await paused_session_store.load(session_id)

    if paused_record is None:
        raise ValueError(f"Paused AutoGen session not found: {session_id}")

    await team.load_state(paused_record.team_state)


async def clear_autogen_paused_session(
    context: ProviderContext,
    session_id: str,
) -> None:
    """Delete the paused AutoGen session record when it is no longer needed."""

    paused_session_store = get_autogen_paused_session_store(context.settings)
    await paused_session_store.delete(session_id)


async def stream_autogen_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real AutoGen team and forward raw `run_stream()` payloads."""

    try:
        if context.request.autogen_resume is not None and not context.request.session_id:
            raise ValueError("AutoGen HITL resume requires `session_id`.")

        enable_hitl = (
            is_autogen_hitl_mode(context.request.mode)
            or context.request.autogen_resume is not None
        )
        session_id = resolve_autogen_session_id(context)
        team = create_autogen_team(context, enable_hitl=enable_hitl)

        if context.request.autogen_resume is not None:
            await load_autogen_paused_session(context, session_id, team)
            task = create_autogen_resume_input(context)
        else:
            await clear_autogen_paused_session(context, session_id)
            task = context.request.message

        paused = False

        async for event in team.run_stream(task=task):  # type: ignore[misc]
            payload = serialize_payload(event)
            event_type = event.__class__.__name__

            if event_type == "HandoffMessage":
                paused = True
            elif event_type == "TaskResult" and isinstance(payload, dict):
                paused = paused or is_autogen_handoff_stop_reason(payload.get("stop_reason"))

            if isinstance(payload, dict):
                payload.setdefault("type", event_type)
                yield attach_autogen_session_id(payload, session_id)
                continue

            yield {
                "type": event_type,
                "session_id": session_id,
                "content": payload,
            }

        if enable_hitl and paused:
            await save_autogen_paused_session(context, session_id, team)
        else:
            await clear_autogen_paused_session(context, session_id)
    except Exception as error:
        yield {
            "type": "ErrorEvent",
            "message": str(error),
        }
