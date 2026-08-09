"""Pure AG-UI reference endpoint backed by a real DeepSeek text completion."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from app.examples.agui_a2ui_deepseek import agui_agent_session_store
from app.models import AgUiRunAgentInput
from app.providers.base import build_openai_compatible_base_url
from app.settings import BackendSettings


@dataclass(frozen=True, slots=True)
class AgUiTextChunk:
    """One model delta plus optional final metadata."""

    delta: str = ""
    model: str | None = None
    usage: dict[str, Any] | None = None


AgUiTextGenerator = Callable[
    [BackendSettings, list[dict[str, str]], str],
    AsyncIterator[AgUiTextChunk],
]


def _plain_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
    return ""


def _latest_user_text(request: AgUiRunAgentInput) -> str:
    for message in reversed(request.messages):
        if message.get("role") == "user":
            text = _plain_text(message).strip()
            if text:
                return text
    raise ValueError("Pure AG-UI request requires a user message.")


async def generate_deepseek_text(
    settings: BackendSettings,
    history: list[dict[str, str]],
    prompt: str,
) -> AsyncIterator[AgUiTextChunk]:
    """Stream a real OpenAI-compatible DeepSeek completion."""

    if not settings.deepseek_api_key:
        raise ValueError("DEEPSEEK_API_KEY is required for the real AG-UI example.")

    async with AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url=build_openai_compatible_base_url(settings.deepseek_base_url),
        max_retries=2,
        timeout=60.0,
    ) as client:
        stream = await client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[
                {
                    "role": "system",
                    "content": "你是一个简洁、可靠的中文助手。直接回答用户问题。",
                },
                *history[-12:],
                {"role": "user", "content": prompt[:8_000]},
            ],  # type: ignore[arg-type]
            temperature=0.2,
            max_tokens=2_000,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else ""
            usage = chunk.usage.model_dump() if chunk.usage is not None else None
            yield AgUiTextChunk(
                delta=delta or "",
                model=chunk.model,
                usage=usage,
            )


async def stream_agui_text_events(
    request: AgUiRunAgentInput,
    settings: BackendSettings,
    generator: AgUiTextGenerator | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Emit only standard AG-UI lifecycle and text events."""

    generator = generator or generate_deepseek_text
    prompt = _latest_user_text(request)
    assistant_message_id = f"message:assistant:{request.run_id}"
    lock = await agui_agent_session_store.lock_for(request.thread_id)

    yield {
        "type": "RUN_STARTED",
        "threadId": request.thread_id,
        "runId": request.run_id,
    }
    yield {
        "type": "TEXT_MESSAGE_START",
        "messageId": assistant_message_id,
        "role": "assistant",
    }

    response_parts: list[str] = []
    model = settings.deepseek_model
    usage: dict[str, Any] = {}
    try:
        async with lock:
            history = await agui_agent_session_store.history(request.thread_id)
            async for chunk in generator(settings, history, prompt):
                if chunk.model:
                    model = chunk.model
                if chunk.usage is not None:
                    usage = chunk.usage
                if chunk.delta:
                    response_parts.append(chunk.delta)
                    yield {
                        "type": "TEXT_MESSAGE_CONTENT",
                        "messageId": assistant_message_id,
                        "delta": chunk.delta,
                    }
            response_text = "".join(response_parts).strip()
            if not response_text:
                raise ValueError("DeepSeek returned an empty response.")
            await agui_agent_session_store.append_turn(
                request.thread_id,
                prompt,
                response_text,
            )
    except Exception as error:
        yield {
            "type": "RUN_ERROR",
            "message": str(error),
            "code": "AGUI_TEXT_GENERATION_FAILED",
        }
        return

    yield {"type": "TEXT_MESSAGE_END", "messageId": assistant_message_id}
    yield {
        "type": "RUN_FINISHED",
        "threadId": request.thread_id,
        "runId": request.run_id,
        "result": {"provider": "deepseek", "model": model, "usage": usage},
        "outcome": {"type": "success"},
    }
