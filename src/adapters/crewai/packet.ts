import type { SseTransportMessage } from '../../runtime/transports';
import type { RuntimeData } from '../../runtime/types';
import type {
  CrewAIEvent,
  CrewAIMessage,
  CrewAIMessageToolCall,
  CrewAITaskOutput,
  CrewAIStreamingToolCall,
  CrewAIToolPayload
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
function readRecord<T extends RuntimeData = RuntimeData>(value: unknown): T | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as T
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
 * 尝试把字符串解析成 JSON。
 */
function tryParseJsonString(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * 尝试把 Python 字面量风格字符串转换成 JSON 可解析格式。
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
 * 尝试把结构化字符串还原成对象。
 *
 * 当字符串看起来像未完成的 JSON 时，会返回 `undefined`，
 * 这样工具调用开始阶段不会把半截 `{` 当成有效输入。
 */
function normalizeStructuredValue(
  value: unknown,
  {
    allowPartialString
  }: {
    allowPartialString: boolean;
  } = {
    allowPartialString: true
  }
): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const looksStructured = trimmed.startsWith('{') || trimmed.startsWith('[');

  if (!looksStructured) {
    return value;
  }

  const directJson = tryParseJsonString(trimmed);

  if (directJson !== trimmed) {
    return directJson;
  }

  const normalizedPythonLiteral = normalizePythonLiteralString(trimmed);
  const parsedPythonLiteral = tryParseJsonString(normalizedPythonLiteral);

  if (parsedPythonLiteral !== normalizedPythonLiteral) {
    return parsedPythonLiteral;
  }

  return allowPartialString
    ? value
    : undefined;
}

/**
 * 把任意 SSE message 解析成 CrewAI event，并保留显式 `event:` 名称。
 */
export function parseCrewAISseMessage(message: SseTransportMessage): CrewAIEvent {
  const parsed = JSON.parse(message.data) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ...(message.event ? { event: message.event } : {}),
      content: parsed
    };
  }

  return {
    ...(message.event ? { event: message.event } : {}),
    ...(parsed as CrewAIEvent)
  };
}

/**
 * 把 CrewAI 显式事件名或 chunk 类型统一转成 snake_case。
 */
export function normalizeCrewAIEventName(packet: CrewAIEvent): string {
  const rawName = readString(packet.event)
    ?? readString(packet.type)
    ?? extractChunkType(packet);

  if (!rawName) {
    return '';
  }

  const normalized = rawName.trim().replace(/[.\-\s]/g, '_');

  if (normalized.includes('_')) {
    return normalized.toLowerCase();
  }

  return normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1_$2')
    .toLowerCase();
}

/**
 * 读取 CrewAI 流式 chunk 的类型。
 */
export function extractChunkType(packet: CrewAIEvent): string | undefined {
  if (typeof packet.chunk_type === 'string') {
    return readString(packet.chunk_type)?.toLowerCase();
  }

  const chunkType = readRecord(packet.chunk_type);
  return readString(chunkType?._value_)?.toLowerCase();
}

/**
 * 判断当前事件是否是普通文本 chunk。
 */
export function isTextChunk(packet: CrewAIEvent): boolean {
  return extractChunkType(packet) === 'text';
}

/**
 * 判断当前事件是否是工具调用 chunk。
 */
export function isToolCallChunk(packet: CrewAIEvent): boolean {
  return extractChunkType(packet) === 'tool_call';
}

/**
 * 判断当前事件是否是最终 `CrewOutput`。
 */
export function isCrewOutputEvent(packet: CrewAIEvent): boolean {
  return normalizeCrewAIEventName(packet) === 'crew_output';
}

/**
 * 判断当前事件是否是 CrewAI Flow 暂停等待人工反馈。
 */
export function isFlowPausedEvent(packet: CrewAIEvent): boolean {
  return normalizeCrewAIEventName(packet) === 'flow_paused';
}

