"""LangChain / LangGraph SSE provider backed by a real DeepSeek agent."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from app.live_weather import lookup_live_weather
from app.providers.base import ProviderContext, serialize_payload

_langchain_checkpointer: Any | None = None


def is_langchain_hitl_mode(mode: str | None) -> bool:
    """Return whether the current request should enable LangChain HITL middleware."""

    if mode is None:
        return False

    return mode.strip().lower() == "hitl"


def get_langchain_checkpointer() -> Any:
    """Return a process-wide LangGraph checkpointer used for HITL resume."""

    global _langchain_checkpointer

    if _langchain_checkpointer is None:
        from langgraph.checkpoint.memory import InMemorySaver

        _langchain_checkpointer = InMemorySaver()

    return _langchain_checkpointer


def resolve_langchain_thread_id(context: ProviderContext) -> str:
    """Return the LangGraph thread id used for session continuity and HITL resume."""

    if context.request.session_id:
        return context.request.session_id

    return f"langchain-session-{uuid4()}"


def resolve_langchain_agent_input(context: ProviderContext) -> Any:
    """Build the concrete LangGraph input for the current request."""

    if context.request.langchain_resume is not None:
        from langgraph.types import Command

        return Command(
            resume={
                "decisions": [
                    decision.model_dump(exclude_none=True)
                    for decision in context.request.langchain_resume.decisions
                ]
            }
        )

    return {
        "messages": [
            {
                "role": "user",
                "content": context.request.message,
            }
        ]
    }


def create_langchain_agent(context: ProviderContext, *, enable_hitl: bool) -> Any:
    """Create the real LangChain agent used by the streaming endpoint."""

    from langchain.agents import create_agent
    from langchain.tools import tool
    from langchain_deepseek import ChatDeepSeek

    @tool
    def lookup_weather(city: str) -> dict[str, Any]:
        """Return live weather data from the public weather tool."""

        return lookup_live_weather(city)

    middleware: list[Any] = []

    if enable_hitl:
        from langchain.agents.middleware import HumanInTheLoopMiddleware

        middleware.append(
            HumanInTheLoopMiddleware(
                interrupt_on={
                    "lookup_weather": True
                }
            )
        )

    return create_agent(
        model=ChatDeepSeek(
            model=context.settings.deepseek_model,
            api_key=context.settings.deepseek_api_key,
            api_base=context.settings.deepseek_base_url,
            temperature=0,
            max_retries=2,
        ),
        tools=[lookup_weather],
        middleware=middleware,
        checkpointer=get_langchain_checkpointer(),
        system_prompt=(
            "You are a weather assistant. "
            "When the user asks about weather, you must call the lookup_weather tool before answering. "
            "The tool returns live weather data from a public API."
        ),
    )


async def stream_langchain_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real LangChain agent and forward raw `astream_events()` payloads."""

    try:
        if context.request.langchain_resume is not None and not context.request.session_id:
            raise ValueError("LangChain HITL resume requires `session_id`.")

        enable_hitl = (
            is_langchain_hitl_mode(context.request.mode)
            or context.request.langchain_resume is not None
        )
        thread_id = resolve_langchain_thread_id(context)
        agent = create_langchain_agent(context, enable_hitl=enable_hitl)
        graph_input = resolve_langchain_agent_input(context)
        config = {
            "configurable": {
                "thread_id": thread_id,
            }
        }

        async for event in agent.astream_events(
            graph_input,
            config=config,
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
