import type { RuntimeData } from '../../runtime/types';
import type {
  SpringAiApprovalPayload,
  SpringAiEvent,
  SpringAiEventMetadata,
  SpringAiToolPayload
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
 * 从未知值中读取字符串数组。
 */
function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/**
 * 统一规范 Spring AI 事件名，兼容大小写与分隔符差异。
 */
export function normalizeSpringAiEventName(eventName: string): string {
  return eventName
    .trim()
    .replace(/[.\-]/g, '_')
    .toLowerCase();
}

/**
 * 读取 Spring AI 事件上的 metadata。
 */
export function extractMetadata(packet: SpringAiEvent): SpringAiEventMetadata | undefined {
  return readRecord(packet.metadata) as SpringAiEventMetadata | undefined;
}

/**
 * 读取当前后端 session id。
 */
export function extractSessionId(packet: SpringAiEvent): string | undefined {
  return readString(extractMetadata(packet)?.session_id)
    ?? readString(readRecord(packet.data)?.session_id);
}

/**
 * 读取当前 conversation id。
 */
export function extractConversationId(packet: SpringAiEvent): string | undefined {
  return readString(extractMetadata(packet)?.conversation_id)
    ?? extractSessionId(packet);
}

/**
 * 读取当前 run id。
 */
export function extractExplicitRunId(packet: SpringAiEvent): string | undefined {
  return readString(extractMetadata(packet)?.run_id);
}

/**
 * 读取当前 group id。
 */
export function extractGroupId(packet: SpringAiEvent): string | undefined {
  return readString(extractMetadata(packet)?.group_id)
    ?? readString(readRecord(packet.data)?.group_id);
}

/**
 * 读取当前 turn id。
 */
export function extractTurnId(packet: SpringAiEvent): string | undefined {
  return readString(extractMetadata(packet)?.turn_id)
    ?? extractGroupId(packet);
}

/**
 * 读取当前 assistant message id。
 */
export function extractMessageId(packet: SpringAiEvent): string | undefined {
  return readString(extractMetadata(packet)?.message_id);
}

/**
 * 读取 run.completed 上的状态。
 */
export function extractRunStatus(packet: SpringAiEvent): string | undefined {
  return readString(readRecord(packet.data)?.status);
}

/**
 * 读取事件上的文本内容。
 */
export function extractContent(packet: SpringAiEvent): string | undefined {
  return readString(readRecord(packet.data)?.content)
    ?? readString(packet.message);
}

/**
 * 读取 Spring AI 事件上的 approval payload。
 */
export function extractApproval(packet: SpringAiEvent): SpringAiApprovalPayload | undefined {
  if (normalizeSpringAiEventName(packet.event) !== 'approval_required') {
    return undefined;
  }

  return readRecord(packet.data) as SpringAiApprovalPayload | undefined;
}

/**
 * 从 Spring AI 工具事件中构造统一工具载荷。
 */
export function extractTool(packet: SpringAiEvent): SpringAiToolPayload | undefined {
  const eventName = normalizeSpringAiEventName(packet.event);

  if (
    eventName !== 'tool_started'
    && eventName !== 'tool_completed'
    && eventName !== 'tool_error'
  ) {
    return undefined;
  }

  const data = readRecord(packet.data);

  if (!data) {
    return undefined;
  }

  const toolCallId = readString(data.tool_call_id);
  const toolName = readString(data.tool_name);
  const toolArgs = readRecord(data.tool_args) as Record<string, unknown> | undefined;
  const message = readString(data.message);
  const tool: SpringAiToolPayload = {
    ...(toolCallId
      ? {
          tool_call_id: toolCallId
        }
      : {}),
    ...(toolName
      ? {
          tool_name: toolName
        }
      : {}),
    ...(toolArgs
      ? {
          tool_args: toolArgs
        }
      : {})
  };

  if (data.result !== undefined) {
    tool.result = data.result;
  }

  if (message) {
    tool.message = message;
  }

  return tool;
}

/**
 * 读取工具名称。
 */
export function extractToolName(tool: SpringAiToolPayload | undefined): string | undefined {
  return readString(tool?.tool_name)
    ?? readString(tool?.name);
}

/**
 * 读取工具输入参数。
 */
export function extractToolArgs(tool: SpringAiToolPayload | undefined): Record<string, unknown> | undefined {
  const args = readRecord(tool?.tool_args)
    ?? readRecord(tool?.args);

  return args as Record<string, unknown> | undefined;
}

/**
 * 读取工具原始 id。
 */
export function extractToolRawId(tool: SpringAiToolPayload | undefined): string | undefined {
  return readString(tool?.tool_call_id);
}

/**
 * 读取工具结果。
 */
export function extractToolResult(
  packet: SpringAiEvent,
  tool: SpringAiToolPayload | undefined
): unknown {
  if (tool?.result !== undefined) {
    return tool.result;
  }

  return readRecord(packet.data)?.result;
}

/**
 * 提取最适合展示给用户的错误文案。
 */
export function extractErrorMessage(packet: SpringAiEvent): string {
  const data = readRecord(packet.data);

  return readString(data?.message)
    ?? readString(packet.message)
    ?? readString(packet.reason)
    ?? (typeof packet.error === 'string' && packet.error.length > 0
      ? packet.error
      : 'Spring AI 运行失败。');
}

/**
 * 读取 approval payload 上要求附带 reason 的决策列表。
 */
export function extractReasonRequiredDecisions(payload: SpringAiApprovalPayload | undefined): string[] {
  return readStringArray(payload?.reason_required_decisions);
}
