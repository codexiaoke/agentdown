"""Redis-backed storage helpers for paused AutoGen HITL sessions."""

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
class AutoGenPausedSessionRecord:
    """Serialized paused AutoGen team state persisted by the backend."""

    session_id: str
    status: str
    team_state: dict[str, Any]
    request_payload: dict[str, Any]
    saved_at: str

    def to_dict(self) -> dict[str, Any]:
        """Convert the paused session record into a JSON-safe dictionary."""

        return {
            "session_id": self.session_id,
            "status": self.status,
            "team_state": self.team_state,
            "request_payload": self.request_payload,
            "saved_at": self.saved_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AutoGenPausedSessionRecord":
        """Rebuild a paused session record from a stored dictionary payload."""

        return cls(
            session_id=str(data["session_id"]),
            status=str(data.get("status") or "paused"),
            team_state=dict(data.get("team_state") or {}),
            request_payload=dict(data.get("request_payload") or {}),
            saved_at=str(data.get("saved_at") or _utc_now_iso()),
        )


class AutoGenPausedSessionStore(Protocol):
    """Storage contract used by the backend to persist paused AutoGen sessions."""

    async def save(self, record: AutoGenPausedSessionRecord) -> None:
        """Persist or update a paused session record."""

    async def load(self, session_id: str) -> AutoGenPausedSessionRecord | None:
        """Load a paused session record by session id."""

    async def delete(self, session_id: str) -> None:
        """Delete a paused session record when the team has resumed or finished."""


class InMemoryAutoGenPausedSessionStore:
    """Small in-process fallback store used when Redis is unavailable."""

    def __init__(self) -> None:
        """Create an empty in-memory paused session store."""

        self._records: dict[str, AutoGenPausedSessionRecord] = {}

    async def save(self, record: AutoGenPausedSessionRecord) -> None:
        """Persist or update a paused session record in memory."""

        self._records[record.session_id] = record

    async def load(self, session_id: str) -> AutoGenPausedSessionRecord | None:
        """Load a paused session record from memory."""

        return self._records.get(session_id)

    async def delete(self, session_id: str) -> None:
        """Delete a paused session record from memory."""

        self._records.pop(session_id, None)


class RedisAutoGenPausedSessionStore:
    """Redis-backed paused session store used for real AutoGen HITL recovery."""

    def __init__(self, redis_url: str, ttl_seconds: int) -> None:
        """Create a Redis paused session store using the configured URL and TTL."""

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

    def _build_key(self, session_id: str) -> str:
        """Return the Redis key used for a paused AutoGen session."""

        return f"agentdown:autogen:paused-session:{session_id}"

    async def save(self, record: AutoGenPausedSessionRecord) -> None:
        """Persist or update a paused session record in Redis."""

        client = await self._get_client()
        payload = json.dumps(record.to_dict(), ensure_ascii=False, separators=(",", ":"))
        await client.set(self._build_key(record.session_id), payload, ex=self._ttl_seconds)

    async def load(self, session_id: str) -> AutoGenPausedSessionRecord | None:
        """Load a paused session record from Redis."""

        client = await self._get_client()
        raw_payload = await client.get(self._build_key(session_id))

        if not raw_payload:
            return None

        parsed_payload = json.loads(raw_payload)
        return AutoGenPausedSessionRecord.from_dict(parsed_payload)

    async def delete(self, session_id: str) -> None:
        """Delete a paused session record from Redis."""

        client = await self._get_client()
        await client.delete(self._build_key(session_id))


_cached_store: AutoGenPausedSessionStore | None = None
_cached_store_key: tuple[str, str | None, int] | None = None


def create_autogen_paused_session_store(settings: BackendSettings) -> AutoGenPausedSessionStore:
    """Create a paused session store from the current backend settings."""

    if settings.autogen_paused_run_store == "redis" and settings.redis_url:
        return RedisAutoGenPausedSessionStore(
            redis_url=settings.redis_url,
            ttl_seconds=settings.autogen_paused_run_ttl_seconds,
        )

    return InMemoryAutoGenPausedSessionStore()


def get_autogen_paused_session_store(settings: BackendSettings) -> AutoGenPausedSessionStore:
    """Return a cached paused session store instance for the current process."""

    global _cached_store
    global _cached_store_key

    cache_key = (
        settings.autogen_paused_run_store,
        settings.redis_url,
        settings.autogen_paused_run_ttl_seconds,
    )

    if _cached_store is None or _cached_store_key != cache_key:
        _cached_store = create_autogen_paused_session_store(settings)
        _cached_store_key = cache_key

    return _cached_store
