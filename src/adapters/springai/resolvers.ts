import type { ProtocolContext } from '../../runtime/types';
import {
  extractConversationId,
  extractGroupId,
  extractMessageId,
  extractTurnId
} from './packet';
import type {
  SpringAiEvent,
  SpringAiProtocolOptions,
  SpringAiToolPayload
} from './types';

/**
 * 解析本次 run 的 groupId。
 */
export function resolveGroupId(
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string | null | undefined {
  if (typeof options.groupId === 'function') {
    return options.groupId(runId, packet, context);
  }

  return options.groupId ?? extractGroupId(packet) ?? `turn:${runId}`;
}

/**
 * 解析本次 run 的 conversationId。
 */
export function resolveConversationId(
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string | null | undefined {
  if (typeof options.conversationId === 'function') {
    return options.conversationId(runId, packet, context);
  }

  return options.conversationId ?? extractConversationId(packet) ?? null;
}

/**
 * 解析本次 run 的 turnId。
 */
export function resolveTurnId(
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string | null | undefined {
  if (typeof options.turnId === 'function') {
    return options.turnId(runId, packet, context);
  }

  return options.turnId ?? extractTurnId(packet) ?? resolveGroupId(runId, packet, context, options);
}

/**
 * 解析当前 assistant messageId。
 */
export function resolveMessageId(
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string | null | undefined {
  if (typeof options.messageId === 'function') {
    return options.messageId(runId, packet, context);
  }

  return options.messageId ?? extractMessageId(packet) ?? `message:${runId}:assistant`;
}

/**
 * 解析当前 response 的 streamId。
 */
export function resolveStreamId(
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string {
  if (typeof options.streamId === 'function') {
    return options.streamId(runId, packet, context);
  }

  const messageId = extractMessageId(packet);

  return options.streamId ?? (messageId
    ? `stream:${messageId}`
    : `stream:${runId}:assistant`);
}

/**
 * 解析当前 response 的 draft blockId。
 */
export function resolveBlockId(
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string {
  if (typeof options.blockId === 'function') {
    return options.blockId(runId, packet, context);
  }

  const messageId = extractMessageId(packet);

  return options.blockId ?? (messageId
    ? `block:${messageId}`
    : `block:${runId}:assistant`);
}

/**
 * 解析本次 run 的显示标题。
 */
export function resolveRunTitle(
  packet: SpringAiEvent,
  runId: string,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
): string | undefined {
  if (typeof options.defaultRunTitle === 'function') {
    return options.defaultRunTitle(packet, runId, context);
  }

  return options.defaultRunTitle;
}

/**
 * 解析工具 renderer 名称。
 */
export function resolveToolRenderer(
  runId: string,
  toolId: string,
  tool: SpringAiToolPayload | undefined,
  packet: SpringAiEvent,
  context: ProtocolContext,
  options: SpringAiProtocolOptions
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
