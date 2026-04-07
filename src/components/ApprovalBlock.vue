<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { MarkdownApprovalStatus } from '../core/types';
import {
  createRunSurfaceApprovalActionIntent,
  isRunSurfaceApprovalActionDisabled,
  isRunSurfaceApprovalActionVisible,
  resolveRunSurfaceApprovalActionItems
} from '../surface/approvalActions';
import { useRunSurfaceBlockContext } from '../surface/runSurfaceContext';
import type {
  RunSurfaceApprovalActionContext,
  RunSurfaceApprovalActionDefinition,
  RunSurfaceApprovalActionsOptions,
  RunSurfaceBuiltinApprovalActionKey
} from '../surface/types';

/**
 * `ApprovalBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message?: string;
  approvalId?: string;
  status?: MarkdownApprovalStatus;
  refId?: string;
}

/**
 * approval 卡片最终可渲染的动作按钮结构。
 */
interface ResolvedApprovalAction {
  key: string;
  label: string;
  title: string;
  disabled: boolean;
  loading: boolean;
  success: boolean;
  onClick: () => Promise<void>;
}

const BUILTIN_PENDING_APPROVAL_ACTIONS = new Set([
  'approve',
  'reject',
  'changes_requested',
  'submit'
]);

const BUILTIN_APPROVAL_ACTION_KEYS = new Set<RunSurfaceBuiltinApprovalActionKey>([
  'approve',
  'reject',
  'changes_requested',
  'submit',
  'retry',
  'resume',
  'interrupt'
]);

const props = defineProps<Props>();
const runSurfaceContext = useRunSurfaceBlockContext();
const pendingActionKey = ref<string | null>(null);
const successActionKey = ref<string | null>(null);
const actionError = ref('');
let successTimer: number | undefined;

/**
 * 读取标题，统一成响应式值。
 */
const resolvedTitle = computed(() => props.title);

/**
 * 读取说明文案，统一成响应式值。
 */
const resolvedMessage = computed(() => props.message);

/**
 * 读取 approvalId，统一成响应式值。
 */
const resolvedApprovalId = computed(() => props.approvalId);

/**
 * 读取当前审批状态；未显式指定时默认为 pending。
 */
const resolvedStatus = computed<MarkdownApprovalStatus>(() => props.status ?? 'pending');

/**
 * 读取 runtime refId，统一成响应式值。
 */
const resolvedRefId = computed(() => props.refId);

/**
 * 把当前状态映射成用户可读标签。
 */
const statusLabel = computed(() => {
  switch (resolvedStatus.value) {
    case 'approved':
      return '已批准';
    case 'rejected':
      return '已拒绝';
    case 'changes_requested':
      return '需修改';
    default:
      return '待处理';
  }
});

/**
 * 收敛 RunSurface 里传入的 approval actions 配置。
 *
 * 独立 MarkdownRenderer 场景下拿不到 RunSurface 上下文，此时自然退化成纯展示卡片。
 */
const resolvedApprovalActions = computed<RunSurfaceApprovalActionsOptions | undefined>(() => {
  const options = runSurfaceContext?.approvalActions.value;

  if (!options || options.enabled === false) {
    return undefined;
  }

  return options;
});

/**
 * 生成 approval 动作执行时会用到的完整上下文。
 */
const actionContext = computed<RunSurfaceApprovalActionContext | null>(() => {
  if (!runSurfaceContext) {
    return null;
  }

  return {
    title: resolvedTitle.value,
    ...(resolvedMessage.value ? { message: resolvedMessage.value } : {}),
    ...(resolvedApprovalId.value ? { approvalId: resolvedApprovalId.value } : {}),
    status: resolvedStatus.value,
    ...(resolvedRefId.value ? { refId: resolvedRefId.value } : {}),
    block: runSurfaceContext.block.value,
    role: runSurfaceContext.role.value,
    runtime: runSurfaceContext.runtime,
    snapshot: runSurfaceContext.snapshot.value,
    emitIntent: runSurfaceContext.emitIntent
  };
});

/**
 * 判断某个 key 是否属于内置 approval 动作。
 */
