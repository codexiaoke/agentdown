"""FastAPI app exposing real SSE endpoints for mainstream agent frameworks."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from app.agno_state import get_agno_paused_run_store
from app.models import (
    AgUiRunAgentInput,
    AgnoPausedRunResponse,
    AgnoRequirementResolutionRequest,
    HealthResponse,
    StreamRequest,
    ConversationArchiveResponse,
    ConversationEventResponse,
)
from app.providers import PROVIDER_REGISTRY
from app.providers.agno import stream_agno_requirement_resolution
from app.examples.a2ui_deepseek import (
    A2UiGenerateRequest,
    A2UiRequestConflictError,
    generate_a2ui_response,
)
from app.examples.agui_a2ui_deepseek import stream_agui_events
from app.examples.agui_deepseek import stream_agui_text_events
from app.providers.base import ProviderContext, create_provider_descriptors
from app.providers.springai import (
    load_springai_archive,
    proxy_springai_stream,
    reconnect_springai_events,
)
from app.settings import load_settings
from app.conversation_state import ConversationConflictError, conversation_event_store
from app.sse import create_resumable_sse_response, create_sse_response

settings = load_settings()
provider_descriptors = create_provider_descriptors()

app = FastAPI(
    title="Agentdown FastAPI Backend",
    version="0.1.0",
    description="SSE backend for AG-UI/A2UI plus Agno, LangChain, AutoGen, and CrewAI adapters.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=HealthResponse)
async def read_root() -> HealthResponse:
    """Return a lightweight index payload so the backend is self-describing."""

    return HealthResponse(
        service="agentdown-fastapi-backend",
        providers=provider_descriptors,
    )


@app.get("/api/health", response_model=HealthResponse)
async def read_health() -> HealthResponse:
    """Expose a dedicated health endpoint for local tooling."""

    return await read_root()


def parse_event_cursor(value: str | None) -> int | None:
    """Parse either a plain numeric cursor or the suffix of an SSE event id."""

    if not value:
        return None
    candidate = value.rsplit(":", maxsplit=1)[-1]
    try:
        cursor = int(candidate)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Last-Event-ID must end in a non-negative cursor.") from error
    if cursor < 0:
        raise HTTPException(status_code=422, detail="Last-Event-ID cursor must be non-negative.")
    return cursor


@app.post("/api/stream/chat")
async def stream_chat(
    payload: dict[str, Any],
    framework: str = Query(default="agui", min_length=1),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> object:
    """Dispatch every demo framework through one public streaming endpoint."""

    framework_id = framework.strip().lower()

    if framework_id == "springai":
        return await proxy_springai_stream(
            payload,
            settings,
            idempotency_key=idempotency_key,
            last_event_id=last_event_id,
        )

    if framework_id != "agui":
        return await _stream_registered_provider(
            framework_id,
            payload,
            idempotency_key=idempotency_key,
            last_event_id=last_event_id,
        )

    try:
        request = AgUiRunAgentInput.model_validate(payload)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_url=False)) from error

    conversation_id = request.thread_id
    request_id = idempotency_key or request.run_id
    after_cursor = parse_event_cursor(last_event_id) or 0
    request_payload = request.model_dump(mode="json", by_alias=True, exclude_none=True)

    try:
        conversation, run, reused = await conversation_event_store.open_run(
            conversation_id=conversation_id,
            provider_id="agui",
            request_id=request_id,
            request_payload=request_payload,
            event_factory=lambda: stream_agui_events(request, settings),
        )
    except ConversationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return create_resumable_sse_response(
        conversation_event_store.subscribe(conversation, run, after_cursor=after_cursor),
        conversation_id=conversation_id,
        request_id=request_id,
        reused=reused,
    )


@app.post("/api/examples/agui")
async def stream_pure_agui_example(request: AgUiRunAgentInput) -> object:
    """Run the pure AG-UI consumer example against a real DeepSeek completion."""

    return create_sse_response(stream_agui_text_events(request, settings))


@app.post("/api/examples/a2ui")
async def generate_pure_a2ui_example(
    request: A2UiGenerateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict[str, object]:
    """Run the standalone A2UI consumer example without AG-UI transport semantics."""

    if idempotency_key and request.request_id and idempotency_key != request.request_id:
        raise HTTPException(status_code=409, detail="A2UI request id does not match Idempotency-Key.")
    resolved_request = request.model_copy(
        update={"request_id": idempotency_key or request.request_id}
    )
    try:
        return await generate_a2ui_response(resolved_request, settings)
    except A2UiRequestConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


async def _stream_registered_provider(
    provider_id: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None,
    last_event_id: str | None,
) -> object:
    """Start or reconnect to a registered framework run."""

    factory = PROVIDER_REGISTRY.get(provider_id)

    if factory is None:
        raise HTTPException(status_code=404, detail=f"Unknown framework: {provider_id}")

    resume_keys = ("agno_resume", "langchain_resume", "autogen_resume")
    if "message" not in payload and not any(key in payload for key in resume_keys):
        raise HTTPException(
            status_code=422,
            detail=f"The {provider_id} request requires `message` or a framework resume payload.",
        )

    try:
        request = StreamRequest.model_validate(payload)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_url=False)) from error

    conversation_id = request.session_id or f"session:{uuid4()}"
    request_id = idempotency_key or request.client_request_id or f"request:{uuid4()}"
    after_cursor = parse_event_cursor(last_event_id)
    if after_cursor is None:
        after_cursor = request.after_cursor

    provider_request = request.model_copy(update={
        "session_id": conversation_id,
        "client_request_id": request_id,
        "after_cursor": 0,
    })
    request_payload = provider_request.model_dump(
        mode="json",
        exclude={"after_cursor"},
        exclude_none=True,
    )

    try:
        conversation, run, reused = await conversation_event_store.open_run(
            conversation_id=conversation_id,
            provider_id=provider_id,
            request_id=request_id,
            request_payload=request_payload,
            event_factory=lambda: factory(ProviderContext(request=provider_request, settings=settings)),
        )
    except ConversationConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return create_resumable_sse_response(
        conversation_event_store.subscribe(conversation, run, after_cursor=after_cursor),
        conversation_id=conversation_id,
        request_id=request_id,
        reused=reused,
    )


@app.get(
    "/api/v1/conversations/{conversation_id}",
    response_model=ConversationArchiveResponse,
)
async def read_conversation_archive(
    conversation_id: str,
    framework: str | None = Query(default=None),
) -> ConversationArchiveResponse:
    """Return the authoritative raw event archive used for page recovery."""

    if framework and framework.strip().lower() == "springai":
        spring_archive = await load_springai_archive(conversation_id, settings)

        if spring_archive is None:
            raise HTTPException(status_code=404, detail=f"Conversation not found: {conversation_id}")

        return spring_archive

    conversation = await conversation_event_store.get(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail=f"Conversation not found: {conversation_id}")

    statuses = [run.status for run in conversation.runs.values()]
    status = "running" if "running" in statuses else (statuses[-1] if statuses else "empty")
    active_request_id = next(
        (
            run.request_id
            for run in reversed(list(conversation.runs.values()))
            if run.status == "running"
        ),
        None,
    )
    return ConversationArchiveResponse(
        conversation_id=conversation.conversation_id,
        provider_id=conversation.provider_id,
        latest_cursor=conversation.latest_cursor,
        status=status,
        active_request_id=active_request_id,
        updated_at=conversation.updated_at,
        events=[ConversationEventResponse(**event.as_dict()) for event in conversation.events],
    )


@app.get("/api/v1/conversations/{conversation_id}/events")
async def reconnect_conversation_events(
    conversation_id: str,
    request_id: str = Query(min_length=1),
    framework: str | None = Query(default=None),
    after_cursor: int = Query(default=0, ge=0),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> object:
    """Attach to an existing run without resubmitting its original request."""

    resolved_cursor = parse_event_cursor(last_event_id)
    if resolved_cursor is None:
        resolved_cursor = after_cursor

    if framework and framework.strip().lower() == "springai":
        return await reconnect_springai_events(
            conversation_id,
            request_id,
            resolved_cursor,
            last_event_id,
            settings,
        )

    loaded = await conversation_event_store.get_run(conversation_id, request_id)
    if loaded is None:
        raise HTTPException(
            status_code=404,
            detail=f"Conversation run not found: {conversation_id}/{request_id}",
        )
    conversation, run = loaded
    return create_resumable_sse_response(
        conversation_event_store.subscribe(conversation, run, after_cursor=resolved_cursor),
        conversation_id=conversation_id,
        request_id=request_id,
        reused=True,
    )


@app.get("/api/agno/runs/{run_id}", response_model=AgnoPausedRunResponse)
async def read_agno_paused_run(run_id: str) -> AgnoPausedRunResponse:
    """Return a lightweight summary for a paused Agno HITL run."""

    paused_run_store = get_agno_paused_run_store(settings)
    paused_record = await paused_run_store.load(run_id)

    if paused_record is None:
        raise HTTPException(status_code=404, detail=f"Paused Agno run not found: {run_id}")

    return AgnoPausedRunResponse(
        run_id=paused_record.run_id,
        session_id=paused_record.session_id,
        agent_key=paused_record.agent_key,
        status=paused_record.status,
        requirement_ids=paused_record.requirement_ids,
    )


@app.post("/api/agno/runs/{run_id}/requirements/{requirement_id}/resolve")
async def resolve_agno_requirement(
    run_id: str,
    requirement_id: str,
    request: AgnoRequirementResolutionRequest,
) -> object:
    """Resolve a paused Agno requirement and resume the run as an SSE stream."""

    return create_sse_response(
        stream_agno_requirement_resolution(
            run_id=run_id,
            requirement_id=requirement_id,
            resolution=request,
            settings=settings,
        )
    )
