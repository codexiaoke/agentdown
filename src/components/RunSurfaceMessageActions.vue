<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { getRuntimeMessage } from '../runtime/messageSelectors';
import type {
  AgentRuntime,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';
import type {
  RunSurfaceBuiltinMessageActionKey,
  RunSurfaceMessageActionContext,
  RunSurfaceMessageActionDefinition,
  RunSurfaceMessageActionsRoleOptions,
  RunSurfaceRole
} from '../surface/types';
import {
  createRunSurfaceMessageActionIntent,
  extractRunSurfaceMessageText,
  hasRunSurfaceActiveMessageNodes,
  isRunSurfaceMessageActionDisabled,
  isRunSurfaceMessageActionVisible,
  isRunSurfaceMessageStable,
  resolveRunSurfaceMessageActionItems
} from '../surface/messageActions';

/**
 * `RunSurfaceMessageActions` 的组件输入参数。
 */
interface Props {
  role: RunSurfaceRole;
  blocks: SurfaceBlock[];
  conversationId: string | null;
  turnId: string | null;
  messageId: string | null;
  groupId: string | null;
  runtime: AgentRuntime;
  snapshot: RuntimeSnapshot;
  options: RunSurfaceMessageActionsRoleOptions | false | undefined;
}

/**
 * 渲染后的消息动作条目。
 */
interface ResolvedMessageAction {
  key: string;
  label: string;
  title: string;
  icon: RunSurfaceMessageActionDefinition['icon'];
  disabled: boolean;
  onClick: () => Promise<void>;
}

const props = defineProps<Props>();

const feedbackAction = ref<'like' | 'dislike' | null>(null);
const transientSuccessAction = ref<string | null>(null);
let transientSuccessTimer: number | undefined;
const BUILTIN_ACTION_KEYS = new Set<RunSurfaceBuiltinMessageActionKey>([
  'copy',
  'regenerate',
  'retry',
  'resume',
  'interrupt',
  'like',
  'dislike',
  'share'
]);

/**
 * 读取当前消息对应的 transcript 聚合结果。
 */
const message = computed(() => {
  return getRuntimeMessage(
    props.snapshot,
    props.messageId ?? props.groupId ?? null
  );
});

/**
 * 把联合类型的 options 收敛成真正可读配置，方便后续安全读取扩展字段。
 */
const resolvedOptions = computed<RunSurfaceMessageActionsRoleOptions | undefined>(() => {
  return props.options === false
    ? undefined
    : props.options;
});

/**
 * 生成当前消息动作栏会用到的完整上下文。
 */
const actionContext = computed<RunSurfaceMessageActionContext>(() => ({
  role: props.role,
  blocks: props.blocks,
  conversationId: props.conversationId,
  turnId: props.turnId,
  messageId: props.messageId,
  groupId: props.groupId,
  ...(message.value ? { message: message.value } : {}),
  runtime: props.runtime,
  snapshot: props.snapshot,
  emitIntent: (intent) => props.runtime.emitIntent(intent)
}));

/**
 * 提取当前消息更适合复制 / 分享的纯文本内容。
 */
const messageText = computed(() => extractRunSurfaceMessageText(message.value, props.blocks));

/**
 * 判断当前消息动作栏是否应该显示。
 */
const shouldRender = computed(() => {
  if (!props.options || props.options.enabled === false) {
    return false;
  }

  if (!resolvedOptions.value || resolvedOptions.value.enabled === false) {
    return false;
  }

  if (props.blocks.length === 0) {
    return false;
  }

  if (resolvedOptions.value.showOnDraft) {
    return true;
  }

  if (!isRunSurfaceMessageStable(props.blocks)) {
    return false;
  }

  if (resolvedOptions.value.showWhileRunning) {
    return true;
  }

  return !hasRunSurfaceActiveMessageNodes(props.blocks, props.snapshot);
});

/**
 * 清理上一次短暂成功态定时器。
 */
function clearTransientSuccessTimer() {
  if (transientSuccessTimer !== undefined) {
    globalThis.clearTimeout(transientSuccessTimer);
    transientSuccessTimer = undefined;
  }
}

onBeforeUnmount(() => {
  clearTransientSuccessTimer();
});

/**
 * 标记某个动作刚刚执行成功，用于短暂高亮。
 */
function markTransientSuccess(actionKey: string) {
  transientSuccessAction.value = actionKey;
  clearTransientSuccessTimer();
  transientSuccessTimer = globalThis.setTimeout(() => {
    transientSuccessAction.value = null;
    transientSuccessTimer = undefined;
  }, 3000);
}

/**
 * 判断当前动作是否属于内置消息动作。
 */
function isBuiltinActionKey(actionKey: string): actionKey is RunSurfaceBuiltinMessageActionKey {
  return BUILTIN_ACTION_KEYS.has(actionKey as RunSurfaceBuiltinMessageActionKey);
}

/**
 * 用默认策略执行一次内置消息动作。
 */
async function runBuiltinAction(actionKey: string, context: RunSurfaceMessageActionContext): Promise<void> {
  const text = extractRunSurfaceMessageText(context.message, context.blocks);

  switch (actionKey) {
    case 'copy': {
      if (!text) {
        return;
      }

      await navigator.clipboard?.writeText(text);
      markTransientSuccess(actionKey);
      break;
    }
    case 'share': {
      if (!text) {
        return;
      }

      if (typeof navigator.share === 'function') {
        await navigator.share({
          text
        });
      } else {
        await navigator.clipboard?.writeText(text);
      }

      markTransientSuccess(actionKey);
      break;
    }
    case 'like':
    case 'dislike': {
      feedbackAction.value = actionKey;
      break;
    }
    case 'regenerate':
    default:
      break;
  }

  context.emitIntent(createRunSurfaceMessageActionIntent(actionKey, context, text));

  if (isBuiltinActionKey(actionKey)) {
    await resolvedOptions.value?.builtinHandlers?.[actionKey]?.(context);
  }
}

/**
 * 解析一个动作条目的默认标签。
 */
function resolveActionLabel(action: RunSurfaceMessageActionDefinition): string {
  if (action.label) {
    return action.label;
  }

  switch (action.key) {
    case 'copy':
      return transientSuccessAction.value === 'copy' ? '已复制' : '复制';
    case 'regenerate':
      return '重新生成';
    case 'retry':
      return '重试';
    case 'resume':
      return '继续';
    case 'interrupt':
      return '中断';
    case 'like':
      return '喜欢';
    case 'dislike':
      return '不喜欢';
    case 'share':
      return transientSuccessAction.value === 'share' ? '已分享' : '分享';
    default:
      return action.key;
  }
}

/**
 * 解析一个动作条目的默认标题。
 */
function resolveActionTitle(action: RunSurfaceMessageActionDefinition): string {
  return action.title ?? resolveActionLabel(action);
}

/**
 * 生成当前消息最终可渲染的动作按钮列表。
 */
const actions = computed<ResolvedMessageAction[]>(() => {
  if (!shouldRender.value) {
    return [];
  }

  const context = actionContext.value;

  return resolveRunSurfaceMessageActionItems(props.options)
    .filter((action) => isRunSurfaceMessageActionVisible(action, context))
    .map((action) => {
      const textEmpty = messageText.value.length === 0;
      const builtinDisabled = (
        (action.key === 'copy' || action.key === 'share')
        && textEmpty
      );
      const feedbackSelected = (
        (action.key === 'like' || action.key === 'dislike')
        && feedbackAction.value === action.key
      );

      return {
        key: action.key,
        label: resolveActionLabel(action),
        title: resolveActionTitle(action),
        icon: action.icon,
        disabled: builtinDisabled || isRunSurfaceMessageActionDisabled(action, context),
        onClick: async () => {
          if (action.onClick) {
            await action.onClick(context);
            return;
          }

          await runBuiltinAction(action.key, context);
        },
        ...(feedbackSelected ? { active: true } : {})
      } satisfies ResolvedMessageAction & { active?: boolean };
    })
    .map((action) => ({
      key: action.key,
      label: action.label,
      title: action.title,
      icon: action.icon,
      disabled: action.disabled,
      onClick: action.onClick,
      ...(action.active ? { active: true } : {})
    })) as ResolvedMessageAction[];
});

/**
 * 判断某个动作是否正处于选中态。
 */
function isActionActive(actionKey: string): boolean {
  return feedbackAction.value === actionKey || transientSuccessAction.value === actionKey;
}
</script>

<template>
  <div
    v-if="actions.length > 0"
    class="agentdown-run-surface-message-actions"
    :data-role="role"
  >
    <button
      v-for="action in actions"
      :key="action.key"
      type="button"
      class="agentdown-run-surface-message-action"
      :data-key="action.key"
      :data-active="isActionActive(action.key) ? 'true' : 'false'"
      :disabled="action.disabled"
      :title="action.title"
      :aria-label="action.label"
      @click="action.onClick().catch(() => {})"
    >
      <component
        :is="action.icon"
        v-if="action.icon"
        class="agentdown-run-surface-message-action-icon"
      />

      <svg
        v-else-if="action.key === 'copy' && transientSuccessAction === 'copy'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>

      <svg
        v-else-if="action.key === 'copy'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
      </svg>

      <svg
        v-else-if="action.key === 'regenerate'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
        <path d="M3 21v-5h5" />
      </svg>

      <svg
        v-else-if="action.key === 'retry'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M21 12a9 9 0 1 1-3.2-6.9" />
        <path d="M21 4v6h-6" />
      </svg>

      <svg
        v-else-if="action.key === 'resume'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M7 5.5v13l10-6.5Z" />
      </svg>

      <svg
        v-else-if="action.key === 'interrupt'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <rect x="6.5" y="6.5" width="11" height="11" rx="1.8" />
      </svg>

      <svg
        v-else-if="action.key === 'like'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M7 10v10" />
        <path d="M14 5l-1 5h6.5a2 2 0 0 1 2 2.4l-1 5A2 2 0 0 1 18.5 19H7V10l4.3-4.6A1.5 1.5 0 0 1 14 6.4V5Z" />
      </svg>

      <svg
        v-else-if="action.key === 'dislike'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M17 14V4" />
        <path d="M10 19l1-5H4.5a2 2 0 0 1-2-2.4l1-5A2 2 0 0 1 5.5 5H17v9l-4.3 4.6A1.5 1.5 0 0 1 10 17.6V19Z" />
      </svg>

      <svg
        v-else-if="action.key === 'share'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="agentdown-run-surface-message-action-icon"
      >
        <path d="M13 5 21 3 19 11" />
        <path d="M21 3 10 14" />
        <path d="M21 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      </svg>

      <span class="agentdown-run-surface-message-action-label">
        {{ action.label }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.agentdown-run-surface-message-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.agentdown-run-surface-message-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.95rem;
  height: 1.95rem;
  border: 0;
  border-radius: 999px;
  padding: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition:
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.agentdown-run-surface-message-action:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.14);
  color: #334155;
  transform: translateY(-1px);
}

.agentdown-run-surface-message-action[data-active='true'] {
  background: rgba(219, 234, 254, 0.92);
  color: #2563eb;
}

.agentdown-run-surface-message-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.agentdown-run-surface-message-action-icon {
  width: 0.92rem;
  height: 0.92rem;
  flex: 0 0 auto;
}

.agentdown-run-surface-message-action-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
