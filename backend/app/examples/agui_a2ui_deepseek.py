"""Reference DeepSeek-backed AG-UI agent that emits validated A2UI surfaces."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
import asyncio
import json
import re
from typing import Any

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.models import AgUiRunAgentInput
from app.providers.base import build_openai_compatible_base_url
from app.settings import BackendSettings


A2UI_BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"
A2UI_SURFACE_ID = "agent-surface"
MAX_COMPONENTS = 64
MAX_PLAN_BYTES = 64 * 1024
MAX_HISTORY_MESSAGES = 12
MAX_HISTORY_CHARS = 16_000

_COMPONENT_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]{0,79}$")
_ACTION_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]{0,79}$")
_FORBIDDEN_KEYS = {"__proto__", "constructor", "prototype"}
_FORBIDDEN_MODEL_FEATURES = {"call", "functionCall", "checks", "validationRegexp"}
_ALLOWED_COMPONENT_PROPERTIES: dict[str, set[str]] = {
    "Text": {"id", "component", "text", "variant", "weight"},
    "Row": {"id", "component", "children", "justify", "align", "weight"},
    "Column": {"id", "component", "children", "justify", "align", "weight"},
    "List": {"id", "component", "children", "direction", "align", "weight"},
    "Card": {"id", "component", "child", "weight"},
    "Tabs": {"id", "component", "tabs", "weight"},
    "Divider": {"id", "component", "axis", "weight"},
    "Button": {"id", "component", "child", "variant", "action", "weight"},
    "TextField": {"id", "component", "label", "value", "variant", "weight"},
    "CheckBox": {"id", "component", "label", "value", "weight"},
    "ChoicePicker": {
        "id",
        "component",
        "label",
        "variant",
        "options",
        "value",
        "displayStyle",
        "filterable",
        "weight",
    },
    "Slider": {"id", "component", "label", "min", "max", "value", "weight"},
    "DateTimeInput": {
        "id",
        "component",
        "label",
        "value",
        "enableDate",
        "enableTime",
        "min",
        "max",
        "weight",
    },
}
_REQUIRED_COMPONENT_PROPERTIES: dict[str, set[str]] = {
    "Text": {"text"},
    "Row": {"children"},
    "Column": {"children"},
    "List": {"children"},
    "Card": {"child"},
    "Tabs": {"tabs"},
    "Divider": set(),
    "Button": {"child", "action"},
    "TextField": {"label"},
    "CheckBox": {"label", "value"},
    "ChoicePicker": {"options", "value"},
    "Slider": {"max", "value"},
    "DateTimeInput": {"value"},
}

_SYSTEM_PROMPT = """你是 Agentdown 的生成式界面 Agent。根据对话和最新输入，设计一个有用、可交互的 A2UI v0.9.1 Basic Catalog 界面。

你必须只返回一个 JSON object，不能返回 Markdown、代码围栏、HTML、Vue、JavaScript 或解释。JSON 顶层必须严格为：
{"assistantText":"给用户的简短说明","components":[...],"dataModel":{...}}

只可使用这些组件：Text、Row、Column、List、Card、Tabs、Divider、Button、TextField、CheckBox、ChoicePicker、Slider、DateTimeInput。
规则：
1. 必须有 id 为 root 的根组件，所有组件 id 唯一，组件只能用 id 引用，不能内联。
2. Row、Column、List 用 children 字符串数组；Card 和 Button 用 child；Tabs 用 [{"title":"...","child":"..."}]。
3. Text 的 text、输入组件的 value 可用 {"path":"/字段"} 绑定 dataModel；每条路径必须已在 dataModel 中存在。
4. Button 只能使用服务端事件：{"event":{"name":"动作名","context":{"字段":{"path":"/字段"}}}}。禁止 functionCall、call、openUrl 和任意客户端函数。
5. TextField 至少有 label；ChoicePicker 的 value 必须绑定字符串数组，options 为 label/value；Slider 必须有 max 和 value；DateTimeInput 的 value 是 ISO 8601 字符串或空字符串。
6. 界面控制在 20 个组件以内，文案使用用户语言。不要生成 URL、媒体、密码框或正则表达式。
7. 如果最新输入是 A2UI action，基于 action 的真实 context 更新结果，并按需要继续提供可交互界面。
8. 如果用户只要求展示信息，使用 Text、Row、Column、List、Card、Divider 等展示组件，不要凭空添加 Button、提交或修改动作。
9. 读书计划的提交 action 固定命名为 reading_plan_submitted；如果提供修改入口，固定命名为 reading_plan_edit_requested。

合法 JSON 示例：
{"assistantText":"我为你准备了一个可调整的阅读计划。","components":[{"id":"root","component":"Column","children":["title","card"]},{"id":"title","component":"Text","text":{"path":"/title"},"variant":"h2"},{"id":"card","component":"Card","child":"form"},{"id":"form","component":"Column","children":["book","minutes","submit"]},{"id":"book","component":"TextField","label":"书名","value":{"path":"/book"}},{"id":"minutes","component":"Slider","label":"每日分钟数","min":10,"max":120,"value":{"path":"/minutes"}},{"id":"submit","component":"Button","child":"submitText","variant":"primary","action":{"event":{"name":"reading_plan_submitted","context":{"book":{"path":"/book"},"minutes":{"path":"/minutes"}}}}},{"id":"submitText","component":"Text","text":"确认计划"}],"dataModel":{"title":"阅读计划","book":"","minutes":30}}
"""


class AgUiGeneratedSurface(BaseModel):
    """Constrained intermediate representation accepted from the model."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    assistant_text: str = Field(alias="assistantText", min_length=1, max_length=4_000)
    components: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_COMPONENTS)
    data_model: dict[str, Any] = Field(alias="dataModel")


@dataclass(frozen=True, slots=True)
class AgUiModelGeneration:
    """Validated surface plus metadata returned by the real model call."""

    surface: AgUiGeneratedSurface
    model: str
    usage: dict[str, Any]
    response_id: str | None = None


