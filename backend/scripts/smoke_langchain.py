"""Smoke-test the real LangChain SSE backend endpoint."""

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
class LangChainSmokeSummary:
    """Structured summary printed after the smoke test finishes."""

    endpoint: str
    prompt: str
    event_counts: dict[str, int] = field(default_factory=dict)
    root_run_id: str | None = None
    tool_names: list[str] = field(default_factory=list)
    final_content_preview: str | None = None
    saw_root_chain_start: bool = False
    saw_tool_start: bool = False
    saw_tool_end: bool = False
    saw_root_chain_end: bool = False
    errors: list[str] = field(default_factory=list)


def parse_args() -> argparse.Namespace:
    """Parse CLI options for the LangChain smoke test."""

    parser = argparse.ArgumentParser(
        description="Verify that the real /api/stream/langchain endpoint can stream, call a tool, and finish cleanly."
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Backend base URL, for example http://127.0.0.1:8000",
    )
    parser.add_argument(
        "--prompt",
        default=DEFAULT_PROMPT,
        help="Prompt sent to the LangChain backend.",
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

    return "unknown"


def is_root_langchain_chain_event(payload: dict[str, Any]) -> bool:
    """Return whether a LangChain chain event belongs to the root LangGraph run."""

    parent_ids = payload.get("parent_ids")

    return isinstance(parent_ids, list) and len(parent_ids) == 0


def read_stream_content(payload: dict[str, Any]) -> str | None:
    """Extract incremental model text from a LangChain `on_chat_model_stream` event."""

    data = payload.get("data")

    if not isinstance(data, dict):
        return None

    chunk = data.get("chunk")

    if not isinstance(chunk, dict):
        return None

    content = chunk.get("content")
    return content if isinstance(content, str) and content else None


def read_tool_name(payload: dict[str, Any]) -> str | None:
    """Extract a LangChain tool name from a tool event."""

    name = payload.get("name")
    return name if isinstance(name, str) and name else None


def update_summary(summary: LangChainSmokeSummary, payload: dict[str, Any], event_name: str) -> None:
    """Merge one parsed LangChain event into the rolling smoke summary."""

    summary.event_counts[event_name] = summary.event_counts.get(event_name, 0) + 1

    if event_name == "on_chain_start" and is_root_langchain_chain_event(payload):
        summary.saw_root_chain_start = True
        run_id = payload.get("run_id")

        if isinstance(run_id, str) and run_id:
            summary.root_run_id = run_id

    if event_name == "on_tool_start":
        summary.saw_tool_start = True
        tool_name = read_tool_name(payload)

        if tool_name and tool_name not in summary.tool_names:
            summary.tool_names.append(tool_name)

    if event_name == "on_tool_end":
        summary.saw_tool_end = True
        tool_name = read_tool_name(payload)

        if tool_name and tool_name not in summary.tool_names:
            summary.tool_names.append(tool_name)

    if event_name == "on_chain_end" and is_root_langchain_chain_event(payload):
        summary.saw_root_chain_end = True

    if event_name == "on_chat_model_stream":
        content = read_stream_content(payload)

        if content:
            merged = f"{summary.final_content_preview or ''}{content}".strip()
            summary.final_content_preview = merged[-240:]

    if event_name == "error":
        data = payload.get("data")

        if isinstance(data, dict):
            message = data.get("message")

            if isinstance(message, str) and message:
                summary.errors.append(message)
                return

        summary.errors.append(json.dumps(payload, ensure_ascii=False))


def validate_summary(summary: LangChainSmokeSummary) -> None:
    """Raise an error when the LangChain smoke result is incomplete."""

    problems: list[str] = []

    if summary.errors:
        problems.append(f"backend returned errors: {' | '.join(summary.errors)}")

    if not summary.saw_root_chain_start:
        problems.append("missing root on_chain_start")

    if not summary.saw_tool_start:
        problems.append("missing on_tool_start")

    if not summary.saw_tool_end:
        problems.append("missing on_tool_end")

    if not summary.saw_root_chain_end:
        problems.append("missing root on_chain_end")

    if not summary.final_content_preview:
        problems.append("missing streamed assistant content")

    if problems:
        raise RuntimeError("; ".join(problems))


def run_smoke_test(base_url: str, prompt: str, timeout_seconds: float) -> LangChainSmokeSummary:
    """Run the real LangChain endpoint once and return a structured summary."""

    endpoint = f"{base_url.rstrip('/')}/api/stream/langchain"
    summary = LangChainSmokeSummary(
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
    """CLI entrypoint for the LangChain smoke test."""

    args = parse_args()
    summary = run_smoke_test(
        base_url=str(args.base_url),
        prompt=str(args.prompt),
        timeout_seconds=float(args.timeout),
    )
    print(json.dumps(asdict(summary), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
