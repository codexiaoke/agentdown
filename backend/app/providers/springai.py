"""Gateway helpers for the real Spring AI demo backend."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse

from app.models import ConversationArchiveResponse
from app.settings import BackendSettings


def _upstream_url(settings: BackendSettings, path: str) -> str:
    return f"{settings.spring_ai_base_url.rstrip('/')}{path}"


def _request_headers(
    *,
    idempotency_key: str | None = None,
    last_event_id: str | None = None,
) -> dict[str, str]:
    headers = {"Accept": "text/event-stream"}

    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    if last_event_id:
        headers["Last-Event-ID"] = last_event_id

    return headers


async def _close_stream(client: httpx.AsyncClient, response: httpx.Response) -> None:
    await response.aclose()
    await client.aclose()


async def _proxy_sse_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any] | None = None,
    params: dict[str, str | int] | None = None,
) -> StreamingResponse:
    client = httpx.AsyncClient(trust_env=False, timeout=None)

    try:
        request = client.build_request(
            method,
            url,
            headers=headers,
            json=payload,
            params=params,
        )
        upstream = await client.send(request, stream=True)
    except httpx.HTTPError as error:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Spring AI backend is unavailable: {error}") from error

    if upstream.status_code >= 400:
        error_body = (await upstream.aread()).decode(errors="replace")
        await _close_stream(client, upstream)
        raise HTTPException(
            status_code=upstream.status_code,
            detail=error_body or "Spring AI backend request failed.",
        )

    response_headers = {
        key: value
        for key, value in upstream.headers.items()
        if key.lower().startswith("x-agentdown-")
    }
    media_type = upstream.headers.get("content-type", "text/event-stream").split(";", 1)[0]

    async def iter_bytes() -> AsyncIterator[bytes]:
        async for chunk in upstream.aiter_raw():
            yield chunk

    return StreamingResponse(
        iter_bytes(),
        status_code=upstream.status_code,
        media_type=media_type,
        headers=response_headers,
        background=BackgroundTask(_close_stream, client, upstream),
    )


async def proxy_springai_stream(
    payload: dict[str, Any],
    settings: BackendSettings,
    *,
    idempotency_key: str | None,
    last_event_id: str | None,
) -> StreamingResponse:
    """Forward the unified chat request to the Spring AI process."""

    return await _proxy_sse_request(
        "POST",
        _upstream_url(settings, "/api/stream/springai"),
        headers=_request_headers(
            idempotency_key=idempotency_key,
            last_event_id=last_event_id,
        ),
        payload=payload,
    )


async def load_springai_archive(
    conversation_id: str,
    settings: BackendSettings,
) -> ConversationArchiveResponse | None:
    """Load a Spring AI archive through the FastAPI gateway."""

    url = _upstream_url(
        settings,
        f"/api/v1/conversations/{quote(conversation_id, safe='')}",
    )
    async with httpx.AsyncClient(trust_env=False, timeout=10.0) as client:
        try:
            response = await client.get(url, headers={"Accept": "application/json"})
        except httpx.HTTPError as error:
            raise HTTPException(status_code=502, detail=f"Spring AI backend is unavailable: {error}") from error

    if response.status_code == 404:
        return None
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    return ConversationArchiveResponse.model_validate(response.json())


async def reconnect_springai_events(
    conversation_id: str,
    request_id: str,
    after_cursor: int,
    last_event_id: str | None,
    settings: BackendSettings,
) -> StreamingResponse:
    """Reconnect to a Spring AI run through the same public gateway."""

    encoded_id = quote(conversation_id, safe="")
    return await _proxy_sse_request(
        "GET",
        _upstream_url(settings, f"/api/v1/conversations/{encoded_id}/events"),
        headers=_request_headers(last_event_id=last_event_id),
        params={"request_id": request_id, "after_cursor": after_cursor},
    )