@dataclass(frozen=True, slots=True)
class AgUiAnswerComponentGeneration:
    """One frontend-owned answer component selected by the model."""

    name: str
    props: dict[str, Any]
    assistant_text: str
    model: str
    usage: dict[str, Any]
    response_id: str | None = None


@dataclass(frozen=True, slots=True)
class AgUiTextGeneration:
    """A normal text answer that does not need a structured UI."""

    assistant_text: str
    model: str
    usage: dict[str, Any]
    response_id: str | None = None


AgUiChatGeneration = AgUiModelGeneration | AgUiAnswerComponentGeneration | AgUiTextGeneration


AgUiSurfaceGenerator = Callable[
    [BackendSettings, list[dict[str, str]], str],
    Awaitable[AgUiChatGeneration],
]

_CHAT_SYSTEM_PROMPT = """你是一个通过 AG-UI 流回答用户的 Agent。前端会把可用的回答组件作为工具提供给你。

选择回答形式时遵守：
1. 普通解释直接返回简洁文本，不调用工具。
2. 如果某个前端回答组件与结果明确匹配，调用该工具一次，并严格按 parameters 填写 props；不要在文本中伪造组件。
3. 固定、高频的展示卡片优先使用前端回答组件，例如天气卡、订单卡、商品卡。
4. 只有结构无法由现有组件表达、且确实需要动态布局或交互时，才调用 render_a2ui_surface。
5. 不要编造实时数据。只有用户已经提供数据，或上下文中有可信结果时，才能填写结果组件。
6. 不要生成 HTML、Vue、JavaScript、URL 跳转或任意客户端函数。
7. 最多调用一个回答工具。
"""

_A2UI_RENDER_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "render_a2ui_surface",
        "description": "当现有前端回答组件不足以表达结果时，选择由后端专用生成器创建受限 A2UI 动态界面。",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "现有固定组件无法表达该回答的简短原因。",
                },
            },
            "additionalProperties": False,
        },
    },
}