/**
 * 判断当前事件是否是 CrewAI Flow 完成。
 */
export function isFlowFinishedEvent(packet: CrewAIEvent): boolean {
  return normalizeCrewAIEventName(packet) === 'flow_finished';
}

/**
 * 读取 CrewAI Flow 暂停对应的稳定 flow id。
 */
export function extractFlowId(packet: CrewAIEvent): string | undefined {
  return readString(packet.flow_id)
    ?? readString(packet.session_id)
    ?? readString(packet.sessionId);
}

/**
 * 读取 CrewAI Flow 暂停对应的提示文案。
 */
export function extractFlowPauseMessage(packet: CrewAIEvent): string | undefined {
  return readString(packet.message);
}

/**
 * 读取 CrewAI Flow review 当前展示给用户的输出内容。
 */
export function extractFlowOutput(packet: CrewAIEvent): unknown {
  return packet.output;
}

/**
 * 判断当前事件是否是错误事件。
 */
export function isErrorEvent(packet: CrewAIEvent): boolean {
  return normalizeCrewAIEventName(packet) === 'error_event';
}

/**
 * 读取本次 run 的稳定 id。
 *
 * CrewAI 官方流式 chunk 并没有根 run id，这里优先复用 `agent_id`，
 * 没有时交给 protocol 用活动中的 run id 或本地生成 id 兜底。
 */
export function extractExplicitRunId(packet: CrewAIEvent): string | undefined {
  return readString(packet.run_id)
    ?? readString(packet.agent_id)
    ?? readString(packet.task_id);
}

/**
 * 读取 Flow finish / pause 附带的 run 标题。
 */
export function extractFlowRunTitle(packet: CrewAIEvent): string | undefined {
  return readString(packet.run_title);
}

/**
 * 读取 run 标题。
 */
export function extractRunTitle(packet: CrewAIEvent): string | undefined {
  if (readString(packet.agent_role)) {
    return readString(packet.agent_role);
  }

  const firstTask = readRecordArray<CrewAITaskOutput>(packet.tasks_output)[0];
  return readString(firstTask?.agent);
}

/**
 * 读取文本 chunk 内容。
 */
export function extractTextContent(packet: CrewAIEvent): string | undefined {
  return isTextChunk(packet) && typeof packet.content === 'string'
    ? readString(packet.content)
    : undefined;
}

/**
 * 从流式工具调用 chunk 中提取统一工具载荷。
 */
export function extractStreamingTool(packet: CrewAIEvent): CrewAIToolPayload | undefined {
  if (!isToolCallChunk(packet)) {
    return undefined;
  }

  const toolCall = readRecord<CrewAIStreamingToolCall>(packet.tool_call);

  if (!toolCall) {
    return undefined;
  }

  const tool: CrewAIToolPayload = {};
  const rawId = readString(toolCall.tool_id);
  const name = readString(toolCall.tool_name);
  const argumentsText = readString(toolCall.arguments)
    ?? (typeof packet.content === 'string' ? readString(packet.content) : undefined);
  const input = normalizeStructuredValue(argumentsText, {
    allowPartialString: false
  });

  if (rawId !== undefined) {
    tool.id = rawId;
    tool.tool_call_id = rawId;
  }

  if (name !== undefined) {
    tool.name = name;
  }

  if (argumentsText !== undefined) {
    tool.argumentsText = argumentsText;
  }

  if (input !== undefined) {
    tool.input = input;
  }

  if (typeof toolCall.index === 'number' && Number.isFinite(toolCall.index)) {
    tool.index = toolCall.index;
  }

  if (packet.content !== undefined) {
    tool.content = packet.content;
  }

  return tool;
}

/**
 * 拉平 `CrewOutput.tasks_output[].messages[]`。
 */
function extractCrewOutputMessages(packet: CrewAIEvent): CrewAIMessage[] {
  return readRecordArray<CrewAITaskOutput>(packet.tasks_output)
    .flatMap((task) => readRecordArray<CrewAIMessage>(task.messages));
}

