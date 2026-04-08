"""Redis-backed storage helpers for paused Agno HITL runs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from typing import Any, Protocol

from app.settings import BackendSettings


def _utc_now_iso() -> str:
    """Return the current UTC timestamp encoded as an ISO-8601 string."""

    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class AgnoPausedRunRecord:
    """Serialized paused Agno run data persisted by the backend."""

    run_id: str
    session_id: str | None
    agent_key: str
    status: str
    requirement_ids: list[str]
    run_output: dict[str, Any]
    request_payload: dict[str, Any]
    saved_at: str

    def to_dict(self) -> dict[str, Any]:
        """Convert the paused run record into a JSON-safe dictionary."""

        return {
            "run_id": self.run_id,
            "session_id": self.session_id,
            "agent_key": self.agent_key,
            "status": self.status,
            "requirement_ids": self.requirement_ids,
            "run_output": self.run_output,
            "request_payload": self.request_payload,
            "saved_at": self.saved_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AgnoPausedRunRecord":
        """Rebuild a paused run record from a stored dictionary payload."""

        return cls(
            run_id=str(data["run_id"]),
            session_id=data.get("session_id"),
            agent_key=str(data.get("agent_key") or "default"),
            status=str(data.get("status") or "paused"),
            requirement_ids=[str(value) for value in data.get("requirement_ids") or []],
            run_output=dict(data.get("run_output") or {}),
            request_payload=dict(data.get("request_payload") or {}),
            saved_at=str(data.get("saved_at") or _utc_now_iso()),
        )


class AgnoPausedRunStore(Protocol):
    """Storage contract used by the backend to persist paused Agno runs."""

    async def save(self, record: AgnoPausedRunRecord) -> None:
        """Persist or update a paused run record."""

    async def load(self, run_id: str) -> AgnoPausedRunRecord | None:
        """Load a paused run record by run id."""

    async def delete(self, run_id: str) -> None:
        """Delete a paused run record when the run has resumed or finished."""


class InMemoryAgnoPausedRunStore:
    """Small in-process fallback store used when Redis is unavailable."""

    def __init__(self) -> None:
        """Create an empty in-memory paused run store."""

        self._records: dict[str, AgnoPausedRunRecord] = {}

    async def save(self, record: AgnoPausedRunRecord) -> None:
        """Persist or update a paused run record in memory."""

        self._records[record.run_id] = record

    async def load(self, run_id: str) -> AgnoPausedRunRecord | None:
        """Load a paused run record from memory."""

        return self._records.get(run_id)

    async def delete(self, run_id: str) -> None:
        """Delete a paused run record from memory."""

        self._records.pop(run_id, None)


class RedisAgnoPausedRunStore:
    """Redis-backed paused run store used for real Agno HITL recovery."""

    def __init__(self, redis_url: str, ttl_seconds: int) -> None:
        """Create a Redis paused run store using the configured URL and TTL."""

        self._redis_url = redis_url
        self._ttl_seconds = ttl_seconds
        self._client: Any | None = None

    async def _get_client(self) -> Any:
        """Create or reuse the internal Redis client lazily."""

        if self._client is not None:
            return self._client

        from redis.asyncio import Redis

        self._client = Redis.from_url(self._redis_url, encoding="utf-8", decode_responses=True)
        return self._client

    def _build_key(self, run_id: str) -> str:
        """Return the Redis key used for a paused Agno run."""

        return f"agentdown:agno:paused-run:{run_id}"

    async def save(self, record: AgnoPausedRunRecord) -> None:
        """Persist or update a paused run record in Redis."""

        client = await self._get_client()
        payload = json.dumps(record.to_dict(), ensure_ascii=False, separators=(",", ":"))
        await client.set(self._build_key(record.run_id), payload, ex=self._ttl_seconds)

    async def load(self, run_id: str) -> AgnoPausedRunRecord | None:
        """Load a paused run record from Redis."""

        client = await self._get_client()
        raw_payload = await client.get(self._build_key(run_id))

        if not raw_payload:
            return None

        parsed_payload = json.loads(raw_payload)
        return AgnoPausedRunRecord.from_dict(parsed_payload)

    async def delete(self, run_id: str) -> None:
        """Delete a paused run record from Redis."""

        client = await self._get_client()
        await client.delete(self._build_key(run_id))


_cached_store: AgnoPausedRunStore | None = None
_cached_store_key: tuple[str, str | None, int] | None = None


def create_agno_paused_run_store(settings: BackendSettings) -> AgnoPausedRunStore:
    """Create a paused run store from the current backend settings."""

    if settings.agno_paused_run_store == "redis" and settings.redis_url:
        return RedisAgnoPausedRunStore(
            redis_url=settings.redis_url,
            ttl_seconds=settings.agno_paused_run_ttl_seconds,
        )

    return InMemoryAgnoPausedRunStore()


def get_agno_paused_run_store(settings: BackendSettings) -> AgnoPausedRunStore:
    """Return a cached paused run store instance for the current process."""

    global _cached_store
    global _cached_store_key

    cache_key = (
        settings.agno_paused_run_store,
        settings.redis_url,
        settings.agno_paused_run_ttl_seconds,
    )

    if _cached_store is None or _cached_store_key != cache_key:
        _cached_store = create_agno_paused_run_store(settings)
        _cached_store_key = cache_key

    return _cached_store
