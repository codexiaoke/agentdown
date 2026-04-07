import type {
  RuntimeIntent
} from '../runtime/types';
import type {
  RunSurfaceApprovalActionContext,
  RunSurfaceApprovalActionDefinition,
  RunSurfaceApprovalActionItem,
  RunSurfaceApprovalActionsOptions,
  RunSurfaceBuiltinApprovalActionKey
} from './types';

/**
 * approval 动作栏默认使用的动作顺序。
 */
export const DEFAULT_RUN_SURFACE_APPROVAL_ACTIONS: RunSurfaceBuiltinApprovalActionKey[] = [
  'approve',
  'reject',
  'changes_requested'
];

/**
 * 把字符串或对象形式的 approval 动作条目统一归一化成对象结构。
 */
export function normalizeRunSurfaceApprovalActionItem(
  item: RunSurfaceApprovalActionItem
): RunSurfaceApprovalActionDefinition {
  if (typeof item === 'string') {
    return {
      key: item
    };
  }

  return item;
}

/**
 * 读取当前 approval 动作是否应该显示。
 */
export function isRunSurfaceApprovalActionVisible(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): boolean {
  return typeof action.visible === 'function'
    ? action.visible(context)
    : action.visible ?? true;
}

/**
 * 读取当前 approval 动作是否应该禁用。
 */
export function isRunSurfaceApprovalActionDisabled(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): boolean {
  return typeof action.disabled === 'function'
    ? action.disabled(context)
    : action.disabled ?? false;
}

/**
 * 解析 approval 卡片最终使用的动作列表。
 */
export function resolveRunSurfaceApprovalActionItems(
  options: RunSurfaceApprovalActionsOptions | false | undefined
): RunSurfaceApprovalActionDefinition[] {
  if (!options || options.enabled === false) {
    return [];
  }

  const actions = options.actions ?? DEFAULT_RUN_SURFACE_APPROVAL_ACTIONS;
  return actions.map((action) => normalizeRunSurfaceApprovalActionItem(action));
}

/**
 * 生成一条标准化的 approval 动作 intent。
 */
export function createRunSurfaceApprovalActionIntent(
  action: string,
  context: RunSurfaceApprovalActionContext
): Omit<RuntimeIntent, 'id' | 'at'> {
  return {
    type: 'approval.action',
    ...(context.block.nodeId
      ? {
          nodeId: context.block.nodeId
        }
      : {}),
    ...(context.block.id
      ? {
          blockId: context.block.id
        }
      : {}),
    payload: {
      action,
      title: context.title,
      status: context.status,
      ...(context.message !== undefined ? { message: context.message } : {}),
      ...(context.approvalId !== undefined ? { approvalId: context.approvalId } : {}),
      ...(context.refId !== undefined ? { refId: context.refId } : {}),
      ...(context.block.conversationId !== undefined ? { conversationId: context.block.conversationId } : {}),
      ...(context.block.turnId !== undefined ? { turnId: context.block.turnId } : {}),
      ...(context.block.messageId !== undefined ? { messageId: context.block.messageId } : {}),
      ...(context.block.groupId !== undefined ? { groupId: context.block.groupId } : {}),
      role: context.role
    }
  };
}
