"""FastAPI app exposing real SSE endpoints for mainstream agent frameworks."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import HealthResponse, StreamRequest
from app.providers import PROVIDER_REGISTRY
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