/**
 * 把最终 assistant tool call 消息转换成统一工具载荷。
 */
function buildToolCallFromMessage(item: CrewAIMessageToolCall): CrewAIToolPayload {
  const payload: CrewAIToolPayload = {};
  const rawId = readString(item.id);
  const fn = readRecord(item.function);
  const name = readString(fn?.name);
  const argumentsText = readString(fn?.arguments);
  const input = normalizeStructuredValue(argumentsText, {
    allowPartialString: false
  });

  if (rawId !== undefined) {
    payload.id = rawId;
    payload.tool_call_id = rawId;
  }

  if (name !== undefined) {
    payload.name = name;
  }

  if (argumentsText !== undefined) {
    payload.argumentsText = argumentsText;
  }

  if (input !== undefined) {
    payload.input = input;
  }

  return payload;
}

/**
 * 读取最终 `CrewOutput` 中 assistant 发起过的工具调用。
 */
export function extractCrewOutputToolCalls(packet: CrewAIEvent): CrewAIToolPayload[] {
  return extractCrewOutputMessages(packet).flatMap((message) => {
    if (readString(message.role) !== 'assistant') {
      return [];
    }

    return readRecordArray<CrewAIMessageToolCall>(message.tool_calls).map(buildToolCallFromMessage);
  });
}

/**
 * 读取最终 `CrewOutput` 中工具返回结果。
 */
export function extractCrewOutputToolResults(packet: CrewAIEvent): CrewAIToolPayload[] {
  return extractCrewOutputMessages(packet).flatMap((message) => {
    if (readString(message.role) !== 'tool') {
      return [];
    }

    const payload: CrewAIToolPayload = {};
    const rawId = readString(message.tool_call_id);
    const name = readString(message.name);
    const result = normalizeStructuredValue(message.content, {
      allowPartialString: true
    });

    if (rawId !== undefined) {
      payload.id = rawId;
      payload.tool_call_id = rawId;
    }

    if (name !== undefined) {
      payload.name = name;
    }

    if (message.content !== undefined) {
      payload.content = message.content;
    }

    if (result !== undefined) {
      payload.result = result;
    }

    return [payload];
  });
}

/**
 * 读取最终 assistant 文本。
 */
export function extractCrewOutputAssistantText(packet: CrewAIEvent): string | undefined {
  const lastAssistantMessage = extractCrewOutputMessages(packet)
    .filter((message) => readString(message.role) === 'assistant' && typeof message.content === 'string')
    .map((message) => readString(message.content))
    .filter((value): value is string => value !== undefined)
    .at(-1);

  return lastAssistantMessage
    ?? readString(packet.raw);
}

/**
 * 读取工具名称。
 */
export function extractToolName(tool: CrewAIToolPayload | undefined): string | undefined {
  return readString(tool?.name);
}

/**
 * 读取工具参数。
 */
export function extractToolArgs(tool: CrewAIToolPayload | undefined): unknown {
  return tool?.input;
}

/**
 * 读取工具结果。
 */
export function extractToolResult(
  _packet: CrewAIEvent,
  tool: CrewAIToolPayload | undefined
): unknown {
  return tool?.result ?? tool?.content;
}

/**
 * 读取工具原始 id。
 */
export function extractToolRawId(tool: CrewAIToolPayload | undefined): string | undefined {
  return readString(tool?.id)
    ?? readString(tool?.tool_call_id);
}

/**
 * 读取错误消息。
 */
export function extractErrorMessage(packet: CrewAIEvent): string {
  const directMessage = readString(packet.message)
    ?? readString(packet.reason);

  if (directMessage) {
    return directMessage;
  }

  if (typeof packet.error === 'string' && packet.error.length > 0) {
    return packet.error;
  }

  if (typeof packet.content === 'string' && packet.content.length > 0) {
    return packet.content;
  }

  return 'CrewAI stream failed.';
}
