"""Smoke-test the real CrewAI SSE backend endpoint."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import argparse
import json
from typing import Any

import httpx


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_PROMPT = "帮我查一下北京天气，并说明工具调用过程。"


@dataclass(slots=True)
class ParsedSseMessage:
    """A single parsed SSE frame."""

    event: str | None
    data: str


@dataclass(slots=True)
class CrewAISmokeSummary:
    """Structured summary printed after the smoke test finishes."""

    endpoint: str
    prompt: str
    event_counts: dict[str, int] = field(default_factory=dict)
    session_id: str | None = None
    run_id: str | None = None
    tool_names: list[str] = field(default_factory=list)
    streamed_text_preview: str | None = None
    final_output_preview: str | None = None
    saw_text_chunk: bool = False
    saw_tool_call: bool = False
    saw_final_output: bool = False
    errors: list[str] = field(default_factory=list)


def parse_args() -> argparse.Namespace:
    """Parse CLI options for the CrewAI smoke test."""

    parser = argparse.ArgumentParser(
        description="Verify that the real /api/stream/crewai endpoint can stream text, call a tool, and finish with CrewOutput."
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Backend base URL, for example http://127.0.0.1:8000",
    )
    parser.add_argument(
        "--prompt",
        default=DEFAULT_PROMPT,
        help="Prompt sent to the CrewAI backend.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=45.0,
        help="Total request timeout in seconds.",
    )
    return parser.parse_args()


def iter_sse_messages(response: httpx.Response) -> list[ParsedSseMessage]:
    """Collect SSE frames from a streaming HTTP response."""

    messages: list[ParsedSseMessage] = []
    current_event: str | None = None
    current_data_lines: list[str] = []

    for raw_line in response.iter_lines():
        line = raw_line.strip()

        if not line:
            if current_event is not None or current_data_lines:
                messages.append(
                    ParsedSseMessage(
                        event=current_event,
                        data="\n".join(current_data_lines),
                    )
                )
            current_event = None
            current_data_lines = []
            continue

        if line.startswith(":"):
            continue

        field_name, _, raw_value = line.partition(":")
        value = raw_value.lstrip()

        if field_name == "event":
            current_event = value
            continue

        if field_name == "data":
            current_data_lines.append(value)

    if current_event is not None or current_data_lines:
        messages.append(
            ParsedSseMessage(
                event=current_event,
                data="\n".join(current_data_lines),
            )
        )

    return messages


def parse_json_record(raw_value: str) -> dict[str, Any]:
    """Parse an SSE data payload into a JSON object."""

    parsed = json.loads(raw_value)

    if not isinstance(parsed, dict):
        raise RuntimeError("Expected SSE data payload to be a JSON object.")

    return parsed


def read_event_name(message: ParsedSseMessage, payload: dict[str, Any]) -> str:
    """Resolve the canonical event name for a parsed SSE frame."""

    payload_event = payload.get("event")

    if isinstance(payload_event, str) and payload_event:
        return payload_event

    if message.event:
        return message.event

    payload_type = payload.get("type")
    return payload_type if isinstance(payload_type, str) and payload_type else "unknown"


def read_chunk_type(payload: dict[str, Any]) -> str | None:
    """Read the normalized CrewAI chunk type from a payload."""

    chunk_type = payload.get("chunk_type")

    if isinstance(chunk_type, str) and chunk_type:
        return chunk_type

    if isinstance(chunk_type, dict):
        value = chunk_type.get("_value_")
        return value if isinstance(value, str) and value else None

    return None


def update_summary(summary: CrewAISmokeSummary, payload: dict[str, Any], event_name: str) -> None:
    """Merge one parsed CrewAI event into the rolling smoke summary."""

    summary.event_counts[event_name] = summary.event_counts.get(event_name, 0) + 1

    session_id = payload.get("session_id")

    if isinstance(session_id, str) and session_id and summary.session_id is None:
        summary.session_id = session_id

    run_id = payload.get("run_id") or payload.get("agent_id")

    if isinstance(run_id, str) and run_id and summary.run_id is None:
        summary.run_id = run_id

    chunk_type = read_chunk_type(payload)

    if chunk_type == "text":
        content = payload.get("content")

        if isinstance(content, str) and content:
            summary.saw_text_chunk = True
            merged = f"{summary.streamed_text_preview or ''}{content}".strip()
            summary.streamed_text_preview = merged[-240:]

    if chunk_type == "tool_call":
        summary.saw_tool_call = True
        tool_call = payload.get("tool_call")

        if isinstance(tool_call, dict):
            tool_name = tool_call.get("tool_name")

            if isinstance(tool_name, str) and tool_name and tool_name not in summary.tool_names:
                summary.tool_names.append(tool_name)

    if event_name == "CrewOutput":
        summary.saw_final_output = True
        raw = payload.get("raw")

        if isinstance(raw, str) and raw:
            summary.final_output_preview = raw[-240:]

    if event_name == "ErrorEvent":
        message = payload.get("message")
        summary.errors.append(message if isinstance(message, str) and message else json.dumps(payload, ensure_ascii=False))


def validate_summary(summary: CrewAISmokeSummary) -> None:
    """Raise an error when the CrewAI smoke result is incomplete."""

    problems: list[str] = []

    if summary.errors:
        problems.append(f"backend returned errors: {' | '.join(summary.errors)}")

    if not summary.saw_text_chunk:
        problems.append("missing streamed text chunk")

    if not summary.saw_tool_call:
        problems.append("missing tool_call chunk")

    if not summary.saw_final_output:
        problems.append("missing CrewOutput")

    if not summary.final_output_preview:
        problems.append("missing final assistant output")

    if problems:
        raise RuntimeError("; ".join(problems))


def run_smoke_test(base_url: str, prompt: str, timeout_seconds: float) -> CrewAISmokeSummary:
    """Run the real CrewAI endpoint once and return a structured summary."""

    endpoint = f"{base_url.rstrip('/')}/api/stream/crewai"
    summary = CrewAISmokeSummary(
        endpoint=endpoint,
        prompt=prompt,
    )

    with httpx.stream(
        "POST",
        endpoint,
        json={
            "message": prompt,
        },
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        timeout=timeout_seconds,
        trust_env=False,
    ) as response:
        response.raise_for_status()

        for message in iter_sse_messages(response):
            payload = parse_json_record(message.data)
            event_name = read_event_name(message, payload)
            update_summary(summary, payload, event_name)

    summary.event_counts = dict(sorted(summary.event_counts.items(), key=lambda item: item[0]))
    validate_summary(summary)
    return summary


def main() -> None:
    """CLI entrypoint for the CrewAI smoke test."""

    args = parse_args()
    summary = run_smoke_test(
        base_url=str(args.base_url),
        prompt=str(args.prompt),
        timeout_seconds=float(args.timeout),
    )
    print(json.dumps(asdict(summary), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
