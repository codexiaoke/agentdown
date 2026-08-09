"""Deterministic in-memory AG-UI + A2UI example provider."""

from __future__ import annotations

from collections.abc import AsyncIterator
import asyncio
import json
from typing import Any

from app.models import AgUiRunAgentInput


A2UI_BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
A2UI_SURFACE_ID = "trip-planner"


def _last_user_text(request: AgUiRunAgentInput) -> str:
    """Return the latest plain-text user message from a standard AG-UI request."""

    for message in reversed(request.messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = [
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            return "".join(part for part in parts if isinstance(part, str))
    return ""


def _resolve_city(prompt: str) -> str:
    """Pick a familiar city from the prompt so the offline example feels responsive."""

    for city in ("杭州", "上海", "北京", "成都", "厦门", "苏州", "南京", "广州", "深圳"):
        if city in prompt:
            return city
    return "杭州"


def _read_a2ui_action(request: AgUiRunAgentInput) -> dict[str, Any] | None:
    """Read the A2UI client action carried in AG-UI forwardedProps."""

    forwarded = request.forwarded_props
    if not isinstance(forwarded, dict):
        return None
    a2ui = forwarded.get("a2ui")
    if not isinstance(a2ui, dict):
        return None
    action = a2ui.get("action")
    return action if isinstance(action, dict) else None


def _surface_messages(
    *,
    city: str,
    days: int,
    pace: list[str],
    confirmed: bool,
) -> list[dict[str, Any]]:
    """Build a safe A2UI v0.9 surface using only the frontend-owned Basic Catalog."""

    status_text = (
        f"已收到你的选择：{city} · {days} 天 · {pace[0] if pace else '舒缓'}节奏。"
        if confirmed
        else "修改下面的偏好，然后点击按钮。这个动作会通过 AG-UI 回传后端。"
    )
    button_text = "重新确认计划" if confirmed else "确认并生成计划"

    return [
        {
            "version": "v0.9",
            "createSurface": {
                "surfaceId": A2UI_SURFACE_ID,
                "catalogId": A2UI_BASIC_CATALOG_ID,
                "sendDataModel": True,
            },
        },
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": A2UI_SURFACE_ID,
                "components": [
                    {
                        "id": "root",
                        "component": "Column",
                        "children": ["title", "status", "form-card"],
                    },
                    {"id": "title", "component": "Text", "text": {"path": "/title"}, "variant": "h2"},
                    {"id": "status", "component": "Text", "text": {"path": "/status"}, "variant": "body"},
                    {"id": "form-card", "component": "Card", "child": "form"},
                    {
                        "id": "form",
                        "component": "Column",
                        "children": ["city", "days", "pace", "submit"],
                    },
                    {
                        "id": "city",
                        "component": "TextField",
                        "label": "目的地",
                        "value": {"path": "/city"},
                        "variant": "shortText",
                    },
                    {
                        "id": "days",
                        "component": "Slider",
                        "label": "旅行天数",
                        "min": 1,
                        "max": 7,
                        "value": {"path": "/days"},
                    },
                    {
                        "id": "pace",
                        "component": "ChoicePicker",
                        "label": "旅行节奏",
                        "variant": "mutuallyExclusive",
                        "options": [
                            {"label": "舒缓", "value": "舒缓"},
                            {"label": "均衡", "value": "均衡"},
                            {"label": "紧凑", "value": "紧凑"},
                        ],
                        "value": {"path": "/pace"},
                    },
                    {
                        "id": "submit",
                        "component": "Button",
                        "child": "submit-label",
                        "variant": "primary",
                        "action": {
                            "event": {
                                "name": "trip_submitted",
                                "context": {
                                    "city": {"path": "/city"},
                                    "days": {"path": "/days"},
                                    "pace": {"path": "/pace"},
                                },
                            }
                        },
                    },
                    {"id": "submit-label", "component": "Text", "text": button_text},
                ],
            },
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": A2UI_SURFACE_ID,
                "path": "/",
                "value": {
                    "title": f"{city}周末旅行计划",
                    "status": status_text,
                    "city": city,
                    "days": days,
                    "pace": pace,
                    "confirmed": confirmed,
                },
            },
        },
    ]


