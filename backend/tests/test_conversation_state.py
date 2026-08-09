"""Tests for backend-authoritative conversation replay semantics."""

from __future__ import annotations

import asyncio
import unittest

from app.conversation_state import ConversationConflictError, ConversationEventStore


class ConversationEventStoreTest(unittest.IsolatedAsyncioTestCase):
    """Exercise disconnect, replay, idempotency, and conflict behavior."""

    async def asyncSetUp(self) -> None:
        self.store = ConversationEventStore()

    async def asyncTearDown(self) -> None:
        await self.store.clear()

    async def test_producer_survives_subscriber_disconnect_and_replays_only_missing_events(self) -> None:
        release_second_event = asyncio.Event()

        async def provider():
            yield {"event": "response.delta", "data": {"content": "A"}}
            await release_second_event.wait()
            yield {"event": "response.delta", "data": {"content": "B"}}
            yield {"event": "done", "data": {}}

        conversation, run, reused = await self.store.open_run(
            conversation_id="session:test",
            provider_id="springai",
            request_id="request:1",
            request_payload={"session_id": "session:test", "message": "hello"},
            event_factory=provider,
        )
        self.assertFalse(reused)

        first_subscription = self.store.subscribe(conversation, run, after_cursor=0)
        first_event = await anext(first_subscription)
        self.assertEqual(1, first_event.cursor)
        await first_subscription.aclose()

        release_second_event.set()
        assert run.task is not None
        await run.task

        same_conversation, same_run, reused = await self.store.open_run(
            conversation_id="session:test",
            provider_id="springai",
            request_id="request:1",
            request_payload={"session_id": "session:test", "message": "hello"},
            event_factory=provider,
        )
        replay = [
            event
            async for event in self.store.subscribe(
                same_conversation,
                same_run,
                after_cursor=first_event.cursor,
            )
        ]

        self.assertTrue(reused)
        self.assertIs(run, same_run)
        self.assertEqual([2, 3], [event.cursor for event in replay])
        self.assertEqual(["B", None], [event.data.get("data", {}).get("content") for event in replay])
        self.assertEqual("completed", run.status)

    async def test_same_idempotency_key_rejects_a_different_request(self) -> None:
        async def provider():
            if False:
                yield {}

        _, run, _ = await self.store.open_run(
            conversation_id="session:test",
            provider_id="agno",
            request_id="request:1",
            request_payload={"message": "first"},
            event_factory=provider,
        )
        assert run.task is not None
        await run.task

        with self.assertRaises(ConversationConflictError):
            await self.store.open_run(
                conversation_id="session:test",
                provider_id="agno",
                request_id="request:1",
                request_payload={"message": "changed"},
                event_factory=provider,
            )

    async def test_conversation_cannot_switch_provider(self) -> None:
        async def provider():
            if False:
                yield {}

        _, run, _ = await self.store.open_run(
            conversation_id="session:test",
            provider_id="agno",
            request_id="request:1",
            request_payload={},
            event_factory=provider,
        )
        assert run.task is not None
        await run.task

        with self.assertRaises(ConversationConflictError):
            await self.store.open_run(
                conversation_id="session:test",
                provider_id="langchain",
                request_id="request:2",
                request_payload={},
                event_factory=provider,
            )

    async def test_existing_run_can_be_loaded_without_reopening_its_request(self) -> None:
        release = asyncio.Event()

        async def provider():
            yield {"event": "response.delta", "data": {"content": "A"}}
            await release.wait()

        conversation, run, _ = await self.store.open_run(
            conversation_id="session:test",
            provider_id="springai",
            request_id="request:running",
            request_payload={"message": "secret original body"},
            event_factory=provider,
        )
        first = await anext(self.store.subscribe(conversation, run, after_cursor=0))

        loaded = await self.store.get_run("session:test", "request:running")

        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertIs(conversation, loaded[0])
        self.assertIs(run, loaded[1])
        self.assertEqual(1, first.cursor)
        release.set()
        assert run.task is not None
        await run.task


if __name__ == "__main__":
    unittest.main()
