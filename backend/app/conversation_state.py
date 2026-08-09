"""Backend-authoritative conversation event storage and resumable run coordination."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
import asyncio
import hashlib
import json
from typing import Any


class ConversationConflictError(ValueError):
    """Raised when an idempotency key is reused for a different operation."""


@dataclass(frozen=True, slots=True)
class StoredConversationEvent:
    """One immutable raw provider event in a conversation event log."""

    cursor: int
    event_id: str
    request_id: str
    event: str | None
    data: dict[str, Any]
    created_at: str

    def as_dict(self) -> dict[str, Any]:
        """Return the public JSON representation used by archive endpoints."""

        return {
            "cursor": self.cursor,
            "event_id": self.event_id,
            "request_id": self.request_id,
            "event": self.event,
            "data": self.data,
            "created_at": self.created_at,
        }


@dataclass(slots=True)
class ConversationRun:
    """One idempotent producer execution attached to a conversation."""

    request_id: str
    fingerprint: str
    start_cursor: int
    status: str = "running"
    end_cursor: int | None = None
    task: asyncio.Task[None] | None = None


@dataclass(slots=True)
class ConversationRecord:
    """Mutable state for one backend-owned conversation."""

    conversation_id: str
    provider_id: str
    events: list[StoredConversationEvent] = field(default_factory=list)
    runs: dict[str, ConversationRun] = field(default_factory=dict)
    condition: asyncio.Condition = field(default_factory=asyncio.Condition)
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    @property
    def latest_cursor(self) -> int:
        """Return the latest committed event cursor."""

        return self.events[-1].cursor if self.events else 0


ProviderEventFactory = Callable[[], AsyncIterator[dict[str, Any]]]


def fingerprint_request(payload: dict[str, Any]) -> str:
    """Create a stable fingerprint for idempotency conflict detection."""

    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def infer_event_name(payload: dict[str, Any]) -> str | None:
    """Resolve the raw provider event name without changing its payload."""

    for key in ("event", "type", "chunk_type", "status"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


class ConversationEventStore:
    """In-process reference store for resumable backend conversation streams.

    The API is intentionally storage-oriented so a production backend can replace
    this implementation with PostgreSQL/Redis without changing HTTP semantics.
    """

    def __init__(self) -> None:
        self._conversations: dict[str, ConversationRecord] = {}
        self._lock = asyncio.Lock()

    async def open_run(
        self,
        *,
        conversation_id: str,
        provider_id: str,
        request_id: str,
        request_payload: dict[str, Any],
        event_factory: ProviderEventFactory,
    ) -> tuple[ConversationRecord, ConversationRun, bool]:
        """Create a producer task or reuse the run identified by request_id."""

        fingerprint = fingerprint_request(request_payload)

        async with self._lock:
            conversation = self._conversations.get(conversation_id)
            if conversation is None:
                conversation = ConversationRecord(conversation_id, provider_id)
                self._conversations[conversation_id] = conversation
            elif conversation.provider_id != provider_id:
                raise ConversationConflictError(
                    f"Conversation {conversation_id} belongs to provider "
                    f"{conversation.provider_id}, not {provider_id}."
                )

            existing = conversation.runs.get(request_id)
            if existing is not None:
                if existing.fingerprint != fingerprint:
                    raise ConversationConflictError(
                        f"Idempotency key {request_id} was already used with a different request."
                    )
                return conversation, existing, True

            run = ConversationRun(
                request_id=request_id,
                fingerprint=fingerprint,
                start_cursor=conversation.latest_cursor,
            )
            conversation.runs[request_id] = run
            run.task = asyncio.create_task(
                self._produce(conversation, run, event_factory),
                name=f"agentdown:{conversation_id}:{request_id}",
            )
            return conversation, run, False

    async def _produce(
        self,
        conversation: ConversationRecord,
        run: ConversationRun,
        event_factory: ProviderEventFactory,
    ) -> None:
        """Consume a provider independently from any individual HTTP client."""

        try:
            async for payload in event_factory():
                await self._append(conversation, run.request_id, payload)
            run.status = "completed"
        except asyncio.CancelledError:
            run.status = "cancelled"
            raise
        except Exception as error:  # pragma: no cover - providers normally emit errors
            await self._append(
                conversation,
                run.request_id,
                {"event": "error", "data": {"message": str(error)}},
            )
            run.status = "failed"
        finally:
            async with conversation.condition:
                run.end_cursor = conversation.latest_cursor
                conversation.updated_at = datetime.now(UTC).isoformat()
                conversation.condition.notify_all()

    async def _append(
        self,
        conversation: ConversationRecord,
        request_id: str,
        payload: dict[str, Any],
    ) -> StoredConversationEvent:
        """Atomically append one event and wake every reconnecting subscriber."""

        async with conversation.condition:
            cursor = conversation.latest_cursor + 1
            stored = StoredConversationEvent(
                cursor=cursor,
                event_id=f"{conversation.conversation_id}:{cursor}",
                request_id=request_id,
                event=infer_event_name(payload),
                data=payload,
                created_at=datetime.now(UTC).isoformat(),
            )
            conversation.events.append(stored)
            conversation.updated_at = stored.created_at
            conversation.condition.notify_all()
            return stored

    async def subscribe(
        self,
        conversation: ConversationRecord,
        run: ConversationRun,
        *,
        after_cursor: int,
    ) -> AsyncIterator[StoredConversationEvent]:
        """Replay missing run events and then follow the producer until terminal."""

        next_cursor = after_cursor
        while True:
            async with conversation.condition:
                pending = [
                    event
                    for event in conversation.events
                    if event.cursor > next_cursor and event.request_id == run.request_id
                ]

                if not pending and run.status != "running":
                    return

                if not pending:
                    await conversation.condition.wait()
                    continue

            for event in pending:
                next_cursor = max(next_cursor, event.cursor)
                yield event

    async def get(self, conversation_id: str) -> ConversationRecord | None:
        """Load a conversation without creating it."""

        async with self._lock:
            return self._conversations.get(conversation_id)

    async def clear(self) -> None:
        """Cancel producers and clear state; intended for tests."""

        async with self._lock:
            tasks = [
                run.task
                for conversation in self._conversations.values()
                for run in conversation.runs.values()
                if run.task is not None and not run.task.done()
            ]
            self._conversations.clear()

        for task in tasks:
            task.cancel()


conversation_event_store = ConversationEventStore()
