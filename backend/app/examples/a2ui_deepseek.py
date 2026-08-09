"""Transport-neutral A2UI reference endpoint backed by a real DeepSeek model."""

from __future__ import annotations

import asyncio
from copy import deepcopy
import hashlib
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.examples.agui_a2ui_deepseek import (
    A2UI_BASIC_CATALOG_ID,
    AgUiModelGeneration,
    AgUiSurfaceGenerator,
    agui_agent_session_store,
    build_a2ui_surface_messages,
    generate_deepseek_surface,
)
from app.settings import BackendSettings


class A2UiGenerateRequest(BaseModel):
    """Minimal HTTP transport used only by the standalone A2UI consumer example."""

    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId", min_length=1)
    request_id: str | None = Field(default=None, alias="requestId", min_length=1)
    prompt: str = ""
    client_capabilities: dict[str, Any] = Field(alias="clientCapabilities")
    client_message: dict[str, Any] | None = Field(default=None, alias="clientMessage")
    client_data_model: dict[str, Any] | None = Field(default=None, alias="clientDataModel")


class A2UiRequestConflictError(ValueError):
    """Raised when one A2UI request id is reused with a different payload."""


class A2UiIdempotencyStore:
    """In-memory reference store for standalone A2UI request results."""

    def __init__(self) -> None:
        self._responses: dict[tuple[str, str], tuple[str, dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def get(
        self,
        session_id: str,
        request_id: str,
        fingerprint: str,
    ) -> dict[str, Any] | None:
        async with self._lock:
            cached = self._responses.get((session_id, request_id))
            if cached is None:
                return None
            cached_fingerprint, response = cached
            if cached_fingerprint != fingerprint:
                raise A2UiRequestConflictError(
                    f"A2UI request id {request_id} was already used with a different payload."
                )
            return deepcopy(response)

    async def put(
        self,
        session_id: str,
        request_id: str,
        fingerprint: str,
        response: dict[str, Any],
    ) -> None:
        async with self._lock:
            self._responses[(session_id, request_id)] = (fingerprint, deepcopy(response))

    async def clear(self) -> None:
        async with self._lock:
            self._responses.clear()


a2ui_idempotency_store = A2UiIdempotencyStore()


def _request_fingerprint(request: A2UiGenerateRequest) -> str:
    payload = request.model_dump(mode="json", by_alias=True, exclude={"request_id"})
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _validate_capabilities(capabilities: dict[str, Any]) -> None:
    supported_catalog_ids = {
        catalog_id
        for version in ("v0.9", "v0.9.1")
        if isinstance(capabilities.get(version), dict)
        for catalog_id in capabilities[version].get("supportedCatalogIds", [])
        if isinstance(catalog_id, str)
    }
    if A2UI_BASIC_CATALOG_ID not in supported_catalog_ids:
        raise ValueError("A2UI client does not advertise the required Basic Catalog.")


def _latest_input(request: A2UiGenerateRequest) -> str:
    _validate_capabilities(request.client_capabilities)
    if request.client_message is None:
        prompt = request.prompt.strip()
        if not prompt:
            raise ValueError("Standalone A2UI request requires a prompt or clientMessage.")
        return prompt

    version = request.client_message.get("version")
    if version not in {"v0.9", "v0.9.1"} or version not in request.client_capabilities:
        raise ValueError("A2UI client message version is not advertised by clientCapabilities.")
    action = request.client_message.get("action")
    error = request.client_message.get("error")
    if isinstance(action, dict) == isinstance(error, dict):
        raise ValueError("A2UI clientMessage requires exactly one action or error.")
    event_type = "action" if isinstance(action, dict) else "error"
    return (
        f"A2UI 客户端刚刚上报了以下 {event_type}。请更新界面：\n"
        + json.dumps(
            {
                "message": request.client_message,
                "clientDataModel": request.client_data_model,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


async def generate_a2ui_response(
    request: A2UiGenerateRequest,
    settings: BackendSettings,
    generator: AgUiSurfaceGenerator | None = None,
) -> dict[str, Any]:
    """Generate validated A2UI messages without depending on AG-UI."""

    generator = generator or generate_deepseek_surface
    latest_input = _latest_input(request)
    fingerprint = _request_fingerprint(request)
    lock = await agui_agent_session_store.lock_for(request.session_id)
    async with lock:
        if request.request_id:
            cached = await a2ui_idempotency_store.get(
                request.session_id,
                request.request_id,
                fingerprint,
            )
            if cached is not None:
                return cached

        history = await agui_agent_session_store.history(request.session_id)
        generation: AgUiModelGeneration = await generator(settings, history, latest_input)
        await agui_agent_session_store.append_turn(
            request.session_id,
            latest_input,
            generation.surface.assistant_text,
        )

        response = {
            "assistantText": generation.surface.assistant_text,
            "messages": build_a2ui_surface_messages(generation.surface),
            "model": generation.model,
            "usage": generation.usage,
            "responseId": generation.response_id,
        }
        if request.request_id:
            await a2ui_idempotency_store.put(
                request.session_id,
                request.request_id,
                fingerprint,
                response,
            )

    return response
