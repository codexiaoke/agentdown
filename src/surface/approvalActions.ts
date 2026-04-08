import type {
  RuntimeIntent
} from '../runtime/types';
import type {
  RunSurfaceApprovalActionContext,
  RunSurfaceApprovalActionDefinition,
  RunSurfaceApprovalActionItem,
  RunSurfaceApprovalActionsOptions,
  RunSurfaceApprovalReasonMode,
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
 * 默认会强制要求填写原因的 approval 动作。
 */
export const DEFAULT_RUN_SURFACE_APPROVAL_REASON_REQUIRED_ACTIONS = new Set<RunSurfaceBuiltinApprovalActionKey>([
  'reject',
  'changes_requested'
]);

/**
 * 读取当前 approval 动作的原因输入模式。
 */
export function resolveRunSurfaceApprovalActionReasonMode(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): RunSurfaceApprovalReasonMode {
  if (typeof action.reasonMode === 'function') {
    return action.reasonMode(context);
  }

  if (action.reasonMode) {
    return action.reasonMode;
  }

  if (typeof action.requireReason === 'function') {
    return action.requireReason(context) ? 'required' : 'hidden';
  }

  if (typeof action.requireReason === 'boolean') {
    return action.requireReason ? 'required' : 'hidden';
  }

  return DEFAULT_RUN_SURFACE_APPROVAL_REASON_REQUIRED_ACTIONS.has(
    action.key as RunSurfaceBuiltinApprovalActionKey
  )
    ? 'required'
    : 'hidden';
}

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
 * 判断当前 approval 动作是否要求先填写原因。
 */
export function doesRunSurfaceApprovalActionRequireReason(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): boolean {
  return resolveRunSurfaceApprovalActionReasonMode(action, context) === 'required';
}

/**
 * 判断当前 approval 动作是否需要先展示原因输入区。
 */
export function shouldRunSurfaceApprovalActionOpenReasonPrompt(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): boolean {
  return resolveRunSurfaceApprovalActionReasonMode(action, context) !== 'hidden';
}

/**
 * 校验当前 approval 动作填写的原因是否合法。
 */
export function validateRunSurfaceApprovalActionReason(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext,
  rawReason: string
): string | null {
  const reason = rawReason.trim();
  const reasonMode = resolveRunSurfaceApprovalActionReasonMode(action, context);

  if (reasonMode === 'hidden') {
    return null;
  }

  if (reasonMode === 'required' && reason.length === 0) {
    return '请先填写原因。';
  }

  if (reason.length > 0 && typeof action.reasonMinLength === 'number' && reason.length < action.reasonMinLength) {
    return `原因至少需要 ${action.reasonMinLength} 个字。`;
  }

  const customValidationResult = action.validateReason?.({
    reason,
    context
  });

  if (typeof customValidationResult === 'string' && customValidationResult.trim().length > 0) {
    return customValidationResult;
  }

  return null;
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
      ...(context.reason !== undefined ? { reason: context.reason } : {}),
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