async def _yield_event(event: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Create a visible but fast stream for browser demonstrations."""

    yield event
    await asyncio.sleep(0.015)


async def stream_agui_events(request: AgUiRunAgentInput) -> AsyncIterator[dict[str, Any]]:
    """Stream a complete AG-UI run, including an interactive A2UI surface."""

    action = _read_a2ui_action(request)
    context = action.get("context", {}) if action else {}
    context = context if isinstance(context, dict) else {}
    prompt = _last_user_text(request)
    city = str(context.get("city") or _resolve_city(prompt)).strip()[:60] or "杭州"
    raw_days = context.get("days", 2)
    days = int(raw_days) if isinstance(raw_days, (int, float)) and not isinstance(raw_days, bool) else 2
    days = max(1, min(days, 7))
    raw_pace = context.get("pace", ["舒缓"])
    pace_candidates = raw_pace if isinstance(raw_pace, list) else [raw_pace]
    pace = [str(value) for value in pace_candidates if str(value) in {"舒缓", "均衡", "紧凑"}][:1]
    pace = pace or ["舒缓"]
    confirmed = action is not None and action.get("name") == "trip_submitted"
    assistant_message_id = f"message:assistant:{request.run_id}"
    tool_call_id = f"tool:trip:{request.run_id}"

    events: list[dict[str, Any]] = [
        {
            "type": "RUN_STARTED",
            "threadId": request.thread_id,
            "runId": request.run_id,
            **({"parentRunId": request.parent_run_id} if request.parent_run_id else {}),
        },
        {
            "type": "STATE_SNAPSHOT",
            "snapshot": {
                "example": "ag-ui-a2ui-trip-planner",
                "status": "confirming" if confirmed else "planning",
                "city": city,
            },
        },
        {
            "type": "TEXT_MESSAGE_START",
            "messageId": assistant_message_id,
            "role": "assistant",
        },
        {
            "type": "TEXT_MESSAGE_CONTENT",
            "messageId": assistant_message_id,
            "delta": (
                f"已确认 {city} 的 {days} 天计划，下面是后端根据 A2UI action 返回的新 Surface。"
                if confirmed
                else f"我先为你准备一份 {city} 周末计划，你可以直接在下面调整参数。"
            ),
        },
        {"type": "TEXT_MESSAGE_END", "messageId": assistant_message_id},
        {
            "type": "TOOL_CALL_START",
            "toolCallId": tool_call_id,
            "toolCallName": "confirm_trip" if confirmed else "draft_trip",
            "parentMessageId": assistant_message_id,
        },
        {
            "type": "TOOL_CALL_ARGS",
            "toolCallId": tool_call_id,
            "delta": json.dumps({"city": city, "days": days}, ensure_ascii=False),
        },
        {"type": "TOOL_CALL_END", "toolCallId": tool_call_id},
        {
            "type": "TOOL_CALL_RESULT",
            "messageId": f"message:tool:{request.run_id}",
            "toolCallId": tool_call_id,
            "content": json.dumps(
                {"ok": True, "source": "memory", "confirmed": confirmed},
                ensure_ascii=False,
            ),
        },
    ]

    events.extend(
        {
            "type": "CUSTOM",
            "name": "a2ui",
            "value": message,
        }
        for message in _surface_messages(
            city=city,
            days=days,
            pace=pace,
            confirmed=confirmed,
        )
    )
    events.append(
        {
            "type": "RUN_FINISHED",
            "threadId": request.thread_id,
            "runId": request.run_id,
            "outcome": {"type": "success"},
        }
    )

    for event in events:
        async for streamed in _yield_event(event):
            yield streamed
