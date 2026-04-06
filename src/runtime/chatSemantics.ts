import type { SurfaceBlock } from './types';

/**
 * 聊天消息分组时使用的稳定 key。
 *
 * 这是运行期辅助值，不会直接写入 snapshot。
 */
export interface RuntimeBlockMessageScope {
  conversationId: string | null;
  turnId: string | null;
  messageId: string | null;
  groupId: string | null;
}

/**
 * 把未知值标准化成可比较的 id。
 */
function normalizeSemanticId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : null;
}

/**
 * 解析某个 block 的显式聊天语义，并兼容旧的 `groupId` 回退逻辑。
 */
export function resolveBlockMessageScope(block: SurfaceBlock): RuntimeBlockMessageScope {
  const groupId = normalizeSemanticId(block.groupId);
  const conversationId = normalizeSemanticId(block.conversationId);
  const turnId = normalizeSemanticId(block.turnId) ?? groupId;
  const messageId = normalizeSemanticId(block.messageId) ?? groupId;

  return {
    conversationId,
    turnId,
    messageId,
    groupId
  };
}

/**
 * 读取 block 的 conversationId。
 */
export function getBlockConversationId(block: SurfaceBlock): string | null {
  return resolveBlockMessageScope(block).conversationId;
}

/**
 * 读取 block 的 turnId。
 *
 * 如果还没显式提供 `turnId`，会回退到旧版 `groupId`。
 */
export function getBlockTurnId(block: SurfaceBlock): string | null {
  return resolveBlockMessageScope(block).turnId;
}

/**
 * 读取 block 的 messageId。
 *
 * 如果还没显式提供 `messageId`，会回退到旧版 `groupId`，
 * 这样老协议也能继续按“整条消息”聚合。
 */
export function getBlockMessageId(block: SurfaceBlock): string | null {
  return resolveBlockMessageScope(block).messageId;
}

/**
 * 判断两个 block 是否属于同一条消息。
 */
export function isSameMessageScope(
  previous: SurfaceBlock,
  next: SurfaceBlock
): boolean {
  const previousScope = resolveBlockMessageScope(previous);
  const nextScope = resolveBlockMessageScope(next);

  return previousScope.messageId !== null && previousScope.messageId === nextScope.messageId;
}

