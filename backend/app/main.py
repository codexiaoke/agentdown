"""FastAPI app exposing real SSE endpoints for mainstream agent frameworks."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.agno_state import get_agno_paused_run_store
from app.models import (
    AgnoPausedRunResponse,
    AgnoRequirementResolutionRequest,
    HealthResponse,
    StreamRequest,
)
from app.providers import PROVIDER_REGISTRY
from app.providers.agno import stream_agno_requirement_resolution
from app.providers.base import ProviderContext, create_provider_descriptors
from app.settings import load_settings
from app.sse import create_sse_response

settings = load_settings()
provider_descriptors = create_provider_descriptors()

app = FastAPI(
    title="Agentdown FastAPI Backend",
    version="0.1.0",
    description="Real SSE backend for Agno, LangChain, AutoGen, and CrewAI using DeepSeek.",
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


@app.post("/api/stream/{provider_id}")
async def stream_provider(provider_id: str, request: StreamRequest) -> object:
    """Open an SSE stream for the requested real provider endpoint."""

    factory = PROVIDER_REGISTRY.get(provider_id)

    if factory is None:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")

    return create_sse_response(factory(ProviderContext(request=request, settings=settings)))


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