function isBuiltinApprovalActionKey(actionKey: string): actionKey is RunSurfaceBuiltinApprovalActionKey {
  return BUILTIN_APPROVAL_ACTION_KEYS.has(actionKey as RunSurfaceBuiltinApprovalActionKey);
}

/**
 * 清理上一次成功态高亮定时器。
 */
function clearSuccessTimer() {
  if (successTimer !== undefined) {
    globalThis.clearTimeout(successTimer);
    successTimer = undefined;
  }
}

onBeforeUnmount(() => {
  clearSuccessTimer();
});

/**
 * 标记某个动作刚刚执行成功。
 */
function markSuccess(actionKey: string) {
  successActionKey.value = actionKey;
  clearSuccessTimer();
  successTimer = globalThis.setTimeout(() => {
    successActionKey.value = null;
    successTimer = undefined;
  }, 2000);
}

/**
 * 读取 approval 动作的默认显示标签。
 */
function resolveActionLabel(action: RunSurfaceApprovalActionDefinition): string {
  if (action.label) {
    return action.label;
  }

  switch (action.key) {
    case 'approve':
      return '批准';
    case 'reject':
      return '拒绝';
    case 'changes_requested':
      return '需修改';
    case 'submit':
      return '提交';
    case 'retry':
      return '重试';
    case 'resume':
      return '继续';
    case 'interrupt':
      return '中断';
    default:
      return action.key;
  }
}

/**
 * 读取 approval 动作的提示文案。
 */
function resolveActionTitle(action: RunSurfaceApprovalActionDefinition): string {
  return action.title ?? resolveActionLabel(action);
}

/**
 * 判断一个 approval 动作在未显式声明 visible 时是否应该显示。
 */
function resolveDefaultActionVisible(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): boolean {
  if (action.visible !== undefined) {
    return isRunSurfaceApprovalActionVisible(action, context);
  }

  if (BUILTIN_PENDING_APPROVAL_ACTIONS.has(action.key)) {
    return context.status === 'pending';
  }

  return true;
}

/**
 * 判断一个 approval 动作在未显式声明 disabled 时是否应该禁用。
 */
function resolveDefaultActionDisabled(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext
): boolean {
  const waitingAnotherAction = pendingActionKey.value !== null;
  const pendingOnlyActionBlocked = (
    BUILTIN_PENDING_APPROVAL_ACTIONS.has(action.key)
    && context.status !== 'pending'
  );

  return (
    waitingAnotherAction
    || pendingOnlyActionBlocked
    || isRunSurfaceApprovalActionDisabled(action, context)
  );
}

/**
 * 用默认策略执行一次内置 approval 动作。
 */
async function runBuiltinApprovalAction(
  actionKey: string,
  context: RunSurfaceApprovalActionContext
): Promise<void> {
  context.emitIntent(createRunSurfaceApprovalActionIntent(actionKey, context));

  if (isBuiltinApprovalActionKey(actionKey)) {
    await resolvedApprovalActions.value?.builtinHandlers?.[actionKey]?.(context);
  }
}

/**
 * 生成当前 approval 卡片真正会渲染的动作按钮列表。
 */
const actions = computed<ResolvedApprovalAction[]>(() => {
  const context = actionContext.value;

  if (!context || !resolvedApprovalActions.value) {
    return [];
  }

  return resolveRunSurfaceApprovalActionItems(resolvedApprovalActions.value)
    .filter((action) => resolveDefaultActionVisible(action, context))
    .map((action) => ({
      key: action.key,
      label: pendingActionKey.value === action.key ? '处理中...' : resolveActionLabel(action),
      title: resolveActionTitle(action),
      disabled: resolveDefaultActionDisabled(action, context),
      loading: pendingActionKey.value === action.key,
      success: successActionKey.value === action.key,
      onClick: async () => {
        actionError.value = '';
        pendingActionKey.value = action.key;

        try {
          if (action.onClick) {
            await action.onClick(context);
          } else {
            await runBuiltinApprovalAction(action.key, context);
          }

          markSuccess(action.key);
        } catch (error) {
          actionError.value = error instanceof Error
            ? error.message
            : '审批动作执行失败，请稍后再试。';
        } finally {
          pendingActionKey.value = null;
        }
      }
    }));
});
</script>

