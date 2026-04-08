import type { RuntimeData } from '../../runtime/types';
import type {
  LangChainEvent,
  LangChainInterruptPayload,
  LangChainToolPayload
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
 * 从未知值中读取普通对象。
 */
function readRecord(value: unknown): RuntimeData | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RuntimeData
    : undefined;
}

/**
 * 从未知值中读取对象数组。
 */
function readRecordArray(value: unknown): RuntimeData[] {
  return Array.isArray(value)
    ? value.map((item) => readRecord(item)).filter((item): item is RuntimeData => item !== undefined)
    : [];
}

/**
 * 从未知值中读取字符串数组。
 */
function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/**
 * 尝试把 JSON 字符串解析成结构化对象。
 */
function tryParseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * 尽量把 LangChain tool `content` 字符串恢复成结构化对象。
 */
function normalizeToolContent(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }

  const parsed = tryParseJsonString(trimmed);
  return parsed !== trimmed ? parsed : value;
}

/**
 * 从 LangChain 字符串化的 tool output 里提取某个字段。
 */
function readNamedStringField(value: string, field: string): string | undefined {
  const pattern = new RegExp(`${field}='([\\s\\S]*?)'(?=\\s+[a-zA-Z_]+='|$)`);
  const matched = value.match(pattern);
  return matched?.[1];
}

/**
 * 把 LangChain `on_tool_end` 里常见的字符串输出恢复成对象。
 */
function parseToolOutputString(value: string): RuntimeData | undefined {
  const content = readNamedStringField(value, 'content');
  const name = readNamedStringField(value, 'name');
  const toolCallId = readNamedStringField(value, 'tool_call_id');

  if (content === undefined && name === undefined && toolCallId === undefined) {
    return undefined;
  }

  const parsed: RuntimeData = {};

  if (content !== undefined) {
    parsed.content = normalizeToolContent(content);
  }

  if (name !== undefined) {
    parsed.name = name;
  }

  if (toolCallId !== undefined) {
    parsed.tool_call_id = toolCallId;
  }

  return parsed;
}

/**
 * 统一读取 `data.output` 里的工具输出结构。
 */
function extractToolOutputRecord(value: unknown): RuntimeData | undefined {
  const record = readRecord(value);

  if (record) {
    return record;
  }

  return typeof value === 'string'
    ? parseToolOutputString(value)
    : undefined;
}

/**
 * 统一规范 LangChain 事件名，兼容大小写和分隔符差异。
 */
export function normalizeLangChainEventName(eventName: string): string {
  return eventName
    .trim()
    .replace(/[.\-]/g, '_')
    .toLowerCase();
}

/**
 * 读取 LangChain 事件上的父级 id 链。
 */
export function extractParentIds(packet: LangChainEvent): string[] {
  return readStringArray(packet.parent_ids);
}

/**
 * 判断当前事件是否是整次 LangGraph 根运行的开始。
 */
export function isRootChainStart(packet: LangChainEvent): boolean {
  return normalizeLangChainEventName(packet.event) === 'on_chain_start'
    && extractParentIds(packet).length === 0
    && readString(packet.run_id) !== undefined;
}

/**
 * 判断当前事件是否是整次 LangGraph 根运行的结束。
 */
export function isRootChainEnd(packet: LangChainEvent): boolean {
  return normalizeLangChainEventName(packet.event) === 'on_chain_end'
    && extractParentIds(packet).length === 0
    && readString(packet.run_id) !== undefined;
}

/**
 * 读取 LangChain 根 run 的稳定 id。
 *
 * 规则：
 * - 子事件优先使用 `parent_ids[0]` 作为根 run id
 * - 根 `on_chain_start` / `on_chain_end` 使用自己的 `run_id`
 */
export function extractExplicitRunId(packet: LangChainEvent): string | undefined {
  const parentIds = extractParentIds(packet);

  if (parentIds.length > 0) {
    return parentIds[0];
  }

  return readString(packet.run_id);
}

/**
 * 读取 LangChain 根 run 的显示标题。
 */
export function extractRunTitle(packet: LangChainEvent): string | undefined {
  return readString(packet.name);
}

/**
 * 读取 `on_chat_model_stream` 里的增量文本内容。
 */
export function extractContent(packet: LangChainEvent): string | undefined {
  const data = readRecord(packet.data);
  const chunk = readRecord(data?.chunk);
  return readString(chunk?.content);
}

/**
 * 读取 LangChain root `on_chain_stream` 里携带的 interrupt 列表。
 */
export function extractInterrupts(packet: LangChainEvent): LangChainInterruptPayload[] {
  const data = readRecord(packet.data);
  const chunk = readRecord(data?.chunk);
  return readRecordArray(chunk?.__interrupt__) as LangChainInterruptPayload[];
}

/**
 * 从 LangChain tool 事件中构造一个统一的工具载荷。
 */
export function extractTool(packet: LangChainEvent): LangChainToolPayload | undefined {
  const eventName = normalizeLangChainEventName(packet.event);

  if (
    eventName !== 'on_tool_start'
    && eventName !== 'on_tool_end'
    && eventName !== 'on_tool_error'
  ) {
    return undefined;
  }

  const data = readRecord(packet.data);
  const output = extractToolOutputRecord(data?.output);
  const id = readString(packet.run_id);
  const name = readString(packet.name) ?? readString(output?.name);
  const result = normalizeToolContent(output?.content);
  const tool: LangChainToolPayload = {};

  if (id !== undefined) {
    tool.id = id;
  }

  if (name !== undefined) {
    tool.name = name;
  }

  const toolCallId = readString(output?.tool_call_id);

  if (toolCallId !== undefined) {
    tool.tool_call_id = toolCallId;
  }

  if (data?.input !== undefined) {
    tool.input = data.input;
  }

  if (output !== undefined) {
    tool.output = output;
  }

  if (result !== undefined) {
    tool.result = result;
  }

  if (output?.content !== undefined) {
    tool.content = output.content;
  }

  return tool;
}

/**
 * 读取工具名称。
 */
export function extractToolName(tool: LangChainToolPayload | undefined): string | undefined {
  return readString(tool?.name);
}

/**
 * 读取工具参数。
 */
export function extractToolArgs(tool: LangChainToolPayload | undefined): unknown {
  return tool?.input;
}

/**
 * 读取工具结果。
 */
export function extractToolResult(
  _packet: LangChainEvent,
  tool: LangChainToolPayload | undefined
): unknown {
  return tool?.result ?? tool?.output ?? tool?.content;
}

/**
 * 读取工具原始 id。
 */
export function extractToolRawId(tool: LangChainToolPayload | undefined): string | undefined {
  return readString(tool?.id)
    ?? readString(tool?.tool_call_id);
}

/**
 * 读取错误消息。
 */
export function extractErrorMessage(packet: LangChainEvent): string {
  const data = readRecord(packet.data);
  const dataMessage = readString(data?.message);

  if (dataMessage) {
    return dataMessage;
  }

  const directMessage = readString(packet.message)
    ?? readString(packet.reason);

  if (directMessage) {
    return directMessage;
  }

  if (typeof packet.error === 'string' && packet.error.length > 0) {
    return packet.error;
  }

  return 'LangChain stream failed.';
}
