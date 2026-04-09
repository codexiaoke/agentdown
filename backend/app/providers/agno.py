"""Agno provider helpers for raw SSE streaming and HITL continuation."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from app.agno_state import AgnoPausedRunRecord, get_agno_paused_run_store
from app.live_weather import lookup_live_weather
from app.models import AgnoRequirementResolutionRequest
from app.providers.base import ProviderContext, serialize_payload
from app.settings import BackendSettings

DEFAULT_AGNO_AGENT_KEY = "weather"


def is_agno_hitl_mode(raw_mode: str | None) -> bool:
    """Return whether the current Agno request should enable HITL behavior."""

    return (raw_mode or "").strip().lower() == "hitl"


def create_agno_weather_agent(settings: BackendSettings, *, hitl_mode: bool):
    """Create the Agno weather agent used by the backend demo endpoints."""

    from agno.agent.agent import Agent
    from agno.models.deepseek import DeepSeek
    from agno.tools.decorator import tool

    @tool(requires_confirmation=hitl_mode)
    def lookup_weather(city: str) -> dict[str, Any]:
        """Return live weather data from the public weather helper."""

        return lookup_live_weather(city)

    def get_time() -> str:
        """Return the current local wall-clock time."""

        return datetime.now().astimezone().isoformat(timespec="seconds")

    instructions = [
        "You are a weather assistant.",
        "When the user asks about weather, you must call the lookup_weather tool before answering.",
        "The weather tool returns live weather data from a public API.",
    ]

    if hitl_mode:
        instructions.append(
            "This run is in human-in-the-loop mode. When lookup_weather is selected, Agno will pause before running it."
        )

    return Agent(
        name="Agno Weather Agent",
        model=DeepSeek(
            id=settings.deepseek_model,
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        ),
        tools=[lookup_weather, get_time],
        instructions=" ".join(instructions),
    )


def resolve_agno_requirement_ids(run_output: Any) -> list[str]:
    """Extract stable requirement ids from an Agno paused run output."""

    requirement_ids: list[str] = []

    for requirement in getattr(run_output, "requirements", None) or []:
        requirement_id = resolve_agno_requirement_identifier(requirement)

        if isinstance(requirement_id, str) and requirement_id:
            requirement_ids.append(requirement_id)

    return requirement_ids


def resolve_agno_requirement_identifier(requirement: Any) -> str | None:
    """Return the best available identifier for a paused Agno requirement."""

    requirement_id = getattr(requirement, "id", None)

    if isinstance(requirement_id, str) and requirement_id:
        return requirement_id

    tool_execution = getattr(requirement, "tool_execution", None)
    approval_id = getattr(tool_execution, "approval_id", None)

    if isinstance(approval_id, str) and approval_id:
        return approval_id

    tool_call_id = getattr(tool_execution, "tool_call_id", None)

    if isinstance(tool_call_id, str) and tool_call_id:
        return tool_call_id

    return None


def iter_agno_requirement_identifiers(requirement: Any) -> tuple[str, ...]:
    """Return every identifier alias that can point at the same Agno requirement."""

    identifiers: list[str] = []
    requirement_id = getattr(requirement, "id", None)

    if isinstance(requirement_id, str) and requirement_id:
        identifiers.append(requirement_id)

    tool_execution = getattr(requirement, "tool_execution", None)
    approval_id = getattr(tool_execution, "approval_id", None)

    if isinstance(approval_id, str) and approval_id and approval_id not in identifiers:
        identifiers.append(approval_id)

    tool_call_id = getattr(tool_execution, "tool_call_id", None)

    if isinstance(tool_call_id, str) and tool_call_id and tool_call_id not in identifiers:
        identifiers.append(tool_call_id)

    return tuple(identifiers)


def create_agno_paused_run_record(
    run_output: Any,
    *,
    agent_key: str,
    request_payload: dict[str, Any],
) -> AgnoPausedRunRecord:
    """Build a serializable paused run record from an Agno `RunOutput`."""

    run_id = getattr(run_output, "run_id", None)

    if not isinstance(run_id, str) or not run_id:
        raise ValueError("Paused Agno run output is missing a valid run_id.")

    status_value = getattr(getattr(run_output, "status", None), "value", None)

    if not isinstance(status_value, str) or not status_value:
        status_value = "paused"

    run_output_payload = run_output.to_dict() if hasattr(run_output, "to_dict") else serialize_payload(run_output)

    if not isinstance(run_output_payload, dict):
        raise ValueError("Paused Agno run output could not be serialized to a dictionary.")

    return AgnoPausedRunRecord(
        run_id=run_id,
        session_id=getattr(run_output, "session_id", None),
        agent_key=agent_key,
        status=status_value,
        requirement_ids=resolve_agno_requirement_ids(run_output),
        run_output=run_output_payload,
        request_payload=request_payload,
        saved_at=datetime.now().astimezone().isoformat(timespec="seconds"),
    )


def resolve_agno_requirement(run_output: Any, requirement_id: str) -> Any | None:
    """Return the matching Agno requirement object from a paused run output."""

    for requirement in getattr(run_output, "requirements", None) or []:
        if requirement_id in iter_agno_requirement_identifiers(requirement):
            return requirement

    return None


def apply_agno_requirement_resolution(
    requirement: Any,
    resolution: AgnoRequirementResolutionRequest,
) -> None:
    """Apply a frontend resolution payload to a concrete Agno requirement object."""

    if resolution.action == "approve":
        requirement.confirm()
        return

    if resolution.action == "reject":
        requirement.reject(resolution.note)
        return

    if resolution.action == "submit_input":
        if resolution.values is None:
            raise ValueError("`submit_input` requires a `values` payload.")

        requirement.provide_user_input(resolution.values)
        return

    if resolution.action == "submit_feedback":
        if resolution.selections is None:
            raise ValueError("`submit_feedback` requires a `selections` payload.")

        requirement.provide_user_feedback(resolution.selections)
        return

    if resolution.action == "submit_external_result":
        if resolution.result is None:
            raise ValueError("`submit_external_result` requires a `result` payload.")

        requirement.set_external_execution_result(resolution.result)
        return

    raise ValueError(f"Unsupported Agno requirement action: {resolution.action}")


def sync_agno_run_output_tools_from_requirements(run_output: Any) -> None:
    """Copy updated requirement tool executions back onto `run_output.tools`."""

    requirements = getattr(run_output, "requirements", None) or []
    tools = getattr(run_output, "tools", None) or []

    if not tools or not requirements:
        return

    updated_tools_by_id: dict[str, Any] = {}

    for requirement in requirements:
        tool_execution = getattr(requirement, "tool_execution", None)
        tool_call_id = getattr(tool_execution, "tool_call_id", None)

        if isinstance(tool_call_id, str) and tool_call_id:
            updated_tools_by_id[tool_call_id] = tool_execution

    if not updated_tools_by_id:
        return

    synced_tools: list[Any] = []

    for tool in tools:
        tool_call_id = getattr(tool, "tool_call_id", None)

        if isinstance(tool_call_id, str) and tool_call_id in updated_tools_by_id:
            synced_tools.append(updated_tools_by_id[tool_call_id])
            continue

        synced_tools.append(tool)

    run_output.tools = synced_tools


async def stream_agno_runtime_items(
    runtime_items: AsyncIterator[Any],
    *,
    settings: BackendSettings,
    agent_key: str,
    request_payload: dict[str, Any],
) -> AsyncIterator[dict[str, Any]]:
    """Serialize Agno runtime items to SSE payloads and persist paused runs."""

    from agno.run.agent import RunOutput

    paused_run_store = get_agno_paused_run_store(settings)

    async for runtime_item in runtime_items:
        if isinstance(runtime_item, RunOutput):
            if runtime_item.is_paused:
                paused_record = create_agno_paused_run_record(
                    runtime_item,
                    agent_key=agent_key,
                    request_payload=request_payload,
                )
                await paused_run_store.save(paused_record)
            elif isinstance(runtime_item.run_id, str) and runtime_item.run_id:
                await paused_run_store.delete(runtime_item.run_id)

            continue

        payload = serialize_payload(runtime_item)

        if isinstance(payload, dict):
            event_name = getattr(runtime_item, "event", None)

            if isinstance(event_name, str) and event_name and "event" not in payload:
                payload["event"] = event_name

            yield payload
            continue

        fallback_event_name = getattr(runtime_item, "event", None)
        yield {
            "event": str(fallback_event_name or "AgnoEvent"),
            "content": payload,
        }


async def stream_agno_events(context: ProviderContext) -> AsyncIterator[dict[str, Any]]:
    """Run a real Agno agent and forward raw framework events over SSE."""

    try:
        agno_resume = context.request.agno_resume

        if agno_resume is not None:
            async for payload in stream_agno_requirement_resolution(
                run_id=agno_resume.run_id,
                requirement_id=agno_resume.requirement_id,
                resolution=agno_resume,
                settings=context.settings,
            ):
                yield payload
            return

        request_payload = context.request.model_dump(mode="json")
        hitl_mode = is_agno_hitl_mode(context.request.mode)
        agent = create_agno_weather_agent(context.settings, hitl_mode=hitl_mode)
        runtime_items = agent.arun(
            context.request.message,
            stream=True,
            stream_events=True,
            yield_run_output=True,
            session_id=context.request.session_id,
            user_id=context.request.user_id,
        )

        async for payload in stream_agno_runtime_items(
            runtime_items,
            settings=context.settings,
            agent_key=DEFAULT_AGNO_AGENT_KEY,
            request_payload=request_payload,
        ):
            yield payload
    except Exception as error:
        yield {
            "event": "error",
            "message": str(error),
        }


async def stream_agno_requirement_resolution(
    *,
    run_id: str,
    requirement_id: str,
    resolution: AgnoRequirementResolutionRequest,
    settings: BackendSettings,
) -> AsyncIterator[dict[str, Any]]:
    """Resolve a stored Agno requirement and continue the paused run over SSE."""

    from agno.run.agent import RunOutput

    paused_run_store = get_agno_paused_run_store(settings)
    paused_record = await paused_run_store.load(run_id)

    if paused_record is None:
        yield {
            "event": "error",
            "message": f"Paused Agno run not found: {run_id}",
        }
        return

    run_output = RunOutput.from_dict(paused_record.run_output)
    requirement = resolve_agno_requirement(run_output, requirement_id)

    if requirement is None:
        yield {
            "event": "error",
            "message": f"Requirement not found for run {run_id}: {requirement_id}",
        }
        return

    try:
        apply_agno_requirement_resolution(requirement, resolution)
        sync_agno_run_output_tools_from_requirements(run_output)
    except Exception as error:
        yield {
            "event": "error",
            "message": str(error),
        }
        return

    hitl_mode = is_agno_hitl_mode(str(paused_record.request_payload.get("mode") or ""))
    agent = create_agno_weather_agent(settings, hitl_mode=hitl_mode)
    runtime_items = agent.acontinue_run(
        run_response=run_output,
        stream=True,
        stream_events=True,
        yield_run_output=True,
        session_id=paused_record.session_id,
        user_id=paused_record.request_payload.get("user_id"),
    )

    async for payload in stream_agno_runtime_items(
        runtime_items,
        settings=settings,
        agent_key=paused_record.agent_key,
        request_payload=paused_record.request_payload,
    ):
        yield payload
