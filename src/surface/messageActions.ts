import type {
  RuntimeIntent,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';
import type { RuntimeTranscriptMessage } from '../runtime/replay';
import type {
  RunSurfaceBuiltinMessageActionKey,
  RunSurfaceMessageActionContext,
  RunSurfaceMessageActionDefinition,
  RunSurfaceMessageActionItem,
  RunSurfaceMessageActionsRoleOptions
} from './types';

/**
 * 消息操作栏内置动作的默认显示顺序。
 */
export const DEFAULT_RUN_SURFACE_MESSAGE_ACTIONS: RunSurfaceBuiltinMessageActionKey[] = [
  'copy',
  'regenerate',
  'like',
  'dislike',
  'share'
];

/**
 * 判断某个 block 是否仍处于 draft-like 状态。
 */
export function isRunSurfaceDraftLikeBlock(block: SurfaceBlock): boolean {
  return (
    block.state === 'draft'
    || block.renderer === 'markdown.draft'
    || block.renderer === 'text.draft'
    || block.renderer === 'markdown'
  );
}

/**
 * 判断当前消息组是否已经稳定完成。
 */
export function isRunSurfaceMessageStable(blocks: SurfaceBlock[]): boolean {
  return !blocks.some((block) => isRunSurfaceDraftLikeBlock(block));
}

/**
 * 判断某个 node 是否仍处于“消息还在继续”的活动状态。
 */
export function isRunSurfaceActiveMessageNode(node: RuntimeNode | undefined): boolean {
  const status = typeof node?.status === 'string'
    ? node.status.trim().toLowerCase()
    : '';

  return [
    'running',
    'pending',
    'streaming',
    'thinking',
    'working',
    'processing'
  ].includes(status);
}

/**
 * 判断当前消息关联的 node 中，是否仍有未结束的活动节点。
 *
 * 这能避免“工具调用中途暂时没有 draft，于是操作栏先闪一下”的问题。
 */
export function hasRunSurfaceActiveMessageNodes(
  blocks: SurfaceBlock[],
  snapshot: RuntimeSnapshot
): boolean {
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const relatedNodeIds = new Set(
    blocks
      .map((block) => block.nodeId)
      .filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0)
  );

  for (const nodeId of relatedNodeIds) {
    if (isRunSurfaceActiveMessageNode(nodesById.get(nodeId))) {
      return true;
    }
  }

  return false;
}

/**
 * 从消息或 block 列表中提取尽量接近用户可读文本的内容。
 */
export function extractRunSurfaceMessageText(
  message: RuntimeTranscriptMessage | undefined,
  blocks: SurfaceBlock[]
): string {
  const sourceText = typeof message?.text === 'string' && message.text.trim().length > 0
    ? message.text
    : blocks
      .map((block) => typeof block.content === 'string' ? block.content : '')
      .filter((value) => value.trim().length > 0)
      .join('\n\n');

  return sourceText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|blockquote|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 把字符串或对象形式的动作条目统一归一化成对象结构。
 */
export function normalizeRunSurfaceMessageActionItem(
  item: RunSurfaceMessageActionItem
): RunSurfaceMessageActionDefinition {
  if (typeof item === 'string') {
    return {
      key: item
    };
  }

  return item;
}

/**
 * 读取当前动作是否应该显示。
 */
export function isRunSurfaceMessageActionVisible(
  action: RunSurfaceMessageActionDefinition,
  context: RunSurfaceMessageActionContext
): boolean {
  return typeof action.visible === 'function'
    ? action.visible(context)
    : action.visible ?? true;
}

/**
 * 读取当前动作是否应该禁用。
 */
export function isRunSurfaceMessageActionDisabled(
  action: RunSurfaceMessageActionDefinition,
  context: RunSurfaceMessageActionContext
): boolean {
  return typeof action.disabled === 'function'
    ? action.disabled(context)
    : action.disabled ?? false;
}

/**
 * 解析消息操作栏最终使用的动作列表。
 */
export function resolveRunSurfaceMessageActionItems(
  options: RunSurfaceMessageActionsRoleOptions | false | undefined
): RunSurfaceMessageActionDefinition[] {
  if (!options || options.enabled === false) {
    return [];
  }

  const actions = options.actions ?? DEFAULT_RUN_SURFACE_MESSAGE_ACTIONS;
  return actions.map((action) => normalizeRunSurfaceMessageActionItem(action));
}

/**
 * 生成一条标准化的消息动作 intent 载荷。
 */
export function createRunSurfaceMessageActionIntent(
  action: string,
  context: RunSurfaceMessageActionContext,
  text: string
): Omit<RuntimeIntent, 'id' | 'at'> {
  const lastBlock = context.blocks[context.blocks.length - 1];

  return {
    type: 'message.action',
    ...(lastBlock?.nodeId
      ? {
          nodeId: lastBlock.nodeId
        }
      : {}),
    ...(lastBlock?.id
      ? {
          blockId: lastBlock.id
        }
      : {}),
    payload: {
      action,
      role: context.role,
      ...(context.conversationId !== undefined ? { conversationId: context.conversationId } : {}),
      ...(context.turnId !== undefined ? { turnId: context.turnId } : {}),
      ...(context.messageId !== undefined ? { messageId: context.messageId } : {}),
      ...(context.groupId !== undefined ? { groupId: context.groupId } : {}),
      text,
      blockIds: context.blocks.map((block) => block.id)
    }
  };
}
