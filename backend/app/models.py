"""Shared request and response models for the FastAPI backend."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class StreamRequest(BaseModel):
    """Common request body accepted by all real streaming endpoints."""

    message: str = Field(
        default="帮我查一下北京天气。",
        description="The user prompt passed to the agent framework.",
    )
    session_id: str | None = Field(
        default=None,
        description="Optional conversation/session id forwarded to the framework runtime.",
    )
    user_id: str | None = Field(
        default=None,
        description="Optional end-user id forwarded to the framework runtime.",
    )
    mode: str | None = Field(
        default=None,
        description="Optional provider mode switch, for example `hitl` for Agno human-in-the-loop flows.",
    )
    agno_resume: "AgnoStreamResumeRequest | None" = Field(
        default=None,
        description="Optional Agno resume payload used to continue a paused requirement on the same `/api/stream/agno` endpoint.",
    )
    langchain_resume: "LangChainStreamResumeRequest | None" = Field(
        default=None,
        description="Optional LangChain HITL resume payload used to continue a paused thread on the same `/api/stream/langchain` endpoint.",
    )
    autogen_resume: "AutoGenStreamResumeRequest | None" = Field(
        default=None,
        description="Optional AutoGen HITL resume payload used to continue a paused handoff session on the same `/api/stream/autogen` endpoint.",
    )


class AgnoRequirementResolutionRequest(BaseModel):
    """Payload used to resolve a paused Agno requirement and continue the run."""

    action: Literal[
        "approve",
        "reject",
        "submit_input",
        "submit_feedback",
        "submit_external_result",
    ] = Field(
        description="The resolution action applied to the target Agno requirement.",
    )
    note: str | None = Field(
        default=None,
        description="Optional note used for rejection or change explanations.",
    )
    values: dict[str, Any] | None = Field(
        default=None,
        description="User input values keyed by field name for `submit_input`.",
    )
    selections: dict[str, list[str]] | None = Field(
        default=None,
        description="User feedback selections keyed by question text for `submit_feedback`.",
    )
    result: str | None = Field(
        default=None,
        description="External execution result text for `submit_external_result`.",
    )


class AgnoStreamResumeRequest(AgnoRequirementResolutionRequest):
    """Agno resume payload accepted by the shared `/api/stream/agno` endpoint."""

    run_id: str = Field(
        description="Paused Agno run id that should be continued.",
    )
    requirement_id: str = Field(
        description="Requirement id inside the paused Agno run that should be resolved.",
    )


class AgnoPausedRunResponse(BaseModel):
    """Summary payload returned when querying a paused Agno run."""

    run_id: str
    session_id: str | None = None
    agent_key: str
    status: str
    requirement_ids: list[str]


class LangChainEditedAction(BaseModel):
    """Edited LangChain tool call payload used when resuming an HITL interrupt."""

    name: str = Field(
        description="Tool name that should be executed after the edit decision.",
    )
    args: dict[str, Any] = Field(
        default_factory=dict,
        description="Edited tool arguments that replace the original tool call args.",
    )


class LangChainDecision(BaseModel):
    """One human decision item expected by LangChain HITL resume."""

    type: Literal["approve", "edit", "reject"] = Field(
        description="Human decision type for the current interrupted action request.",
    )
    edited_action: LangChainEditedAction | None = Field(
        default=None,
        description="Edited tool call payload required when `type` is `edit`.",
    )
    message: str | None = Field(
        default=None,
        description="Optional human note returned to LangChain when rejecting a tool call.",
    )


class LangChainStreamResumeRequest(BaseModel):
    """Resume payload accepted by the shared `/api/stream/langchain` endpoint."""

    decisions: list[LangChainDecision] = Field(
        default_factory=list,
        description="Ordered human decisions returned to LangChain HITL for the current interrupt batch.",
    )


class AutoGenStreamResumeRequest(BaseModel):
    """Resume payload accepted by the shared `/api/stream/autogen` endpoint."""

    content: str = Field(
        description="Human reply content appended as the next user turn when resuming a paused AutoGen handoff.",
    )


class ProviderDescriptor(BaseModel):
    """Metadata for a provider endpoint exposed by the backend."""

    id: str
    path: str
    label: str
    note: str | None = None


class HealthResponse(BaseModel):
    """Simple health check payload for the backend root API."""

    service: str
    providers: list[ProviderDescriptor]
