import type { RuntimeIntent } from '../runtime/types';
import type {
  RunSurfaceBuiltinHandoffActionKey,
  RunSurfaceHandoffActionContext,
  RunSurfaceHandoffActionDefinition,
  RunSurfaceHandoffActionInputMode,
  RunSurfaceHandoffActionItem,
  RunSurfaceHandoffActionsOptions
} from './types';

/**
 * handoff 动作栏默认使用的动作顺序。
 */
export const DEFAULT_RUN_SURFACE_HANDOFF_ACTIONS: RunSurfaceBuiltinHandoffActionKey[] = [
  'submit'
];

/**
 * 默认会强制要求填写输入内容的 handoff 动作。
 */
export const DEFAULT_RUN_SURFACE_HANDOFF_INPUT_REQUIRED_ACTIONS = new Set<RunSurfaceBuiltinHandoffActionKey>([
  'submit'
]);

/**
 * 读取当前 handoff 动作的输入模式。
 */
export function resolveRunSurfaceHandoffActionInputMode(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext
): RunSurfaceHandoffActionInputMode {
  if (typeof action.inputMode === 'function') {
    return action.inputMode(context);
  }

  if (action.inputMode) {
    return action.inputMode;
  }

  if (typeof action.requireInput === 'function') {
    return action.requireInput(context) ? 'required' : 'hidden';
  }

  if (typeof action.requireInput === 'boolean') {
    return action.requireInput ? 'required' : 'hidden';
  }

  return DEFAULT_RUN_SURFACE_HANDOFF_INPUT_REQUIRED_ACTIONS.has(
    action.key as RunSurfaceBuiltinHandoffActionKey
  )
    ? 'required'
    : 'hidden';
}

/**
 * 把字符串或对象形式的 handoff 动作条目统一归一化成对象结构。
 */
export function normalizeRunSurfaceHandoffActionItem(
  item: RunSurfaceHandoffActionItem
): RunSurfaceHandoffActionDefinition {
  if (typeof item === 'string') {
    return {
      key: item
    };
  }

  return item;
}

/**
 * 读取当前 handoff 动作是否应该显示。
 */
export function isRunSurfaceHandoffActionVisible(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext
): boolean {
  return typeof action.visible === 'function'
    ? action.visible(context)
    : action.visible ?? true;
}

/**
 * 读取当前 handoff 动作是否应该禁用。
 */
export function isRunSurfaceHandoffActionDisabled(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext
): boolean {
  return typeof action.disabled === 'function'
    ? action.disabled(context)
    : action.disabled ?? false;
}

/**
 * 判断当前 handoff 动作是否要求先填写输入内容。
 */
export function doesRunSurfaceHandoffActionRequireInput(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext
): boolean {
  return resolveRunSurfaceHandoffActionInputMode(action, context) === 'required';
}

/**
 * 校验当前 handoff 动作填写的输入是否合法。
 */
export function validateRunSurfaceHandoffActionInput(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext,
  rawInput: string
): string | null {
  const input = rawInput.trim();
  const inputMode = resolveRunSurfaceHandoffActionInputMode(action, context);

  if (inputMode === 'hidden') {
    return null;
  }

  if (inputMode === 'required' && input.length === 0) {
    return '请先填写回复内容。';
  }

  if (input.length > 0 && typeof action.inputMinLength === 'number' && input.length < action.inputMinLength) {
    return `回复至少需要 ${action.inputMinLength} 个字。`;
  }

  const customValidationResult = action.validateInput?.({
    input,
    context
  });

  if (typeof customValidationResult === 'string' && customValidationResult.trim().length > 0) {
    return customValidationResult;
  }

  return null;
}

/**
 * 解析 handoff 卡片最终使用的动作列表。
 */
export function resolveRunSurfaceHandoffActionItems(
  options: RunSurfaceHandoffActionsOptions | false | undefined
): RunSurfaceHandoffActionDefinition[] {
  if (!options || options.enabled === false) {
    return [];
  }

  const actions = options.actions ?? DEFAULT_RUN_SURFACE_HANDOFF_ACTIONS;
  return actions.map((action) => normalizeRunSurfaceHandoffActionItem(action));
}

/**
 * 生成一条标准化的 handoff 动作 intent。
 */
export function createRunSurfaceHandoffActionIntent(
  action: string,
  context: RunSurfaceHandoffActionContext
): Omit<RuntimeIntent, 'id' | 'at'> {
  return {
    type: 'handoff.action',
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
      ...(context.input !== undefined ? { input: context.input } : {}),
      ...(context.message !== undefined ? { message: context.message } : {}),
      ...(context.handoffId !== undefined ? { handoffId: context.handoffId } : {}),
      ...(context.targetType !== undefined ? { targetType: context.targetType } : {}),
      ...(context.assignee !== undefined ? { assignee: context.assignee } : {}),
      ...(context.refId !== undefined ? { refId: context.refId } : {}),
      ...(context.block.conversationId !== undefined ? { conversationId: context.block.conversationId } : {}),
      ...(context.block.turnId !== undefined ? { turnId: context.block.turnId } : {}),
      ...(context.block.messageId !== undefined ? { messageId: context.block.messageId } : {}),
      ...(context.block.groupId !== undefined ? { groupId: context.block.groupId } : {}),
      role: context.role
    }
  };
}
