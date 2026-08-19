"""Tests for the real-model AG-UI boundary and its safe A2UI conversion."""

from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient

from app.conversation_state import conversation_event_store
from app.main import app
from app.models import AgUiRunAgentInput
from app.examples.agui_a2ui_deepseek import (
    AgUiGeneratedSurface,
    AgUiModelGeneration,
    _create_deepseek_http_client,
    agui_agent_session_store,
    generate_deepseek_surface,
    parse_generated_surface,
    stream_agui_events,
)
from app.settings import load_settings


def _run_input(
    *,
    run_id: str = "run-1",
    content: str = "生成一个读书计划表单",
    forwarded_props: object | None = None,
) -> dict[str, object]:
    if forwarded_props is None:
        forwarded_props = {
            "a2ui": {
                "clientCapabilities": {
                    "v0.9.1": {
                        "supportedCatalogIds": [
                            "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
                        ]
                    }
                }
            }
        }
    payload: dict[str, object] = {
        "threadId": "thread:agui:test",
        "runId": run_id,
        "messages": [
            {
                "id": f"message:user:{run_id}",
                "role": "user",
                "content": content,
            }
        ],
        "tools": [],
        "context": [],
        "state": {},
    }
    payload["forwardedProps"] = forwarded_props
    return payload


def _surface(*, title: str = "阅读计划") -> AgUiGeneratedSurface:
    return AgUiGeneratedSurface.model_validate(
        {
            "assistantText": "我根据你的要求生成了一个可调整的阅读计划。",
            "components": [
                {
                    "id": "root",
                    "component": "Column",
                    "children": ["title", "card"],
                },
                {
                    "id": "title",
                    "component": "Text",
                    "text": {"path": "/title"},
                    "variant": "h2",
                },
                {"id": "card", "component": "Card", "child": "form"},
                {
                    "id": "form",
                    "component": "Column",
                    "children": ["book", "minutes", "pace", "submit"],
                },
                {
                    "id": "book",
                    "component": "TextField",
                    "label": "书名",
                    "value": {"path": "/book"},
                },
                {
                    "id": "minutes",
                    "component": "Slider",
                    "label": "每日分钟数",
                    "min": 10,
                    "max": 120,
                    "value": {"path": "/minutes"},
                },
                {
                    "id": "pace",
                    "component": "ChoicePicker",
                    "label": "阅读节奏",
                    "variant": "mutuallyExclusive",
                    "options": [
                        {"label": "轻松", "value": "轻松"},
                        {"label": "稳定", "value": "稳定"},
                    ],
                    "value": {"path": "/pace"},
                },
                {
                    "id": "submit",
                    "component": "Button",
                    "child": "submitText",
                    "variant": "primary",
                    "action": {
                        "event": {
                            "name": "reading_plan_submitted",
                            "context": {
                                "book": {"path": "/book"},
                                "minutes": {"path": "/minutes"},
                                "pace": {"path": "/pace"},
                            },
                        }
                    },
                },
                {"id": "submitText", "component": "Text", "text": "确认计划"},
            ],
            "dataModel": {
                "title": title,
                "book": "",
                "minutes": 30,
                "pace": ["稳定"],
            },
        }
    )


