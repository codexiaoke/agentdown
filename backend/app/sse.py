"""Minimal SSE helpers used by the FastAPI backend."""

from __future__ import annotations

from collections.abc import AsyncIterator
import json
from typing import Any

from fastapi.responses import StreamingResponse

from app.conversation_state import StoredConversationEvent


def encode_sse_frame(data: Any, *, event: str | None = None, event_id: str | None = None) -> bytes:
    """Encode a JSON payload into a single UTF-8 SSE frame."""

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    lines: list[str] = []

    if event is not None:
        lines.append(f"event: {event}")

    if event_id is not None:
        lines.append(f"id: {event_id}")

    for line in payload.splitlines() or [""]:
        lines.append(f"data: {line}")

    lines.append("")
    return ("\n".join(lines) + "\n").encode("utf-8")


def infer_sse_event_name(data: Any) -> str | None:
    """Infer the SSE event name from a raw framework payload when possible."""

    if not isinstance(data, dict):
        return None

    for key in ("event", "type", "chunk_type", "status"):
        value = data.get(key)

        if isinstance(value, str) and value:
            return value

    return None


async def encode_sse_stream(events: AsyncIterator[dict[str, Any]]) -> AsyncIterator[bytes]:
    """Convert an async iterator of JSON events into SSE byte chunks."""

    async for event in events:
        yield encode_sse_frame(event, event=infer_sse_event_name(event))


def create_sse_response(events: AsyncIterator[dict[str, Any]]) -> StreamingResponse:
    """Wrap a provider event stream in a FastAPI `StreamingResponse`."""

    return StreamingResponse(
        encode_sse_stream(events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def encode_stored_sse_stream(
    events: AsyncIterator[StoredConversationEvent],
) -> AsyncIterator[bytes]:
    """Encode stored events while preserving their stable backend event ids."""

    async for event in events:
        yield encode_sse_frame(event.data, event=event.event, event_id=event.event_id)


def create_resumable_sse_response(
    events: AsyncIterator[StoredConversationEvent],
    *,
    conversation_id: str,
    request_id: str,
    reused: bool,
) -> StreamingResponse:
    """Return a resumable SSE response with observable identity headers."""

    return StreamingResponse(
        encode_stored_sse_stream(events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Agentdown-Conversation-Id": conversation_id,
            "X-Agentdown-Request-Id": request_id,
            "X-Agentdown-Request-Reused": str(reused).lower(),
        },
    )
