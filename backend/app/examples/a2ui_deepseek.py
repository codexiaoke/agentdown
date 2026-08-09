"""Transport-neutral A2UI reference endpoint backed by a real DeepSeek model."""

from __future__ import annotations

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
    prompt: str = ""
    client_capabilities: dict[str, Any] = Field(alias="clientCapabilities")
    client_message: dict[str, Any] | None = Field(default=None, alias="clientMessage")
    client_data_model: dict[str, Any] | None = Field(default=None, alias="clientDataModel")


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
    lock = await agui_agent_session_store.lock_for(request.session_id)
    async with lock:
        history = await agui_agent_session_store.history(request.session_id)
        generation: AgUiModelGeneration = await generator(settings, history, latest_input)
        await agui_agent_session_store.append_turn(
            request.session_id,
            latest_input,
            generation.surface.assistant_text,
        )

    return {
        "assistantText": generation.surface.assistant_text,
        "messages": build_a2ui_surface_messages(generation.surface),
        "model": generation.model,
        "usage": generation.usage,
        "responseId": generation.response_id,
    }