class AgUiAgentSessionStore:
    """Keep compact chat context in memory while event storage remains replaceable."""

    def __init__(self) -> None:
        self._histories: dict[str, list[dict[str, str]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._guard = asyncio.Lock()

    async def lock_for(self, thread_id: str) -> asyncio.Lock:
        """Return one lock per thread so action follow-ups keep turn ordering."""

        async with self._guard:
            return self._locks.setdefault(thread_id, asyncio.Lock())

    async def history(self, thread_id: str) -> list[dict[str, str]]:
        """Return a defensive copy of the compact model history."""

        async with self._guard:
            return [dict(message) for message in self._histories.get(thread_id, [])]

    async def append_turn(self, thread_id: str, user_text: str, assistant_text: str) -> None:
        """Append one successful model turn and enforce bounded memory."""

        async with self._guard:
            history = self._histories.setdefault(thread_id, [])
            history.extend(
                [
                    {"role": "user", "content": user_text[:4_000]},
                    {"role": "assistant", "content": assistant_text[:4_000]},
                ]
            )
            history[:] = _bound_history(history)

    async def clear(self) -> None:
        """Clear model histories and locks; intended for tests."""

        async with self._guard:
            self._histories.clear()
            self._locks.clear()


agui_agent_session_store = AgUiAgentSessionStore()


def _bound_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    """Keep recent history within count and character limits."""

    bounded: list[dict[str, str]] = []
    used_chars = 0
    for message in reversed(history[-MAX_HISTORY_MESSAGES:]):
        content = message.get("content", "")
        if used_chars + len(content) > MAX_HISTORY_CHARS:
            break
        bounded.append({"role": message.get("role", "user"), "content": content})
        used_chars += len(content)
    bounded.reverse()
    return bounded


def _plain_message_text(message: dict[str, Any]) -> str:
    """Extract plain text from one standard AG-UI message."""

    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            item.get("text", "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        return "".join(part for part in parts if isinstance(part, str))
    return ""


def _request_history(request: AgUiRunAgentInput) -> list[dict[str, str]]:
    """Convert supported AG-UI user/assistant messages into model history."""

    history: list[dict[str, str]] = []
    for message in request.messages:
        role = message.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = _plain_message_text(message).strip()
        if content:
            history.append({"role": role, "content": content[:4_000]})
    return _bound_history(history)


def _last_user_text(request: AgUiRunAgentInput) -> str:
    """Return the latest plain-text user message from a standard AG-UI request."""

    for message in reversed(request.messages):
        if message.get("role") == "user":
            text = _plain_message_text(message).strip()
            if text:
                return text
    return ""


def _read_a2ui_client_transport(request: AgUiRunAgentInput) -> dict[str, Any]:
    """Validate the A2UI capability handshake and optional client message."""

    forwarded = request.forwarded_props
    if not isinstance(forwarded, dict):
        raise ValueError("AG-UI+A2UI requests require forwardedProps.a2ui.clientCapabilities.")
    a2ui = forwarded.get("a2ui")
    if not isinstance(a2ui, dict):
        raise ValueError("AG-UI+A2UI requests require forwardedProps.a2ui.clientCapabilities.")
    message = a2ui.get("clientMessage")
    capabilities = a2ui.get("clientCapabilities")
    if not isinstance(capabilities, dict):
        raise ValueError("A2UI clientCapabilities must be an object.")

    supported_catalog_ids = {
        catalog_id
        for version in ("v0.9", "v0.9.1")
        if isinstance(capabilities.get(version), dict)
        for catalog_id in capabilities[version].get("supportedCatalogIds", [])
        if isinstance(catalog_id, str)
    }
    if A2UI_BASIC_CATALOG_ID not in supported_catalog_ids:
        raise ValueError("A2UI client does not advertise the required Basic Catalog.")

    data_model = a2ui.get("clientDataModel")
    if data_model is not None and not isinstance(data_model, dict):
        raise ValueError("A2UI clientDataModel must be an object when provided.")
    if message is None:
        return {
            "message": None,
            "clientDataModel": data_model,
        }
    if not isinstance(message, dict):
        raise ValueError("A2UI clientMessage must be an object when provided.")
    version = message.get("version")
    if version not in {"v0.9", "v0.9.1"} or version not in capabilities:
        raise ValueError("A2UI client message version is not advertised by clientCapabilities.")
    action = message.get("action")
    error = message.get("error")
    if isinstance(action, dict) == isinstance(error, dict):
        raise ValueError("A2UI clientMessage requires exactly one action or error.")
    return {
        "message": message,
        "clientDataModel": data_model,
    }


def _latest_input(request: AgUiRunAgentInput) -> str:
    """Build the newest model instruction from either text or an A2UI action."""

    envelope = _read_a2ui_client_transport(request)
    message = envelope["message"]
    if message is not None:
        event_type = "action" if "action" in message else "error"
        return (
            f"A2UI 客户端刚刚上报了以下 {event_type}。请结合消息和可选 DataModel 更新界面与答复：\n"
            + json.dumps(envelope, ensure_ascii=False, separators=(",", ":"))
        )
    prompt = _last_user_text(request)
    if not prompt:
        raise ValueError("AG-UI request requires a user message or an A2UI action.")
    return prompt


def _reading_plan_values(message: dict[str, Any]) -> tuple[str, int, list[str]]:
    """Read bounded reading-plan values from one validated A2UI action."""

    action = message.get("action")
    context = action.get("context") if isinstance(action, dict) else None
    context = context if isinstance(context, dict) else {}
    book = str(
        context.get("book")
        or context.get("bookName")
        or context.get("bookTitle")
        or ""
    ).strip()[:200]
    raw_minutes = context.get("minutes", context.get("dailyMinutes", 30))
    minutes = raw_minutes if isinstance(raw_minutes, int) and not isinstance(raw_minutes, bool) else 30
    minutes = max(10, min(120, minutes))
    raw_pace = context.get("pace", context.get("readingPace", ["适中"]))
    pace_value = str(raw_pace[0]).strip().lower() if isinstance(raw_pace, list) and raw_pace else ""
    pace_aliases = {
        "轻松": "轻松",
        "easy": "轻松",
        "light": "轻松",
        "relaxed": "轻松",
        "适中": "适中",
        "稳定": "适中",
        "moderate": "适中",
        "normal": "适中",
        "steady": "适中",
        "紧凑": "紧凑",
        "fast": "紧凑",
        "intensive": "紧凑",
        "tight": "紧凑",
    }
    return book, minutes, [pace_aliases.get(pace_value, "适中")]


def _reading_plan_form_surface(
    *,
    book: str,
    minutes: int,
    pace: list[str],
    error: str | None = None,
) -> AgUiGeneratedSurface:
    """Build the deterministic editable state for the reading-plan example."""

    form_children = ["book", "minutes", "pace"]
    components: list[dict[str, Any]] = [
        {"id": "root", "component": "Column", "children": ["title", "card"]},
        {"id": "title", "component": "Text", "text": "读书计划", "variant": "h2"},
        {"id": "card", "component": "Card", "child": "form"},
        {"id": "form", "component": "Column", "children": form_children},
        {
            "id": "book",
            "component": "TextField",
            "label": "书名",
            "value": {"path": "/book"},
        },
        {
            "id": "minutes",
            "component": "Slider",
            "label": "每日分钟数",
            "min": 10,
            "max": 120,
            "value": {"path": "/minutes"},
        },
        {
            "id": "pace",
            "component": "ChoicePicker",
            "label": "阅读节奏",
            "variant": "mutuallyExclusive",
            "options": [
                {"label": "轻松", "value": "轻松"},
                {"label": "适中", "value": "适中"},
                {"label": "紧凑", "value": "紧凑"},
            ],
            "value": {"path": "/pace"},
        },
        {
            "id": "submit",
            "component": "Button",
            "child": "submitText",
            "variant": "primary",
            "action": {
                "event": {
                    "name": "reading_plan_submitted",
                    "context": {
                        "book": {"path": "/book"},
                        "minutes": {"path": "/minutes"},
                        "pace": {"path": "/pace"},
                    },
                }
            },
        },
        {"id": "submitText", "component": "Text", "text": "提交计划"},
    ]
    if error:
        form_children.append("validationError")
        components.append({
            "id": "validationError",
            "component": "Text",
            "text": error,
            "variant": "caption",
        })
    form_children.append("submit")
    return validate_generated_surface(AgUiGeneratedSurface.model_validate({
        "assistantText": error or "你可以继续调整计划，确认后再提交。",
        "components": components,
        "dataModel": {"book": book, "minutes": minutes, "pace": pace},
    }))


def _reading_plan_submitted_surface(
    *,
    book: str,
    minutes: int,
    pace: list[str],
) -> AgUiGeneratedSurface:
    """Build a stable read-only confirmation instead of regenerating the form."""

    return validate_generated_surface(AgUiGeneratedSurface.model_validate({
        "assistantText": "读书计划已提交。需要调整时可以原地修改。",
        "components": [
            {
                "id": "root",
                "component": "Column",
                "children": ["status", "card", "edit"],
            },
            {
                "id": "status",
                "component": "Text",
                "text": "✓ 已提交",
                "variant": "h2",
            },
            {"id": "card", "component": "Card", "child": "summary"},
            {
                "id": "summary",
                "component": "Column",
                "children": ["bookSummary", "minutesSummary", "paceSummary"],
            },
            {"id": "bookSummary", "component": "Text", "text": {"path": "/bookSummary"}},
            {
                "id": "minutesSummary",
                "component": "Text",
                "text": {"path": "/minutesSummary"},
            },
            {"id": "paceSummary", "component": "Text", "text": {"path": "/paceSummary"}},
            {
                "id": "edit",
                "component": "Button",
                "child": "editText",
                "variant": "default",
                "action": {
                    "event": {
                        "name": "reading_plan_edit_requested",
                        "context": {
                            "book": {"path": "/book"},
                            "minutes": {"path": "/minutes"},
                            "pace": {"path": "/pace"},
                        },
                    }
                },
            },
            {"id": "editText", "component": "Text", "text": "修改计划"},
        ],
        "dataModel": {
            "book": book,
            "minutes": minutes,
            "pace": pace,
            "bookSummary": f"书名：{book}",
            "minutesSummary": f"每日阅读：{minutes} 分钟",
            "paceSummary": f"阅读节奏：{'、'.join(pace)}",
        },
    }))


def build_known_action_surface(message: dict[str, Any] | None) -> AgUiGeneratedSurface | None:
    """Handle stable example actions without asking the model to invent lifecycle UI."""

    if not isinstance(message, dict):
        return None
    action = message.get("action")
    if not isinstance(action, dict):
        return None
    action_name = action.get("name")
    if not isinstance(action_name, str):
        return None
    normalized_name = action_name.strip().lower()
    context = action.get("context")
    context_keys = set(context) if isinstance(context, dict) else set()
    has_reading_plan_fields = bool(
        context_keys.intersection({"book", "bookName", "bookTitle"})
        and context_keys.intersection({"minutes", "dailyMinutes"})
    )
    names_reading_plan = "reading" in normalized_name and "plan" in normalized_name
    if not has_reading_plan_fields and not names_reading_plan:
        return None
    is_edit = normalized_name == "reading_plan_edit_requested" or any(
        token in normalized_name for token in ("edit", "modify")
    )
    is_submit = normalized_name == "reading_plan_submitted" or any(
        token in normalized_name for token in ("submit", "confirm", "save")
    )
    if not is_edit and not is_submit:
        return None
    book, minutes, pace = _reading_plan_values(message)
    if is_edit:
        return _reading_plan_form_surface(book=book, minutes=minutes, pace=pace)
    if not book:
        return _reading_plan_form_surface(
            book=book,
            minutes=minutes,
            pace=pace,
            error="请输入书名后再提交。",
        )
    return _reading_plan_submitted_surface(book=book, minutes=minutes, pace=pace)


def _validate_json_value(value: Any, *, path: str = "$", depth: int = 0) -> None:
    """Reject oversized, deeply nested, or prototype-polluting model output."""

    if depth > 12:
        raise ValueError(f"Model output is nested too deeply at {path}.")
    if isinstance(value, str):
        if len(value) > 4_000:
            raise ValueError(f"Model output string is too long at {path}.")
        return
    if value is None or isinstance(value, (bool, int, float)):
        return
    if isinstance(value, list):
        if len(value) > 128:
            raise ValueError(f"Model output list is too large at {path}.")
        for index, item in enumerate(value):
            _validate_json_value(item, path=f"{path}[{index}]", depth=depth + 1)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if key in _FORBIDDEN_KEYS:
                raise ValueError(f"Model output contains forbidden key at {path}.{key}.")
            if key in _FORBIDDEN_MODEL_FEATURES:
                raise ValueError(f"Model output contains forbidden client feature at {path}.{key}.")
            _validate_json_value(item, path=f"{path}.{key}", depth=depth + 1)
        return
    raise ValueError(f"Model output contains a non-JSON value at {path}.")


def _is_binding(value: Any) -> bool:
    """Return whether a value is a safe A2UI DataBinding."""

    return isinstance(value, dict) and set(value) == {"path"} and isinstance(value["path"], str)


def _validate_binding(value: Any, *, field: str, bindings: set[str]) -> None:
    """Validate a dynamic literal or DataBinding value."""

    if not isinstance(value, dict):
        return
    if not _is_binding(value):
        raise ValueError(f"{field} must be a literal or a single A2UI path binding.")
    pointer = value["path"]
    if not pointer.startswith("/") or any(part in _FORBIDDEN_KEYS for part in pointer.split("/")):
        raise ValueError(f"{field} contains an invalid data path: {pointer!r}.")
    bindings.add(pointer)


def _validate_dynamic_type(
    value: Any,
    *,
    field: str,
    expected: str,
    bindings: set[str],
) -> None:
    """Validate a literal now and defer bound value checks until dataModel is available."""

    if isinstance(value, dict):
        _validate_binding(value, field=field, bindings=bindings)
        return
    valid = {
        "string": isinstance(value, str),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "string-list": isinstance(value, list) and all(isinstance(item, str) for item in value),
    }[expected]
    if not valid:
        raise ValueError(f"{field} must be a {expected} literal or a matching path binding.")


def _validate_action(value: Any, *, component_id: str, bindings: set[str]) -> None:
    """Allow model-generated buttons to dispatch server events only."""

    if not isinstance(value, dict) or set(value) != {"event"}:
        raise ValueError(f"Button {component_id!r} must use exactly one server event action.")
    event = value.get("event")
    if not isinstance(event, dict) or not set(event).issubset({"name", "context"}):
        raise ValueError(f"Button {component_id!r} has an invalid event action.")
    name = event.get("name")
    if not isinstance(name, str) or not _ACTION_NAME_PATTERN.fullmatch(name):
        raise ValueError(f"Button {component_id!r} has an invalid event name.")
    context = event.get("context", {})
    if not isinstance(context, dict) or len(context) > 32:
        raise ValueError(f"Button {component_id!r} has invalid action context.")
    for key, item in context.items():
        if not isinstance(key, str) or not _COMPONENT_ID_PATTERN.fullmatch(key):
            raise ValueError(f"Button {component_id!r} has an invalid context key.")
        if isinstance(item, dict):
            _validate_binding(item, field=f"Button {component_id!r} context {key!r}", bindings=bindings)
        elif not (item is None or isinstance(item, (str, int, float, bool))):
            raise ValueError(f"Button {component_id!r} context values must be literals or bindings.")


def _component_references(component: dict[str, Any]) -> list[str]:
    """Return every child component id referenced by a supported component."""

    references: list[str] = []
    children = component.get("children")
    if isinstance(children, list):
        references.extend(item for item in children if isinstance(item, str))
    child = component.get("child")
    if isinstance(child, str):
        references.append(child)
    tabs = component.get("tabs")
    if isinstance(tabs, list):
        references.extend(tab["child"] for tab in tabs if isinstance(tab, dict) and isinstance(tab.get("child"), str))
    return references


def _resolve_json_pointer(data: dict[str, Any], pointer: str) -> Any:
    """Resolve a safe JSON Pointer against the generated data model."""

    current: Any = data
    for raw_part in pointer.removeprefix("/").split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        if isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
            continue
        raise ValueError(f"A2UI binding path does not exist in dataModel: {pointer!r}.")
    return current


def _replace_json_pointer(data: dict[str, Any], pointer: str, value: Any) -> None:
    """Replace an existing safe JSON Pointer value in the generated data model."""

    parts = pointer.removeprefix("/").split("/")
    current: Any = data
    for raw_part in parts[:-1]:
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        if isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
            continue
        raise ValueError(f"A2UI binding path does not exist in dataModel: {pointer!r}.")
    last_part = parts[-1].replace("~1", "/").replace("~0", "~")
    if isinstance(current, dict) and last_part in current:
        current[last_part] = value
        return
    if isinstance(current, list) and last_part.isdigit() and int(last_part) < len(current):
        current[int(last_part)] = value
        return
    raise ValueError(f"A2UI binding path does not exist in dataModel: {pointer!r}.")


def normalize_generated_surface(surface: AgUiGeneratedSurface) -> AgUiGeneratedSurface:
    """Apply narrow, semantics-preserving repairs for common A2UI model mistakes."""

    normalized = surface.model_copy(deep=True)
    component_ids = {
        component.get("id")
        for component in normalized.components
        if isinstance(component.get("id"), str)
    }
    for component in normalized.components:
        if component.get("component") is None:
            inferred = _infer_missing_component_type(component)
            if inferred is not None:
                component["component"] = inferred
        if component.get("component") != "ChoicePicker":
            if component.get("component") == "Button":
                child = component.get("child")
                if isinstance(child, str) and child not in component_ids:
                    label = "确认" if re.search(r"[\u4e00-\u9fff]", normalized.assistant_text) else "Submit"
                    normalized.components.append({"id": child, "component": "Text", "text": label})
                    component_ids.add(child)
            continue
        value = component.get("value")
        if isinstance(value, str):
            component["value"] = [value]
            continue
        if _is_binding(value):
            current = _resolve_json_pointer(normalized.data_model, value["path"])
            if isinstance(current, str):
                _replace_json_pointer(normalized.data_model, value["path"], [current])
    return normalized


def _infer_missing_component_type(component: dict[str, Any]) -> str | None:
    """Recover an omitted discriminator only when the remaining shape is unambiguous."""

    if "tabs" in component:
        return "Tabs"
    if "children" in component:
        return "Column"
    if "child" in component:
        return "Button" if "action" in component else "Card"
    if "options" in component:
        return "ChoicePicker"
    if "enableDate" in component or "enableTime" in component:
        return "DateTimeInput"
    if "max" in component:
        return "Slider"
    if "text" in component:
        return "Text"
    if "label" in component and "value" in component:
        return "TextField"
    if set(component).issubset({"id", "component", "axis", "weight"}):
        return "Divider"
    return None


def validate_generated_surface(surface: AgUiGeneratedSurface) -> AgUiGeneratedSurface:
    """Validate the model plan against the server-owned safe A2UI subset."""

    if len(surface.components) > MAX_COMPONENTS:
        raise ValueError("Generated A2UI plan exceeds the component limit.")
    serialized = json.dumps(surface.model_dump(by_alias=True), ensure_ascii=False, separators=(",", ":"))
    if len(serialized.encode("utf-8")) > MAX_PLAN_BYTES:
        raise ValueError("Generated A2UI plan exceeds the server size limit.")
    _validate_json_value(surface.model_dump(by_alias=True))

    components_by_id: dict[str, dict[str, Any]] = {}
    bindings: set[str] = set()
    binding_types: list[tuple[str, str, str]] = []
    for component in surface.components:
        component_id = component.get("id")
        component_name = component.get("component")
        if not isinstance(component_id, str) or not _COMPONENT_ID_PATTERN.fullmatch(component_id):
            raise ValueError("Every A2UI component requires a safe, non-empty id.")
        if component_id in components_by_id:
            raise ValueError(f"Duplicate A2UI component id: {component_id!r}.")
        if not isinstance(component_name, str) or component_name not in _ALLOWED_COMPONENT_PROPERTIES:
            raise ValueError(f"A2UI component is not server-allowed: {component_name!r}.")
        unknown = set(component) - _ALLOWED_COMPONENT_PROPERTIES[component_name]
        missing = _REQUIRED_COMPONENT_PROPERTIES[component_name] - set(component)
        if unknown:
            raise ValueError(f"Component {component_id!r} has unsupported properties: {sorted(unknown)}.")
        if missing:
            raise ValueError(f"Component {component_id!r} is missing properties: {sorted(missing)}.")
        weight = component.get("weight")
        if weight is not None and (isinstance(weight, bool) or not isinstance(weight, (int, float)) or weight < 0):
            raise ValueError(f"Component {component_id!r} has an invalid weight.")

        if component_name in {"Row", "Column", "List"}:
            children = component.get("children")
            if not isinstance(children, list) or not all(isinstance(item, str) for item in children):
                raise ValueError(f"Component {component_id!r} children must be an id array.")
        if component_name in {"Card", "Button"} and not isinstance(component.get("child"), str):
            raise ValueError(f"Component {component_id!r} child must be an id.")
        if component_name == "Tabs":
            tabs = component.get("tabs")
            if not isinstance(tabs, list) or not tabs:
                raise ValueError(f"Component {component_id!r} requires at least one tab.")
            for tab in tabs:
                if not isinstance(tab, dict) or set(tab) != {"title", "child"}:
                    raise ValueError(f"Component {component_id!r} has an invalid tab.")
                if not isinstance(tab["title"], str) or not isinstance(tab["child"], str):
                    raise ValueError(f"Component {component_id!r} tab values must be strings.")
        if component_name == "Button":
            _validate_action(component.get("action"), component_id=component_id, bindings=bindings)
        dynamic_types: dict[str, str] = {}
        if component_name == "Text":
            dynamic_types["text"] = "string"
        if "label" in component:
            dynamic_types["label"] = "string"
        if component_name == "TextField" and "value" in component:
            dynamic_types["value"] = "string"
        if component_name == "CheckBox":
            dynamic_types["value"] = "boolean"
        if component_name == "ChoicePicker":
            dynamic_types["value"] = "string-list"
        if component_name == "Slider":
            dynamic_types.update({field: "number" for field in ("min", "max", "value") if field in component})
        if component_name == "DateTimeInput":
            dynamic_types.update({field: "string" for field in ("value", "min", "max") if field in component})
        for field, expected in dynamic_types.items():
            value = component[field]
            _validate_dynamic_type(
                value,
                field=f"Component {component_id!r} {field}",
                expected=expected,
                bindings=bindings,
            )
            if _is_binding(value):
                binding_types.append((value["path"], expected, f"Component {component_id!r} {field}"))

        enum_values: dict[str, set[str]] = {
            "Text.variant": {"h1", "h2", "h3", "h4", "h5", "caption", "body"},
            "Row.justify": {"center", "end", "spaceAround", "spaceBetween", "spaceEvenly", "start", "stretch"},
            "Column.justify": {"start", "center", "end", "spaceBetween", "spaceAround", "spaceEvenly", "stretch"},
            "Row.align": {"start", "center", "end", "stretch"},
            "Column.align": {"start", "center", "end", "stretch"},
            "List.direction": {"vertical", "horizontal"},
            "List.align": {"start", "center", "end", "stretch"},
            "Divider.axis": {"horizontal", "vertical"},
            "Button.variant": {"default", "primary", "borderless"},
            "TextField.variant": {"longText", "number", "shortText"},
            "ChoicePicker.variant": {"multipleSelection", "mutuallyExclusive"},
            "ChoicePicker.displayStyle": {"checkbox", "chips"},
        }
        for qualified, allowed in enum_values.items():
            expected_component, field = qualified.split(".", maxsplit=1)
            if component_name == expected_component and field in component and component[field] not in allowed:
                raise ValueError(f"Component {component_id!r} has an invalid {field} value.")
        for boolean_field in ("filterable", "enableDate", "enableTime"):
            if boolean_field in component and not isinstance(component[boolean_field], bool):
                raise ValueError(f"Component {component_id!r} {boolean_field} must be boolean.")
        if component_name == "ChoicePicker":
            options = component.get("options")
            if not isinstance(options, list) or not options or len(options) > 32:
                raise ValueError(f"Component {component_id!r} requires 1-32 options.")
            for option in options:
                if not isinstance(option, dict) or set(option) != {"label", "value"}:
                    raise ValueError(f"Component {component_id!r} has an invalid option.")
                if not isinstance(option["label"], str) or not isinstance(option["value"], str):
                    raise ValueError(f"Component {component_id!r} option values must be strings.")
        components_by_id[component_id] = component

    if "root" not in components_by_id:
        raise ValueError("Generated A2UI surface requires a component with id 'root'.")
    for component in surface.components:
        for reference in _component_references(component):
            if reference not in components_by_id:
                raise ValueError(f"A2UI component {component['id']!r} references missing id {reference!r}.")

    visited: set[str] = set()
    active: set[str] = set()

    def visit(component_id: str) -> None:
        if component_id in active:
            raise ValueError(f"A2UI component graph contains a cycle at {component_id!r}.")
        if component_id in visited:
            return
        active.add(component_id)
        for reference in _component_references(components_by_id[component_id]):
            visit(reference)
        active.remove(component_id)
        visited.add(component_id)

    visit("root")
    unreachable = set(components_by_id) - visited
    if unreachable:
        raise ValueError(f"A2UI components are unreachable from root: {sorted(unreachable)}.")
    for pointer in bindings:
        _resolve_json_pointer(surface.data_model, pointer)
    for pointer, expected, field in binding_types:
        value = _resolve_json_pointer(surface.data_model, pointer)
        valid = {
            "string": isinstance(value, str),
            "number": isinstance(value, (int, float)) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
            "string-list": isinstance(value, list) and all(isinstance(item, str) for item in value),
        }[expected]
        if not valid:
            raise ValueError(f"{field} path {pointer!r} must resolve to {expected} data.")
    return surface


def parse_generated_surface(content: str) -> AgUiGeneratedSurface:
    """Parse and validate one JSON-only model response."""

    try:
        payload = json.loads(content)
    except json.JSONDecodeError as error:
        raise ValueError(f"DeepSeek returned invalid JSON: {error.msg}.") from error
    try:
        surface = AgUiGeneratedSurface.model_validate(payload)
    except ValidationError as error:
        raise ValueError(f"DeepSeek returned an invalid surface shape: {error.errors(include_url=False)}") from error
    return validate_generated_surface(normalize_generated_surface(surface))


async def generate_deepseek_surface(
    settings: BackendSettings,
    history: list[dict[str, str]],
    latest_input: str,
) -> AgUiModelGeneration:
    """Call the configured DeepSeek model in JSON mode and validate its UI plan."""

    if not settings.deepseek_api_key:
        raise ValueError("DEEPSEEK_API_KEY is required for the real AG-UI/A2UI agent.")

    messages: list[dict[str, str]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *_bound_history(history),
        {"role": "user", "content": latest_input[:8_000]},
    ]
    last_error: Exception | None = None
    # This reference backend should behave consistently across developer machines.
    # In particular, an unbracketed IPv6 entry such as ``::1`` in NO_PROXY can
    # make httpx reject the client before the request starts. External proxy
    # routing remains an application concern and can be supplied by replacing
    # this example generator.
    async with _create_deepseek_http_client() as http_client:
        client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=build_openai_compatible_base_url(settings.deepseek_base_url),
            max_retries=2,
            timeout=60.0,
            http_client=http_client,
        )
        for attempt in range(2):
            response = await client.chat.completions.create(
                model=settings.deepseek_model,
                messages=messages,  # type: ignore[arg-type]
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=6_000,
            )
            content = response.choices[0].message.content or ""
            try:
                surface = parse_generated_surface(content)
            except ValueError as error:
                last_error = error
                if attempt == 1:
                    break
                messages.extend(
                    [
                        {"role": "assistant", "content": content[:6_000] or "{}"},
                        {
                            "role": "user",
                            "content": (
                                "上一个 JSON 不符合约束。修复后只返回完整 JSON object。"
                                f"校验错误：{str(error)[:1_000]}"
                            ),
                        },
                    ]
                )
                continue

            usage = response.usage.model_dump() if response.usage is not None else {}
            return AgUiModelGeneration(
                surface=surface,
                model=response.model,
                usage=usage,
                response_id=response.id,
            )

    raise ValueError(f"DeepSeek did not return a valid A2UI plan after repair: {last_error}")


def _create_deepseek_http_client() -> httpx.AsyncClient:
    """Create the deterministic network client used by the reference model call."""

    return httpx.AsyncClient(trust_env=False, timeout=60.0)


def _frontend_answer_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Accept only explicitly marked frontend presentation tools."""

    resolved: list[dict[str, Any]] = []
    names: set[str] = set()
    for tool in tools[:32]:
        metadata = tool.get("metadata")
        if not isinstance(metadata, dict) or metadata.get("kind") != "frontend-answer-component":
            continue
        name = tool.get("name")
        description = tool.get("description")
        parameters = tool.get("parameters")
        if not isinstance(name, str) or not _ACTION_NAME_PATTERN.fullmatch(name):
            raise ValueError("Frontend answer component has an invalid name.")
        if name == "render_a2ui_surface" or name in names:
            raise ValueError(f"Frontend answer component name is reserved or duplicated: {name}.")
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"Frontend answer component {name} requires a description.")
        if not isinstance(parameters, dict) or parameters.get("type") != "object":
            raise ValueError(f"Frontend answer component {name} requires an object parameters schema.")
        _validate_json_value(parameters)
        names.add(name)
        resolved.append({
            "type": "function",
            "function": {
                "name": name,
                "description": description[:1_000],
                "parameters": parameters,
            },
        })
    return resolved


def _parse_answer_component_props(name: str, arguments: str) -> dict[str, Any]:
    """Validate one model-selected frontend component payload."""

    if len(arguments.encode("utf-8")) > MAX_PLAN_BYTES:
        raise ValueError(f"Frontend answer component {name} props are too large.")
    try:
        props = json.loads(arguments)
    except json.JSONDecodeError as error:
        raise ValueError(f"Frontend answer component {name} returned invalid JSON.") from error
    if not isinstance(props, dict):
        raise ValueError(f"Frontend answer component {name} props must be an object.")
    _validate_json_value(props)
    return props


async def generate_deepseek_chat_response(
    settings: BackendSettings,
    history: list[dict[str, str]],
    latest_input: str,
    tools: list[dict[str, Any]],
) -> AgUiChatGeneration:
    """Let the model choose text, a registered frontend component, or A2UI."""

    if not settings.deepseek_api_key:
        raise ValueError("DEEPSEEK_API_KEY is required for the real unified chat agent.")

    frontend_tools = _frontend_answer_tools(tools)
    allowed_component_names = {
        tool["function"]["name"]
        for tool in frontend_tools
    }
    model_tools = [*frontend_tools, _A2UI_RENDER_TOOL]
    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                _CHAT_SYSTEM_PROMPT
                + "\n调用 render_a2ui_surface 只表示选择动态界面；不要把组件树放进参数，"
                "后端会交给受 Catalog 和安全校验约束的专用生成器。"
            ),
        },
        *_bound_history(history),
        {"role": "user", "content": latest_input[:8_000]},
    ]
    last_error: Exception | None = None

    async with _create_deepseek_http_client() as http_client:
        client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=build_openai_compatible_base_url(settings.deepseek_base_url),
            max_retries=2,
            timeout=60.0,
            http_client=http_client,
        )
        for attempt in range(2):
            response = await client.chat.completions.create(
                model=settings.deepseek_model,
                messages=messages,  # type: ignore[arg-type]
                tools=model_tools,  # type: ignore[arg-type]
                tool_choice="auto",
                temperature=0.1,
                max_tokens=6_000,
            )
            output = response.choices[0].message
            usage = response.usage.model_dump() if response.usage is not None else {}
            tool_calls = output.tool_calls or []
            try:
                if len(tool_calls) > 1:
                    raise ValueError("Unified chat model may select at most one answer component.")
                if tool_calls:
                    function = tool_calls[0].function
                    if function.name == "render_a2ui_surface":
                        return await generate_deepseek_surface(settings, history, latest_input)
                    if function.name not in allowed_component_names:
                        raise ValueError(f"Model selected an unregistered answer component: {function.name}.")
                    props = _parse_answer_component_props(function.name, function.arguments)
                    return AgUiAnswerComponentGeneration(
                        name=function.name,
                        props=props,
                        assistant_text=(output.content or "").strip(),
                        model=response.model,
                        usage=usage,
                        response_id=response.id,
                    )

                text = (output.content or "").strip()
                if not text:
                    raise ValueError("Unified chat model returned neither text nor an answer component.")
                return AgUiTextGeneration(
                    assistant_text=text,
                    model=response.model,
                    usage=usage,
                    response_id=response.id,
                )
            except ValueError as error:
                last_error = error
                if attempt == 1:
                    break
                messages.append({
                    "role": "user",
                    "content": f"上一个回答不符合前端能力约束，请重新选择一次。错误：{str(error)[:1_000]}",
                })

    raise ValueError(f"DeepSeek did not return a valid unified chat answer after repair: {last_error}")


def _generation_assistant_text(generation: AgUiChatGeneration) -> str:
    if isinstance(generation, AgUiModelGeneration):
        return generation.surface.assistant_text
    return generation.assistant_text


def build_a2ui_surface_messages(surface: AgUiGeneratedSurface) -> list[dict[str, Any]]:
    """Wrap a validated model plan in server-owned A2UI protocol envelopes."""

    return [
        {
            "version": "v0.9.1",
            "createSurface": {
                "surfaceId": A2UI_SURFACE_ID,
                "catalogId": A2UI_BASIC_CATALOG_ID,
                "sendDataModel": True,
            },
        },
        {
            "version": "v0.9.1",
            "updateComponents": {
                "surfaceId": A2UI_SURFACE_ID,
                "components": surface.components,
            },
        },
        {
            "version": "v0.9.1",
            "updateDataModel": {
                "surfaceId": A2UI_SURFACE_ID,
                "path": "/",
                "value": surface.data_model,
            },
        },
    ]


async def _yield_event(event: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Yield one event while leaving a small visible streaming boundary."""

    yield event
    await asyncio.sleep(0.01)


async def stream_agui_events(
    request: AgUiRunAgentInput,
    settings: BackendSettings,
    generator: AgUiSurfaceGenerator | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Stream one chat where text, frontend components, and A2UI are answer forms."""

    client_transport = _read_a2ui_client_transport(request)
    client_message = client_transport["message"]
    known_action_surface = build_known_action_surface(client_message)
    latest_input = _latest_input(request)
    lock = await agui_agent_session_store.lock_for(request.thread_id)
    source = "application" if known_action_surface is not None else "deepseek"

    async for event in _yield_event(
        {
            "type": "RUN_STARTED",
            "threadId": request.thread_id,
            "runId": request.run_id,
            **({"parentRunId": request.parent_run_id} if request.parent_run_id else {}),
        }
    ):
        yield event
    if known_action_surface is None:
        async for event in _yield_event(
            {"type": "THINKING_START", "title": "DeepSeek 正在组织回答"}
        ):
            yield event
    async for event in _yield_event(
        {
            "type": "STATE_SNAPSHOT",
            "snapshot": {
                "example": "ag-ui-a2ui-deepseek-agent",
                "status": "updating" if known_action_surface is not None else "generating",
                "source": source,
                "configuredModel": settings.deepseek_model,
            },
        }
    ):
        yield event

    try:
        if known_action_surface is not None:
            generation = AgUiModelGeneration(
                surface=known_action_surface,
                model="deterministic-action-handler",
                usage={},
            )
        else:
            async with lock:
                stored_history = await agui_agent_session_store.history(request.thread_id)
                request_history = _request_history(request)
                history = stored_history or request_history[:-1]
                generation = (
                    await generator(settings, history, latest_input)
                    if generator is not None
                    else await generate_deepseek_chat_response(
                        settings,
                        history,
                        latest_input,
                        request.tools,
                    )
                )
                await agui_agent_session_store.append_turn(
                    request.thread_id,
                    latest_input,
                    _generation_assistant_text(generation),
                )
    except Exception as error:
        if known_action_surface is None:
            async for event in _yield_event({"type": "THINKING_END"}):
                yield event
        async for event in _yield_event(
            {
                "type": "RUN_ERROR",
                "message": str(error),
                "code": "AGUI_MODEL_GENERATION_FAILED",
            }
        ):
            yield event
        return

    assistant_message_id = f"message:assistant:{request.run_id}"
    tool_call_name = (
        generation.name
        if isinstance(generation, AgUiAnswerComponentGeneration)
        else "render_a2ui_surface"
    )
    tool_call_id = f"tool:{tool_call_name}:{request.run_id}"
    if known_action_surface is None:
        async for event in _yield_event({"type": "THINKING_END"}):
            yield event
        response_events: list[dict[str, Any]] = []
        assistant_text = _generation_assistant_text(generation)
        if assistant_text:
            response_events.extend([
                {
                    "type": "TEXT_MESSAGE_START",
                    "messageId": assistant_message_id,
                    "role": "assistant",
                },
                {
                    "type": "TEXT_MESSAGE_CONTENT",
                    "messageId": assistant_message_id,
                    "delta": assistant_text,
                },
                {"type": "TEXT_MESSAGE_END", "messageId": assistant_message_id},
            ])
        if isinstance(generation, AgUiModelGeneration):
            tool_arguments = {
                "surfaceId": A2UI_SURFACE_ID,
                "components": generation.surface.components,
                "dataModel": generation.surface.data_model,
            }
            tool_result = {
                "ok": True,
                "source": "deepseek",
                "model": generation.model,
                "componentCount": len(generation.surface.components),
            }
        elif isinstance(generation, AgUiAnswerComponentGeneration):
            tool_arguments = generation.props
            tool_result = {
                "ok": True,
                "source": "deepseek",
                "model": generation.model,
                "renderedBy": "frontend",
            }
        else:
            tool_arguments = None
            tool_result = None

        if tool_arguments is not None and tool_result is not None:
            response_events.extend([
                {
                    "type": "TOOL_CALL_START",
                    "toolCallId": tool_call_id,
                    "toolCallName": tool_call_name,
                    **({"parentMessageId": assistant_message_id} if assistant_text else {}),
                },
                {
                    "type": "TOOL_CALL_ARGS",
                    "toolCallId": tool_call_id,
                    "delta": json.dumps(
                        tool_arguments,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
                {"type": "TOOL_CALL_END", "toolCallId": tool_call_id},
                {
                    "type": "TOOL_CALL_RESULT",
                    "messageId": f"message:tool:{request.run_id}",
                    "toolCallId": tool_call_id,
                    "content": json.dumps(
                        tool_result,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
            ])

        for event in response_events:
            async for streamed in _yield_event(event):
                yield streamed

    if isinstance(generation, AgUiModelGeneration):
        for message in build_a2ui_surface_messages(generation.surface):
            async for event in _yield_event({"type": "CUSTOM", "name": "a2ui", "value": message}):
                yield event

    for event in (
        {
            "type": "STATE_SNAPSHOT",
            "snapshot": {
                "example": "ag-ui-a2ui-deepseek-agent",
                "status": "completed",
                "source": source,
                "model": generation.model,
                "usage": generation.usage,
                "responseId": generation.response_id,
            },
        },
        {
            "type": "RUN_FINISHED",
            "threadId": request.thread_id,
            "runId": request.run_id,
            "result": {
                "provider": source,
                "model": generation.model,
                "usage": generation.usage,
                "responseId": generation.response_id,
            },
            "outcome": {"type": "success"},
        },
    ):
        async for streamed in _yield_event(event):
            yield streamed
