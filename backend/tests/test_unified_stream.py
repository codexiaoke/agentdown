"""Tests for the framework-selecting unified streaming gateway."""

from __future__ import annotations

import os
import unittest
from typing import Any
from unittest.mock import patch

from fastapi import Response
from httpx import ASGITransport, AsyncClient

from app.conversation_state import conversation_event_store
from app.main import PROVIDER_REGISTRY, app
from app.providers.base import ProviderContext, create_provider_descriptors
from app.settings import sanitize_httpx_proxy_environment


class UnifiedStreamTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        await conversation_event_store.clear()

    async def asyncTearDown(self) -> None:
        await conversation_event_store.clear()

    async def test_framework_query_dispatches_to_registered_adapter(self) -> None:
        captured: list[ProviderContext] = []

        async def fake_langchain(context: ProviderContext):
            captured.append(context)
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": {"content": "你好"}},
            }

        transport = ASGITransport(app=app)
        with patch.dict(PROVIDER_REGISTRY, {"langchain": fake_langchain}):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/stream/chat?framework=langchain",
                    json={
                        "message": "hello",
                        "session_id": "session:unified:langchain",
                        "client_request_id": "request:unified:langchain",
                        "mode": "hitl",
                    },
                )

                self.assertEqual(200, response.status_code)
                self.assertIn("on_chat_model_stream", response.text)
                self.assertEqual(1, len(captured))
                self.assertEqual("session:unified:langchain", captured[0].request.session_id)
                self.assertEqual("hitl", captured[0].request.mode)

                archive = await client.get(
                    "/api/v1/conversations/session%3Aunified%3Alangchain?framework=langchain"
                )
                self.assertEqual(200, archive.status_code)
                self.assertEqual("langchain", archive.json()["provider_id"])

    async def test_springai_uses_gateway_instead_of_a_frontend_port(self) -> None:
        captured: dict[str, Any] = {}

        async def fake_proxy(payload, settings, *, idempotency_key, last_event_id):
            captured.update({
                "payload": payload,
                "base_url": settings.spring_ai_base_url,
                "idempotency_key": idempotency_key,
                "last_event_id": last_event_id,
            })
            return Response(content="data: spring\n\n", media_type="text/event-stream")

        transport = ASGITransport(app=app)
        with patch("app.main.proxy_springai_stream", new=fake_proxy):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/stream/chat?framework=springai",
                    json={"message": "weather", "session_id": "session:spring"},
                    headers={
                        "Idempotency-Key": "request:spring",
                        "Last-Event-ID": "session:spring:2",
                    },
                )

        self.assertEqual(200, response.status_code)
        self.assertEqual({"message": "weather", "session_id": "session:spring"}, captured["payload"])
        self.assertEqual("http://127.0.0.1:8080", captured["base_url"])
        self.assertEqual("request:spring", captured["idempotency_key"])
        self.assertEqual("session:spring:2", captured["last_event_id"])

    async def test_unknown_or_mismatched_framework_request_is_rejected(self) -> None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            unknown = await client.post(
                "/api/stream/chat?framework=unknown",
                json={"message": "hello"},
            )
            mismatch = await client.post(
                "/api/stream/chat?framework=langchain",
                json={
                    "threadId": "thread:agui",
                    "runId": "run:agui",
                    "messages": [],
                },
            )
            removed_route = await client.post(
                "/api/stream/langchain",
                json={"message": "hello"},
            )

        self.assertEqual(404, unknown.status_code)
        self.assertEqual(422, mismatch.status_code)
        self.assertEqual(404, removed_route.status_code)

    def test_every_descriptor_uses_the_same_public_path(self) -> None:
        descriptors = create_provider_descriptors()

        self.assertEqual(
            {"agui", "agno", "springai", "langchain", "autogen", "crewai"},
            {descriptor.id for descriptor in descriptors},
        )
        self.assertTrue(all(
            descriptor.path.startswith("/api/stream/chat?framework=")
            for descriptor in descriptors
        ))

    def test_invalid_ipv6_no_proxy_entries_are_removed_for_framework_sdks(self) -> None:
        with patch.dict(
            os.environ,
            {
                "NO_PROXY": "127.0.0.1,localhost,::1,::1/128",
                "no_proxy": "127.0.0.1,localhost,::1,::1/128",
            },
        ):
            sanitize_httpx_proxy_environment()

            self.assertEqual("127.0.0.1,localhost", os.environ["NO_PROXY"])
            self.assertEqual("127.0.0.1,localhost", os.environ["no_proxy"])


if __name__ == "__main__":
    unittest.main()
