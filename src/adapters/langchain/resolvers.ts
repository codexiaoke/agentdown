import type { ProtocolContext } from '../../runtime/types';
import { extractRunTitle } from './packet';
import type {
  LangChainEvent,
  LangChainProtocolOptions,
  LangChainToolPayload
} from './types';

/**
 * 解析本次 run 的 groupId。
 */
export function resolveGroupId(
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string | null | undefined {
  if (typeof options.groupId === 'function') {
    return options.groupId(runId, packet, context);
  }

  return options.groupId ?? `turn:${runId}`;
}

/**
 * 解析本次 run 的 conversationId。
 */
export function resolveConversationId(
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string | null | undefined {
  if (typeof options.conversationId === 'function') {
    return options.conversationId(runId, packet, context);
  }

  return options.conversationId ?? null;
}

/**
 * 解析本次 run 的 turnId。
 */
export function resolveTurnId(
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string | null | undefined {
  if (typeof options.turnId === 'function') {
    return options.turnId(runId, packet, context);
  }

  return options.turnId ?? resolveGroupId(runId, packet, context, options);
}

/**
 * 解析本次 assistant 消息的 messageId。
 */
export function resolveMessageId(
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string | null | undefined {
  if (typeof options.messageId === 'function') {
    return options.messageId(runId, packet, context);
  }

  return options.messageId ?? `message:${runId}:assistant`;
}

/**
 * 解析本次 run 的 streamId。
 */
export function resolveStreamId(
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string {
  if (typeof options.streamId === 'function') {
    return options.streamId(runId, packet, context);
  }

  return options.streamId ?? `stream:${runId}:assistant`;
}

/**
 * 解析本次 run 的 draft blockId。
 */
export function resolveBlockId(
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string {
  if (typeof options.blockId === 'function') {
    return options.blockId(runId, packet, context);
  }

  return options.blockId ?? `block:${runId}:assistant`;
}

/**
 * 解析本次 run 的显示标题。
 */
export function resolveRunTitle(
  packet: LangChainEvent,
  runId: string,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string | undefined {
  if (typeof options.defaultRunTitle === 'function') {
    return options.defaultRunTitle(packet, runId, context) ?? extractRunTitle(packet);
  }

  return options.defaultRunTitle ?? extractRunTitle(packet);
}

/**
 * 解析工具 renderer 名称。
 */
export function resolveToolRenderer(
  runId: string,
  toolId: string,
  tool: LangChainToolPayload | undefined,
  packet: LangChainEvent,
  context: ProtocolContext,
  options: LangChainProtocolOptions
): string {
  if (typeof options.toolRenderer === 'function') {
    return options.toolRenderer({
      runId,
      toolId,
      tool,
      packet,
      context
    }) ?? 'tool';
  }

  return options.toolRenderer ?? 'tool';
}