<template>
  <section
    class="agentdown-approval-block"
    :data-status="resolvedStatus"
  >
    <div class="agentdown-approval-head">
      <div class="agentdown-approval-copy">
        <span class="agentdown-approval-eyebrow">Approval</span>
        <strong>{{ resolvedTitle }}</strong>
      </div>
      <span class="agentdown-approval-badge">{{ statusLabel }}</span>
    </div>

    <p
      v-if="resolvedMessage"
      class="agentdown-approval-message"
    >
      {{ resolvedMessage }}
    </p>

    <dl
      v-if="resolvedApprovalId || resolvedRefId"
      class="agentdown-approval-meta"
    >
      <div v-if="resolvedApprovalId">
        <dt>ID</dt>
        <dd>{{ resolvedApprovalId }}</dd>
      </div>

      <div v-if="resolvedRefId">
        <dt>Ref</dt>
        <dd>{{ resolvedRefId }}</dd>
      </div>
    </dl>

    <div
      v-if="actions.length > 0"
      class="agentdown-approval-actions"
    >
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        class="agentdown-approval-action"
        :data-loading="action.loading ? 'true' : 'false'"
        :data-success="action.success ? 'true' : 'false'"
        :disabled="action.disabled"
        :title="action.title"
        @click="action.onClick().catch(() => {})"
      >
        {{ action.label }}
      </button>
    </div>

    <p
      v-if="actionError"
      class="agentdown-approval-error"
    >
      {{ actionError }}
    </p>
  </section>
</template>

<style scoped>
.agentdown-approval-block {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  border: 1px solid var(--agentdown-border-color);
  border-radius: calc(var(--agentdown-radius) + 2px);
  padding: 1rem 1.05rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98)),
    var(--agentdown-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-approval-block[data-status='approved'] {
  border-color: rgba(5, 150, 105, 0.22);
}

.agentdown-approval-block[data-status='rejected'] {
  border-color: rgba(220, 38, 38, 0.22);
}

.agentdown-approval-block[data-status='changes_requested'] {
  border-color: rgba(217, 119, 6, 0.22);
}

.agentdown-approval-head,
.agentdown-approval-meta,
.agentdown-approval-meta div {
  display: flex;
  align-items: center;
}

.agentdown-approval-head {
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-approval-copy {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.agentdown-approval-copy strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-approval-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-approval-badge {
  border-radius: 999px;
  padding: 0.32rem 0.68rem;
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.agentdown-approval-block[data-status='approved'] .agentdown-approval-badge {
  background: rgba(5, 150, 105, 0.12);
  color: #047857;
}

.agentdown-approval-block[data-status='rejected'] .agentdown-approval-badge {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.agentdown-approval-block[data-status='changes_requested'] .agentdown-approval-badge {
  background: rgba(217, 119, 6, 0.12);
  color: #b45309;
}

.agentdown-approval-message {
  margin: 0;
  color: var(--agentdown-text-color);
  line-height: 1.7;
}

.agentdown-approval-meta {
  flex-wrap: wrap;
  gap: 0.9rem;
}

.agentdown-approval-meta div {
  gap: 0.42rem;
  min-width: 0;
}

.agentdown-approval-meta dt {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-approval-meta dd {
  margin: 0;
  color: var(--agentdown-text-color);
  font-family:
    'SFMono-Regular',
    'JetBrains Mono',
    'Fira Code',
    'Menlo',
    monospace;
  font-size: 0.82rem;
}

.agentdown-approval-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.agentdown-approval-action {
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 999px;
  padding: 0.5rem 0.82rem;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.agentdown-approval-action:hover:not(:disabled) {
  border-color: #cbd5e1;
  background: #f8fafc;
  transform: translateY(-1px);
}

.agentdown-approval-action[data-success='true'] {
  border-color: rgba(5, 150, 105, 0.24);
  background: rgba(5, 150, 105, 0.08);
  color: #047857;
}

.agentdown-approval-action[data-loading='true'] {
  color: #334155;
}

.agentdown-approval-action:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
}

.agentdown-approval-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.82rem;
  line-height: 1.6;
}
</style>
