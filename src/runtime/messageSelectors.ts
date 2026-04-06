import { createRuntimeTranscriptMessages } from './replay';
import type {
  CreateRuntimeTranscriptOptions,
  RuntimeTranscriptMessage
} from './replay';
import type {
  AgentRuntime,
  RuntimeSnapshot
} from './types';

/**
 * message selector 支持的输入源。
 *
 * 可以直接传：
 * - `AgentRuntime`
 * - `RuntimeSnapshot`
 */
export type RuntimeMessageSource = AgentRuntime | RuntimeSnapshot;

/**
 * 按消息维度查询时可附加的筛选条件。
 */
export interface RuntimeMessageQueryOptions extends CreateRuntimeTranscriptOptions {
  /** 只保留某个 role 的消息。 */
  role?: RuntimeTranscriptMessage['role'];
}

/**
 * 判断当前输入是否为可读写的 runtime 实例。
 */
function isAgentRuntime(value: RuntimeMessageSource): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

/**
 * 从 runtime 或 snapshot 中读取当前可遍历的消息列表。
 *
 * 这里直接复用 transcript 的消息聚合逻辑，
 * 以保证和 RunSurface 的消息分组规则保持一致。
 */
function readMessages(
  source: RuntimeMessageSource,
  options: RuntimeMessageQueryOptions = {}
): RuntimeTranscriptMessage[] {
  return createRuntimeTranscriptMessages(
    isAgentRuntime(source)
      ? source
      : source,
    options
  );
}

/**
 * 判断某条消息是否满足附加筛选条件。
 */
function matchesMessageOptions(
  message: RuntimeTranscriptMessage,
  options: RuntimeMessageQueryOptions
): boolean {
  if (options.role !== undefined && message.role !== options.role) {
    return false;
  }

  return true;
}

/**
 * 读取某条消息的稳定语义 id。
 *
 * 如果消息还没显式设置 `messageId`，
 * 会自动回退到兼容字段 `groupId`。
 */
function resolveMessageSemanticId(message: RuntimeTranscriptMessage): string | null {
  return message.messageId ?? message.groupId ?? null;
}

/**
 * 按 `messageId` 读取一条完整消息。
 */
export function getRuntimeMessage(
  source: RuntimeMessageSource,
  messageId: string | null,
  options: RuntimeMessageQueryOptions = {}
): RuntimeTranscriptMessage | undefined {
  return readMessages(source, options).find((message) => {
    return resolveMessageSemanticId(message) === messageId && matchesMessageOptions(message, options);
  });
}

/**
 * 按 `turnId` 读取同一轮对话里的全部消息。
 */
export function getRuntimeMessagesByTurnId(
  source: RuntimeMessageSource,
  turnId: string | null,
  options: RuntimeMessageQueryOptions = {}
): RuntimeTranscriptMessage[] {
  return readMessages(source, options).filter((message) => {
    return (message.turnId ?? message.groupId ?? null) === turnId && matchesMessageOptions(message, options);
  });
}

/**
 * 按 `conversationId` 读取整段会话里的全部消息。
 */
export function getRuntimeMessagesByConversationId(
  source: RuntimeMessageSource,
  conversationId: string | null,
  options: RuntimeMessageQueryOptions = {}
): RuntimeTranscriptMessage[] {
  return readMessages(source, options).filter((message) => {
    return (message.conversationId ?? null) === conversationId && matchesMessageOptions(message, options);
  });
}

