import type { RuntimeData } from '../../runtime/types';
import type { AgnoEvent, AgnoToolPayload } from './types';

/**
 * 从未知值中读取非空字符串。
 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value
    : undefined;
}

/**
 * 从未知值中读取普通对象。
 */
function readRecord(value: unknown): RuntimeData | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RuntimeData
    : undefined;
}

/**
 * 把 Agno 的事件名统一转换成 snake_case，兼容官方枚举和字符串写法。
 */
export function normalizeAgnoEventName(eventName: string): string {
  const trimmed = eventName.trim().replace(/^RunEvent\./, '');
  const dotted = trimmed.replace(/[.\-]/g, '_');

  if (dotted.includes('_')) {
    return dotted.toLowerCase();
  }

  return dotted
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1_$2')
    .toLowerCase();
}

/**
 * 读取 Agno 事件里的 tool 对象。
 */
export function extractTool(packet: AgnoEvent): AgnoToolPayload | undefined {
  const tool = readRecord(packet.tool);
  return tool as AgnoToolPayload | undefined;
}

/**
 * 读取 Agno run 的显式 id。
 */
export function extractExplicitRunId(packet: AgnoEvent): string | undefined {
  return readString(packet.run_id)
    ?? readString(packet.runId)
    ?? readString(packet.session_id)
    ?? readString(packet.sessionId);
}

/**
 * 读取 Agno run 的显示标题。
 */
export function extractRunTitle(packet: AgnoEvent): string | undefined {
  if (typeof packet.agent === 'string') {
    return readString(packet.agent);
  }

  const agent = readRecord(packet.agent);
  return readString(agent?.name)
    ?? readString(packet.agent_name)
    ?? readString(packet.name);
}

/**
 * 读取 Agno content 增量文本。
 */
export function extractContent(packet: AgnoEvent): string | undefined {
  return readString(packet.content)
    ?? readString(packet.delta)
    ?? readString(packet.text);
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
 * 读取工具名称。
 */
export function extractToolName(tool: AgnoToolPayload | undefined): string | undefined {
  if (!tool) {
    return undefined;
  }

  return readString(tool.tool_name)
    ?? readString(tool.name);
}

/**
 * 读取工具参数。
 */
export function extractToolArgs(tool: AgnoToolPayload | undefined): unknown {
  if (!tool) {
    return undefined;
  }

  return tool.tool_args ?? tool.arguments ?? tool.args ?? tool.input;
}

/**
 * 读取工具结果。
 */
export function extractToolResult(packet: AgnoEvent, tool: AgnoToolPayload | undefined): unknown {
  return normalizeToolResult(tool?.result ?? tool?.output ?? tool?.content ?? packet.result);
}

/**
 * 读取工具原始 id。
 */
export function extractToolRawId(tool: AgnoToolPayload | undefined): string | undefined {
  if (!tool) {
    return undefined;
  }

  return readString(tool.id)
    ?? readString(tool.tool_call_id);
}

/**
 * 读取错误消息。
 */
export function extractErrorMessage(packet: AgnoEvent): string {
  const directMessage = readString(packet.message)
    ?? readString(packet.reason);

  if (directMessage) {
    return directMessage;
  }

  if (typeof packet.error === 'string' && packet.error.length > 0) {
    return packet.error;
  }

  return 'Agno stream failed.';
}