async def _fake_generator(
    _settings: object,
    _history: list[dict[str, str]],
    latest_input: str,
) -> AgUiModelGeneration:
    title = "已提交的阅读计划" if "reading_plan_submitted" in latest_input else "阅读计划"
    return AgUiModelGeneration(
        surface=_surface(title=title),
        model="deepseek-test-model",
        usage={"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300},
        response_id="response-test-1",
    )


def _parse_sse_events(body: str) -> list[dict[str, object]]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


class AgUiProviderTest(unittest.IsolatedAsyncioTestCase):
    """Verify model conversion, actions, safety, and backend-owned recovery."""

    async def asyncSetUp(self) -> None:
        await conversation_event_store.clear()
        await agui_agent_session_store.clear()

    async def asyncTearDown(self) -> None:
        await conversation_event_store.clear()
        await agui_agent_session_store.clear()

    async def test_provider_streams_real_model_metadata_and_a2ui_surface(self) -> None:
        request = AgUiRunAgentInput.model_validate(_run_input())
        events = [
            event
            async for event in stream_agui_events(request, load_settings(), _fake_generator)
        ]

        self.assertEqual("RUN_STARTED", events[0]["type"])
        self.assertEqual("THINKING_START", events[1]["type"])
        self.assertEqual("RUN_FINISHED", events[-1]["type"])
        self.assertEqual("deepseek-test-model", events[-1]["result"]["model"])

        tool_result = next(event for event in events if event["type"] == "TOOL_CALL_RESULT")
        self.assertEqual("deepseek", json.loads(tool_result["content"])["source"])
        a2ui_values = [
            event["value"]
            for event in events
            if event["type"] == "CUSTOM" and event.get("name") == "a2ui"
        ]
        self.assertEqual(3, len(a2ui_values))
        self.assertIn("createSurface", a2ui_values[0])
        self.assertIn("updateComponents", a2ui_values[1])
        self.assertEqual("阅读计划", a2ui_values[2]["updateDataModel"]["value"]["title"])

    async def test_requires_the_basic_catalog_in_the_initial_capability_handshake(self) -> None:
        request = AgUiRunAgentInput.model_validate(
            _run_input(
                forwarded_props={
                    "a2ui": {
                        "clientCapabilities": {
                            "v0.9.1": {
                                "supportedCatalogIds": ["https://example.com/custom/catalog.json"]
                            }
                        }
                    }
                }
            )
        )

        with self.assertRaisesRegex(ValueError, "required Basic Catalog"):
            _ = [
                event
                async for event in stream_agui_events(request, load_settings(), _fake_generator)
            ]

    async def test_reading_plan_submit_uses_deterministic_confirmation_without_duplicate_chat(self) -> None:
        first_request = AgUiRunAgentInput.model_validate(_run_input())
        _ = [
            event
            async for event in stream_agui_events(first_request, load_settings(), _fake_generator)
        ]
        calls: list[tuple[list[dict[str, str]], str]] = []

        async def capture_generator(
            settings: object,
            history: list[dict[str, str]],
            latest_input: str,
        ) -> AgUiModelGeneration:
            calls.append((history, latest_input))
            return await _fake_generator(settings, history, latest_input)

        action = {
            "name": "submit_reading_plan",
            "surfaceId": "agent-surface",
            "sourceComponentId": "submit",
            "timestamp": "2026-08-09T10:00:00.000Z",
            "context": {"book": "深度工作", "minutes": 45, "pace": ["稳定"]},
        }
        action_request = AgUiRunAgentInput.model_validate(
            _run_input(
                run_id="run-action",
                content="",
                forwarded_props={
                    "a2ui": {
                        "clientMessage": {"version": "v0.9.1", "action": action},
                        "clientCapabilities": {
                            "v0.9.1": {
                                "supportedCatalogIds": [
                                    "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
                                ]
                            }
                        },
                        "clientDataModel": {
                            "version": "v0.9.1",
                            "surfaces": {
                                "agent-surface": {
                                    "book": "深度工作",
                                    "minutes": 45,
                                    "pace": ["稳定"],
                                }
                            },
                        },
                    }
                },
            )
        )
        events = [
            event
            async for event in stream_agui_events(
                action_request,
                load_settings(),
                capture_generator,
            )
        ]

        self.assertEqual([], calls)
        self.assertNotIn("TEXT_MESSAGE_START", {event["type"] for event in events})
        self.assertNotIn("TOOL_CALL_START", {event["type"] for event in events})
        generating_state = next(event["snapshot"] for event in events if event["type"] == "STATE_SNAPSHOT")
        self.assertEqual("application", generating_state["source"])
        components_message = next(
            event["value"]["updateComponents"]
            for event in events
            if event["type"] == "CUSTOM" and "updateComponents" in event["value"]
        )
        components = components_message["components"]
        self.assertIn(
            {"id": "status", "component": "Text", "text": "✓ 已提交", "variant": "h2"},
            components,
        )
        edit_button = next(component for component in components if component["id"] == "edit")
        self.assertEqual(
            "reading_plan_edit_requested",
            edit_button["action"]["event"]["name"],
        )
        data_message = next(
            event["value"]["updateDataModel"]
            for event in events
            if event["type"] == "CUSTOM" and "updateDataModel" in event["value"]
        )
        self.assertEqual("深度工作", data_message["value"]["book"])
        self.assertEqual("每日阅读：45 分钟", data_message["value"]["minutesSummary"])

    async def test_reading_plan_requires_a_book_and_can_return_to_prefilled_editing(self) -> None:
        def action_request(name: str, book: str) -> AgUiRunAgentInput:
            action = {
                "name": name,
                "surfaceId": "agent-surface",
                "sourceComponentId": "submit" if name == "reading_plan_submitted" else "edit",
                "timestamp": "2026-08-09T10:00:00.000Z",
                "context": {"book": book, "minutes": 45, "pace": ["适中"]},
            }
            return AgUiRunAgentInput.model_validate(_run_input(
                run_id=f"run-{name}",
                content="",
                forwarded_props={
                    "a2ui": {
                        "clientMessage": {"version": "v0.9.1", "action": action},
                        "clientCapabilities": {
                            "v0.9.1": {
                                "supportedCatalogIds": [
                                    "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
                                ]
                            }
                        },
                    }
                },
            ))

        invalid_events = [
            event
            async for event in stream_agui_events(
                action_request("reading_plan_submitted", ""),
                load_settings(),
                _fake_generator,
            )
        ]
        invalid_components = next(
            event["value"]["updateComponents"]["components"]
            for event in invalid_events
            if event["type"] == "CUSTOM" and "updateComponents" in event["value"]
        )
        self.assertIn(
            "请输入书名后再提交。",
            [component.get("text") for component in invalid_components],
        )
        self.assertIn("submit", {component["id"] for component in invalid_components})

        edit_events = [
            event
            async for event in stream_agui_events(
                action_request("reading_plan_edit_requested", "深度工作"),
                load_settings(),
                _fake_generator,
            )
        ]
        edit_data = next(
            event["value"]["updateDataModel"]["value"]
            for event in edit_events
            if event["type"] == "CUSTOM" and "updateDataModel" in event["value"]
        )
        self.assertEqual(
            {"book": "深度工作", "minutes": 45, "pace": ["适中"]},
            edit_data,
        )
        edit_components = next(
            event["value"]["updateComponents"]["components"]
            for event in edit_events
            if event["type"] == "CUSTOM" and "updateComponents" in event["value"]
        )
        self.assertIn("submit", {component["id"] for component in edit_components})
        self.assertNotIn("edit", {component["id"] for component in edit_components})

        alias_action = {
            "name": "confirm_reading_plan",
            "surfaceId": "agent-surface",
            "sourceComponentId": "confirm",
            "timestamp": "2026-08-09T10:00:00.000Z",
            "context": {
                "bookTitle": "原则",
                "dailyMinutes": 25,
                "readingPace": ["轻松"],
            },
        }
        alias_events = [
            event
            async for event in stream_agui_events(
                AgUiRunAgentInput.model_validate(_run_input(
                    run_id="run-alias-action",
                    content="",
                    forwarded_props={
                        "a2ui": {
                            "clientMessage": {"version": "v0.9.1", "action": alias_action},
                            "clientCapabilities": {
                                "v0.9.1": {
                                    "supportedCatalogIds": [
                                        "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
                                    ]
                                }
                            },
                        }
                    },
                )),
                load_settings(),
                _fake_generator,
            )
        ]
        alias_data = next(
            event["value"]["updateDataModel"]["value"]
            for event in alias_events
            if event["type"] == "CUSTOM" and "updateDataModel" in event["value"]
        )
        self.assertEqual("原则", alias_data["book"])
        self.assertEqual(25, alias_data["minutes"])
        self.assertEqual(["轻松"], alias_data["pace"])

        model_value_action = {
            **alias_action,
            "context": {
                "bookTitle": "深度工作",
                "dailyMinutes": 30,
                "readingPace": ["moderate"],
            },
        }
        model_value_events = [
            event
            async for event in stream_agui_events(
                AgUiRunAgentInput.model_validate(_run_input(
                    run_id="run-model-value-action",
                    content="",
                    forwarded_props={
                        "a2ui": {
                            "clientMessage": {
                                "version": "v0.9.1",
                                "action": model_value_action,
                            },
                            "clientCapabilities": {
                                "v0.9.1": {
                                    "supportedCatalogIds": [
                                        "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
                                    ]
                                }
                            },
                        }
                    },
                )),
                load_settings(),
                _fake_generator,
            )
        ]
        model_value_data = next(
            event["value"]["updateDataModel"]["value"]
            for event in model_value_events
            if event["type"] == "CUSTOM" and "updateDataModel" in event["value"]
        )
        self.assertEqual(["适中"], model_value_data["pace"])
        self.assertEqual("阅读节奏：适中", model_value_data["paceSummary"])

    async def test_rejects_client_functions_and_missing_bindings(self) -> None:
        unsafe = _surface().model_dump(by_alias=True)
        button = next(item for item in unsafe["components"] if item["component"] == "Button")
        button["action"] = {"functionCall": {"call": "openUrl", "args": {}}}
        with self.assertRaisesRegex(ValueError, "forbidden client feature"):
            parse_generated_surface(json.dumps(unsafe, ensure_ascii=False))

        missing_binding = _surface().model_dump(by_alias=True)
        missing_binding["components"][1]["text"] = {"path": "/missing"}
        with self.assertRaisesRegex(ValueError, "does not exist"):
            parse_generated_surface(json.dumps(missing_binding, ensure_ascii=False))

        wrong_choice_type = _surface().model_dump(by_alias=True)
        wrong_choice_type["dataModel"]["pace"] = "稳定"
        normalized = parse_generated_surface(json.dumps(wrong_choice_type, ensure_ascii=False))
        self.assertEqual(["稳定"], normalized.data_model["pace"])

        missing_button_label = _surface().model_dump(by_alias=True)
        missing_button_label["components"] = [
            component
            for component in missing_button_label["components"]
            if component["id"] != "submitText"
        ]
        normalized = parse_generated_surface(json.dumps(missing_button_label, ensure_ascii=False))
        generated_label = next(
            component for component in normalized.components if component["id"] == "submitText"
        )
        self.assertEqual("Text", generated_label["component"])

    async def test_http_stream_is_archived_and_idempotently_replayed(self) -> None:
        transport = ASGITransport(app=app)
        with patch("app.examples.agui_a2ui_deepseek.generate_deepseek_surface", new=_fake_generator):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/stream/agui",
                    json=_run_input(),
                    headers={"Idempotency-Key": "request:agui:test"},
                )

                self.assertEqual(200, response.status_code)
                events = _parse_sse_events(response.text)
                self.assertEqual("RUN_STARTED", events[0]["type"])
                self.assertEqual("RUN_FINISHED", events[-1]["type"])
                self.assertEqual("false", response.headers["x-agentdown-request-reused"])

                replay = await client.post(
                    "/api/stream/agui",
                    json=_run_input(),
                    headers={"Idempotency-Key": "request:agui:test"},
                )
                self.assertEqual("true", replay.headers["x-agentdown-request-reused"])
                self.assertEqual(events, _parse_sse_events(replay.text))

                archive = await client.get("/api/v1/conversations/thread:agui:test")
                archive_body = archive.json()
                self.assertEqual(200, archive.status_code)
                self.assertEqual("agui", archive_body["provider_id"])
                self.assertEqual(len(events), archive_body["latest_cursor"])
                self.assertEqual(events, [item["data"] for item in archive_body["events"]])

    async def test_live_client_ignores_invalid_system_no_proxy(self) -> None:
        """The example must not inherit a malformed machine-level proxy setup."""

        with patch.dict(os.environ, {"NO_PROXY": "localhost,::1"}):
            client = _create_deepseek_http_client()
            try:
                self.assertFalse(client.trust_env)
            finally:
                await client.aclose()

    async def test_live_deepseek_generation_when_explicitly_enabled(self) -> None:
        if os.getenv("AGENTDOWN_RUN_LIVE_DEEPSEEK") != "1":
            self.skipTest("Set AGENTDOWN_RUN_LIVE_DEEPSEEK=1 to run the paid online check.")

        generation = await generate_deepseek_surface(
            load_settings(),
            [],
            "生成一个简单的饮水打卡界面，包含目标杯数和确认按钮。",
        )

        self.assertTrue(generation.model)
        self.assertIn("root", {component["id"] for component in generation.surface.components})
        self.assertGreater(len(generation.surface.components), 2)


if __name__ == "__main__":
    unittest.main()
