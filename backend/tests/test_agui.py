"""End-to-end tests for the in-memory AG-UI + A2UI example."""

from __future__ import annotations

import json
import unittest

from httpx import ASGITransport, AsyncClient

from app.conversation_state import conversation_event_store
from app.main import app
from app.models import AgUiRunAgentInput
from app.providers.agui import stream_agui_events


def _run_input(*, run_id: str = "run-1", forwarded_props: object | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "threadId": "thread:agui:test",
        "runId": run_id,
        "messages": [
            {
                "id": f"message:user:{run_id}",
                "role": "user",
                "content": "请做一个杭州周末计划",
            }
        ],
        "tools": [],
        "context": [],
        "state": {},
    }
    if forwarded_props is not None:
        payload["forwardedProps"] = forwarded_props
    return payload


def _parse_sse_events(body: str) -> list[dict[str, object]]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


class AgUiProviderTest(unittest.IsolatedAsyncioTestCase):
    """Verify standard events, A2UI actions, and backend-owned recovery."""

    async def asyncSetUp(self) -> None:
        await conversation_event_store.clear()

    async def asyncTearDown(self) -> None:
        await conversation_event_store.clear()

    async def test_provider_streams_standard_lifecycle_and_a2ui_surface(self) -> None:
        request = AgUiRunAgentInput.model_validate(_run_input())
        events = [event async for event in stream_agui_events(request)]

        self.assertEqual("RUN_STARTED", events[0]["type"])
        self.assertEqual("RUN_FINISHED", events[-1]["type"])
        self.assertIn("TOOL_CALL_RESULT", [event["type"] for event in events])

        a2ui_values = [
            event["value"]
            for event in events
            if event["type"] == "CUSTOM" and event.get("name") == "a2ui"
        ]
        self.assertEqual(3, len(a2ui_values))
        self.assertIn("createSurface", a2ui_values[0])
        self.assertIn("updateComponents", a2ui_values[1])
        self.assertEqual("杭州", a2ui_values[2]["updateDataModel"]["value"]["city"])

    async def test_a2ui_action_returns_a_confirmed_surface(self) -> None:
        action = {
            "name": "trip_submitted",
            "surfaceId": "trip-planner",
            "sourceComponentId": "submit",
            "timestamp": "2026-08-09T10:00:00.000Z",
            "context": {"city": "成都", "days": 4, "pace": ["均衡"]},
        }
        request = AgUiRunAgentInput.model_validate(
            _run_input(
                run_id="run-action",
                forwarded_props={"a2ui": {"version": "v0.9", "action": action}},
            )
        )
        events = [event async for event in stream_agui_events(request)]
        data_message = next(
            event["value"]["updateDataModel"]
            for event in events
            if event["type"] == "CUSTOM" and "updateDataModel" in event["value"]
        )

        self.assertEqual("成都", data_message["value"]["city"])
        self.assertEqual(4, data_message["value"]["days"])
        self.assertTrue(data_message["value"]["confirmed"])

    async def test_http_stream_is_archived_and_idempotently_replayed(self) -> None:
        transport = ASGITransport(app=app)
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


if __name__ == "__main__":
    unittest.main()
