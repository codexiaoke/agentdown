import type { RuntimeData } from '../../runtime/types';
import type {
  AutoGenEvent,
  AutoGenToolCall,
  AutoGenToolPayload,
  AutoGenToolResult
} from './types';

/**
 * 从未知值中读取非空字符串。
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value
    : undefined;
}

/**
 * 从未知值中读取对象数组。
 */
function readRecordArray<T extends RuntimeData = RuntimeData>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

/**
 * 尝试把一个 JSON 字符串解析成结构化结果。
 */
function tryParseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * 尝试把 Python `repr` 风格的字典/数组字符串转换成 JSON。
 */
function normalizePythonLiteralString(value: string): string {
  return value
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content: string) => {
      const normalized = content
        .replace(/\\'/g, '\'')
        .replace(/\\\\/g, '\\');

      return JSON.stringify(normalized);
    });
}

/**
 * 尽量把工具结果字符串恢复成结构化对象，方便前端 renderer 直接消费。
 */
function normalizeToolResult(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }

  const directJson = tryParseJsonString(trimmed);

  if (directJson !== trimmed) {
    return directJson;
  }

  const normalizedPythonLiteral = normalizePythonLiteralString(trimmed);
  const parsedPythonLiteral = tryParseJsonString(normalizedPythonLiteral);

  return parsedPythonLiteral !== normalizedPythonLiteral
    ? parsedPythonLiteral
    : value;
}

/**
 * 把 AutoGen 事件类型统一转成 snake_case。
 */
export function normalizeAutoGenEventName(eventName: string): string {
  const trimmed = eventName.trim().replace(/[.\-]/g, '_');

  if (trimmed.includes('_')) {
    return trimmed.toLowerCase();
  }

  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1_$2')
    .toLowerCase();
}

/**
 * 判断当前事件是否来自 assistant。
 */
export function isAssistantEvent(packet: AutoGenEvent): boolean {
  return readString(packet.source) === 'assistant';
}

/**
 * 判断当前事件是否来自 user。
 */
export function isUserEvent(packet: AutoGenEvent): boolean {
  return readString(packet.source) === 'user';
}

/**
 * 读取 assistant 文本消息内容。
 */
export function extractAssistantText(packet: AutoGenEvent): string | undefined {
  return typeof packet.content === 'string'
    ? readString(packet.content)
    : undefined;
}

/**
 * 读取 assistant 消息的稳定 id。
 */
export function extractAssistantMessageId(packet: AutoGenEvent): string | undefined {
  return readString(packet.full_message_id)
    ?? readString(packet.id);
}

/**
 * 读取错误消息。
 */
export function extractErrorMessage(packet: AutoGenEvent): string {
  const directMessage = readString(packet.message)
    ?? readString(packet.reason);

  if (directMessage) {
    return directMessage;
  }

  if (typeof packet.error === 'string' && packet.error.length > 0) {
    return packet.error;
  }

  const contentMessage = extractAssistantText(packet);

  if (contentMessage) {
    return contentMessage;
  }

  return 'AutoGen stream failed.';
}

/**
 * 把 AutoGen 原始工具调用请求条目解析成统一工具载荷。
 */
function buildRequestedTool(item: AutoGenToolCall): AutoGenToolPayload {
  const tool: AutoGenToolPayload = {};
  const rawId = readString(item.id);
  const name = readString(item.name);
  const argumentsText = readString(item.arguments);

  if (rawId !== undefined) {
    tool.id = rawId;
    tool.call_id = rawId;
  }

  if (name !== undefined) {
    tool.name = name;
  }

  if (argumentsText !== undefined) {
    tool.input = normalizeToolResult(argumentsText);
  }

  return tool;
}

/**
 * 把 AutoGen 原始工具执行结果条目解析成统一工具载荷。
 */
function buildExecutedTool(item: AutoGenToolResult): AutoGenToolPayload {
  const tool: AutoGenToolPayload = {};
  const callId = readString(item.call_id);
  const name = readString(item.name);
  const result = normalizeToolResult(item.content);

  if (callId !== undefined) {
    tool.id = callId;
    tool.call_id = callId;
  }

  if (name !== undefined) {
    tool.name = name;
  }

  if (result !== undefined) {
    tool.result = result;
  }

  if (item.content !== undefined) {
    tool.content = item.content;
  }

  if (typeof item.is_error === 'boolean') {
    tool.is_error = item.is_error;
  }

  return tool;
}

/**
 * 读取 ToolCallRequestEvent 里的工具调用列表。
 */
export function extractRequestedTools(packet: AutoGenEvent): AutoGenToolPayload[] {
  const items = readRecordArray<AutoGenToolCall>(packet.content);
  return items.map(buildRequestedTool);
}

/**
 * 读取 ToolCallExecutionEvent 里的工具结果列表。
 */
export function extractExecutedTools(packet: AutoGenEvent): AutoGenToolPayload[] {
  const items = readRecordArray<AutoGenToolResult>(packet.content);
  return items.map(buildExecutedTool);
}

/**
 * 读取 ToolCallSummaryMessage 里的工具结果列表，用作执行事件缺失时的兜底。
 */
export function extractSummaryTools(packet: AutoGenEvent): AutoGenToolPayload[] {
  const calls = readRecordArray<AutoGenToolCall>(packet.tool_calls);
  const results = readRecordArray<AutoGenToolResult>(packet.results);

  return results.map((result) => {
    const matchedCall = calls.find((call) => readString(call.id) === readString(result.call_id));
    const tool = buildExecutedTool(result);
    const fallbackTool = matchedCall ? buildRequestedTool(matchedCall) : undefined;

    if (tool.name === undefined && fallbackTool?.name !== undefined) {
      tool.name = fallbackTool.name;
    }

    if (tool.input === undefined && fallbackTool?.input !== undefined) {
      tool.input = fallbackTool.input;
    }

    if (tool.id === undefined && fallbackTool?.id !== undefined) {
      tool.id = fallbackTool.id;
    }

    if (tool.call_id === undefined && fallbackTool?.call_id !== undefined) {
      tool.call_id = fallbackTool.call_id;
    }

    return tool;
  });
}

/**
 * 读取工具名称。
 */
export function extractToolName(tool: AutoGenToolPayload | undefined): string | undefined {
  return readString(tool?.name);
}

/**
 * 读取工具参数。
 */
export function extractToolArgs(tool: AutoGenToolPayload | undefined): unknown {
  return tool?.input;
}

/**
 * 读取工具结果。
 */
export function extractToolResult(
  _packet: AutoGenEvent,
  tool: AutoGenToolPayload | undefined
): unknown {
  return tool?.result ?? tool?.content;
}

/**
 * 读取工具原始 id。
 */
export function extractToolRawId(tool: AutoGenToolPayload | undefined): string | undefined {
  return readString(tool?.id)
    ?? readString(tool?.call_id);
}
