"""Contract tests for the pure AG-UI and pure A2UI real-backend examples."""

from __future__ import annotations

import unittest

from app.examples.a2ui_deepseek import A2UiGenerateRequest, generate_a2ui_response
from app.examples.agui_a2ui_deepseek import (
    A2UI_BASIC_CATALOG_ID,
    AgUiGeneratedSurface,
    AgUiModelGeneration,
    agui_agent_session_store,
)
from app.examples.agui_deepseek import AgUiTextChunk, stream_agui_text_events
from app.models import AgUiRunAgentInput
from app.settings import load_settings


def _surface() -> AgUiGeneratedSurface:
    return AgUiGeneratedSurface.model_validate(
        {
            "assistantText": "界面已生成。",
            "components": [
                {
                    "id": "root",
                    "component": "Column",
                    "children": ["title", "submit"],
                },
                {"id": "title", "component": "Text", "text": {"path": "/title"}},
                {
                    "id": "submit",
                    "component": "Button",
                    "child": "submitText",
                    "action": {"event": {"name": "confirmed"}},
                },
                {"id": "submitText", "component": "Text", "text": "确认"},
            ],
            "dataModel": {"title": "真实 A2UI 示例"},
        }
    )


class ProtocolConsumerBackendTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        await agui_agent_session_store.clear()

    async def asyncTearDown(self) -> None:
        await agui_agent_session_store.clear()

    async def test_pure_agui_stream_contains_no_a2ui_events(self) -> None:
        calls: list[tuple[list[dict[str, str]], str]] = []

        async def fake_text_generator(settings, history, prompt):
            calls.append((history, prompt))
            yield AgUiTextChunk(delta="这是", model="deepseek-test")
            yield AgUiTextChunk(
                delta="纯 AG-UI。",
                model="deepseek-test",
                usage={"total_tokens": 12},
            )

        request = AgUiRunAgentInput.model_validate(
            {
                "threadId": "thread:pure-agui",
                "runId": "run:1",
                "messages": [{"id": "user:1", "role": "user", "content": "介绍 AG-UI"}],
                "tools": [],
                "context": [],
                "state": {},
            }
        )
        events = [
            event
            async for event in stream_agui_text_events(
                request,
                load_settings(),
                fake_text_generator,
            )
        ]

        self.assertEqual("介绍 AG-UI", calls[0][1])
        self.assertEqual("RUN_STARTED", events[0]["type"])
        self.assertEqual("RUN_FINISHED", events[-1]["type"])
        self.assertEqual(
            "这是纯 AG-UI。",
            "".join(event.get("delta", "") for event in events),
        )
        self.assertFalse(any(event["type"] in {"CUSTOM", "RAW"} for event in events))

    async def test_standalone_a2ui_returns_protocol_messages_and_accepts_actions(self) -> None:
        calls: list[tuple[list[dict[str, str]], str]] = []

        async def fake_surface_generator(settings, history, latest_input):
            calls.append((history, latest_input))
            return AgUiModelGeneration(
                surface=_surface(),
                model="deepseek-test",
                usage={"total_tokens": 20},
                response_id="response-test",
            )

        capabilities = {
            "v0.9.1": {"supportedCatalogIds": [A2UI_BASIC_CATALOG_ID]}
        }
        first = await generate_a2ui_response(
            A2UiGenerateRequest.model_validate(
                {
                    "sessionId": "session:pure-a2ui",
                    "prompt": "生成确认界面",
                    "clientCapabilities": capabilities,
                }
            ),
            load_settings(),
            fake_surface_generator,
        )
        second = await generate_a2ui_response(
            A2UiGenerateRequest.model_validate(
                {
                    "sessionId": "session:pure-a2ui",
                    "clientCapabilities": capabilities,
                    "clientMessage": {
                        "version": "v0.9.1",
                        "action": {
                            "name": "confirmed",
                            "surfaceId": "agent-surface",
                            "sourceComponentId": "submit",
                            "timestamp": "2026-08-10T00:00:00.000Z",
                        },
                    },
                    "clientDataModel": {
                        "version": "v0.9.1",
                        "surfaces": {"agent-surface": {"title": "真实 A2UI 示例"}},
                    },
                }
            ),
            load_settings(),
            fake_surface_generator,
        )

        self.assertEqual("生成确认界面", calls[0][1])
        self.assertEqual("生成确认界面", calls[1][0][0]["content"])
        self.assertIn('"name":"confirmed"', calls[1][1])
        self.assertEqual(3, len(first["messages"]))
        self.assertEqual("deepseek-test", second["model"])

    async def test_standalone_a2ui_rejects_an_unsupported_catalog(self) -> None:
        request = A2UiGenerateRequest.model_validate(
            {
                "sessionId": "session:bad-catalog",
                "prompt": "生成界面",
                "clientCapabilities": {
                    "v0.9.1": {"supportedCatalogIds": ["https://example.com/catalog.json"]}
                },
            }
        )

        with self.assertRaisesRegex(ValueError, "required Basic Catalog"):
            await generate_a2ui_response(request, load_settings())


if __name__ == "__main__":
    unittest.main()
