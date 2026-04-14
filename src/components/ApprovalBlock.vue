<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { MarkdownApprovalStatus } from '../core/types';
import {
  createRunSurfaceApprovalActionIntent,
  isRunSurfaceApprovalActionDisabled,
  isRunSurfaceApprovalActionVisible,
  resolveRunSurfaceApprovalActionItems,
  resolveRunSurfaceApprovalActionReasonMode,
  shouldRunSurfaceApprovalActionOpenReasonPrompt,
  validateRunSurfaceApprovalActionReason
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
  tone: 'primary' | 'danger' | 'warning' | 'neutral';
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
const reasonPromptActionKey = ref<string | null>(null);
const reasonPromptValue = ref('');
const reasonPromptError = ref('');
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
 * 关闭当前原因输入区，并清理临时输入状态。
 */
function closeReasonPrompt() {
  reasonPromptActionKey.value = null;
  reasonPromptValue.value = '';
  reasonPromptError.value = '';
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
 * 给动作按钮分配默认的轻量视觉语义。
 */
function resolveActionTone(action: RunSurfaceApprovalActionDefinition): ResolvedApprovalAction['tone'] {
  switch (action.key) {
    case 'approve':
    case 'resume':
      return 'primary';
    case 'reject':
    case 'interrupt':
      return 'danger';
    case 'changes_requested':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * 读取某个动作的原因输入标题。
 */
function resolveReasonLabel(action: RunSurfaceApprovalActionDefinition): string {
  if (action.reasonLabel) {
    return action.reasonLabel;
  }

  const context = actionContext.value;
  const reasonMode = context
    ? resolveRunSurfaceApprovalActionReasonMode(action, context)
    : 'hidden';

  if (reasonMode === 'optional') {
    return '可选备注';
  }

  return action.key === 'reject'
    ? '请填写拒绝原因'
    : '请填写修改原因';
}

/**
 * 读取某个动作的原因输入占位文案。
 */
function resolveReasonPlaceholder(action: RunSurfaceApprovalActionDefinition): string {
  if (action.reasonPlaceholder) {
    return action.reasonPlaceholder;
  }

  const context = actionContext.value;
  const reasonMode = context
    ? resolveRunSurfaceApprovalActionReasonMode(action, context)
    : 'hidden';

  if (reasonMode === 'optional') {
    return '可选填写备注，例如：客户已电话确认，可以直接发送。';
  }

  return action.key === 'reject'
    ? '例如：当前内容还不准确，先不要发送。'
    : '例如：请补充客户名称和最后确认时间。';
}

/**
 * 读取某个动作的原因确认按钮文案。
 */
function resolveReasonSubmitLabel(action: RunSurfaceApprovalActionDefinition): string {
  if (action.reasonSubmitLabel) {
    return action.reasonSubmitLabel;
  }

  const context = actionContext.value;
  const reasonMode = context
    ? resolveRunSurfaceApprovalActionReasonMode(action, context)
    : 'hidden';

  if (reasonMode === 'optional') {
    return '继续提交';
  }

  return action.key === 'reject'
    ? '提交拒绝原因'
    : '提交修改原因';
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
 * 统一执行一次 approval 动作，并在需要时把 reason 一起带给 handler 和 intent。
 */
async function executeApprovalAction(
  action: RunSurfaceApprovalActionDefinition,
  context: RunSurfaceApprovalActionContext,
  reason?: string
) {
  actionError.value = '';
  reasonPromptError.value = '';
  pendingActionKey.value = action.key;
  const previousReasonPromptActionKey = reasonPromptActionKey.value;
  const previousReasonPromptValue = reasonPromptValue.value;

  const executionContext: RunSurfaceApprovalActionContext = {
    ...context,
    ...(reason !== undefined ? { reason } : {})
  };

  closeReasonPrompt();

  try {
    if (action.onClick) {
      await action.onClick(executionContext);
    } else {
      await runBuiltinApprovalAction(action.key, executionContext);
    }

    markSuccess(action.key);
  } catch (error) {
    if (previousReasonPromptActionKey === action.key) {
      reasonPromptActionKey.value = previousReasonPromptActionKey;
      reasonPromptValue.value = previousReasonPromptValue;
    }

    actionError.value = error instanceof Error
      ? error.message
      : '审批动作执行失败，请稍后再试。';
  } finally {
    pendingActionKey.value = null;
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
      tone: resolveActionTone(action),
      disabled: resolveDefaultActionDisabled(action, context),
      loading: pendingActionKey.value === action.key,
      success: successActionKey.value === action.key,
      onClick: async () => {
        if (shouldRunSurfaceApprovalActionOpenReasonPrompt(action, context)) {
          actionError.value = '';
          reasonPromptError.value = '';
          const previousActionKey = reasonPromptActionKey.value;
          reasonPromptActionKey.value = action.key;

          if (previousActionKey !== action.key) {
            reasonPromptValue.value = '';
          }

          return;
        }

        closeReasonPrompt();
        await executeApprovalAction(action, context);
      }
    }));
});

/**
 * 当前正在等待填写原因的动作定义。
 */
const activeReasonAction = computed<RunSurfaceApprovalActionDefinition | null>(() => {
  const context = actionContext.value;

  if (!context || !reasonPromptActionKey.value || !resolvedApprovalActions.value) {
    return null;
  }

  return resolveRunSurfaceApprovalActionItems(resolvedApprovalActions.value)
    .find((action) => action.key === reasonPromptActionKey.value)
    ?? null;
});

/**
 * 提交当前原因输入区。
 */
async function submitReasonPrompt() {
  const action = activeReasonAction.value;
  const context = actionContext.value;

  if (!action || !context) {
    return;
  }

  const reason = reasonPromptValue.value.trim();
  const validationError = validateRunSurfaceApprovalActionReason(action, context, reason);

  if (validationError) {
    reasonPromptError.value = validationError;
    return;
  }

  await executeApprovalAction(action, context, reason.length > 0 ? reason : undefined);
}
</script>

<template>
  <section
    class="agentdown-approval-block"
    :data-status="resolvedStatus"
  >
    <div class="agentdown-approval-head">
      <div class="agentdown-approval-copy">
        <strong>{{ resolvedTitle }}</strong>
        <p
          v-if="resolvedMessage"
          class="agentdown-approval-message"
        >
          {{ resolvedMessage }}
        </p>
      </div>

      <span class="agentdown-approval-badge">{{ statusLabel }}</span>
    </div>

    <div
      v-if="actions.length > 0"
      class="agentdown-approval-actions"
    >
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        class="agentdown-approval-action"
        :data-tone="action.tone"
        :data-loading="action.loading ? 'true' : 'false'"
        :data-success="action.success ? 'true' : 'false'"
        :disabled="action.disabled"
        :title="action.title"
        @click="action.onClick().catch(() => {})"
      >
        {{ action.label }}
      </button>
    </div>

    <div
      v-if="activeReasonAction"
      class="agentdown-approval-reason"
    >
      <label class="agentdown-approval-reason__label">
        {{ resolveReasonLabel(activeReasonAction) }}
      </label>

      <textarea
        v-model="reasonPromptValue"
        class="agentdown-approval-reason__textarea"
        rows="3"
        :placeholder="resolveReasonPlaceholder(activeReasonAction)"
      />

      <p
        v-if="reasonPromptError"
        class="agentdown-approval-reason__error"
      >
        {{ reasonPromptError }}
      </p>

      <div class="agentdown-approval-reason__actions">
        <button
          type="button"
          class="agentdown-approval-action agentdown-approval-action--secondary"
          :disabled="pendingActionKey !== null"
          @click="closeReasonPrompt"
        >
          取消
        </button>

        <button
          type="button"
          class="agentdown-approval-action"
          :disabled="pendingActionKey !== null"
          @click="submitReasonPrompt().catch(() => {})"
        >
          {{ resolveReasonSubmitLabel(activeReasonAction) }}
        </button>
      </div>
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
  display: inline-flex;
  flex-direction: column;
  gap: 0.72rem;
  width: min(100%, 42rem);
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 1.35rem;
  padding: 0.84rem 0.92rem;
  background: rgba(255, 255, 255, 0.96);
}

.agentdown-approval-block[data-status='approved'] {
  border-color: rgba(110, 170, 136, 0.24);
}

.agentdown-approval-block[data-status='rejected'] {
  border-color: rgba(216, 121, 121, 0.26);
}

.agentdown-approval-block[data-status='changes_requested'] {
  border-color: rgba(214, 170, 94, 0.28);
}

.agentdown-approval-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
}

.agentdown-approval-copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.agentdown-approval-copy strong {
  color: #2f343b;
  font-size: 0.95rem;
  font-weight: 540;
  letter-spacing: -0.025em;
  line-height: 1.28;
  overflow-wrap: anywhere;
}

.agentdown-approval-badge {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.24rem 0.56rem;
  background: rgba(226, 232, 240, 0.58);
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 550;
  white-space: nowrap;
}

.agentdown-approval-block[data-status='approved'] .agentdown-approval-badge {
  background: rgba(111, 199, 174, 0.16);
  color: #537f6b;
}

.agentdown-approval-block[data-status='rejected'] .agentdown-approval-badge {
  background: rgba(234, 157, 149, 0.18);
  color: #9f5f59;
}

.agentdown-approval-block[data-status='changes_requested'] .agentdown-approval-badge {
  background: rgba(245, 193, 109, 0.2);
  color: #8e6a31;
}

.agentdown-approval-message {
  margin: 0;
  color: #7b8490;
  font-size: 0.84rem;
  line-height: 1.58;
}

.agentdown-approval-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.46rem;
}

.agentdown-approval-reason {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.58rem;
  border-top: 1px dashed rgba(203, 213, 225, 0.9);
  padding-top: 0.72rem;
}

.agentdown-approval-reason__label {
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
}

.agentdown-approval-reason__textarea {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  min-height: 80px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  border-radius: 1rem;
  padding: 0.7rem 0.8rem;
  resize: vertical;
  background: #fff;
  color: #0f172a;
  font: inherit;
  font-size: 0.84rem;
  line-height: 1.62;
}

.agentdown-approval-reason__textarea:focus {
  outline: 2px solid rgba(100, 116, 139, 0.14);
  outline-offset: 1px;
  border-color: rgba(148, 163, 184, 0.72);
}

.agentdown-approval-reason__error {
  margin: 0;
  color: #b65f5f;
  font-size: 0.8rem;
  line-height: 1.6;
}

.agentdown-approval-reason__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.agentdown-approval-action {
  border: 1px solid rgba(203, 213, 225, 0.88);
  border-radius: 999px;
  padding: 0.42rem 0.76rem;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: 0.79rem;
  font-weight: 560;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.agentdown-approval-action[data-tone='primary'] {
  border-color: #1f2937;
  background: #1f2937;
  color: #fff;
}

.agentdown-approval-action[data-tone='danger'] {
  border-color: rgba(234, 157, 149, 0.26);
  background: rgba(255, 247, 247, 0.96);
  color: #9f5f59;
}

.agentdown-approval-action[data-tone='warning'] {
  border-color: rgba(245, 193, 109, 0.3);
  background: rgba(255, 250, 240, 0.98);
  color: #8e6a31;
}

.agentdown-approval-action:hover:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.58);
  background: #f8fafc;
}

.agentdown-approval-action[data-tone='primary']:hover:not(:disabled) {
  border-color: #111827;
  background: #111827;
}

.agentdown-approval-action[data-tone='danger']:hover:not(:disabled) {
  border-color: rgba(234, 157, 149, 0.4);
  background: rgba(255, 243, 243, 0.98);
}

.agentdown-approval-action[data-tone='warning']:hover:not(:disabled) {
  border-color: rgba(245, 193, 109, 0.4);
  background: rgba(255, 248, 233, 0.98);
}

.agentdown-approval-action[data-success='true'] {
  border-color: rgba(100, 116, 139, 0.28);
  background: rgba(241, 245, 249, 0.96);
  color: #334155;
}

.agentdown-approval-action[data-loading='true'] {
  color: inherit;
}

.agentdown-approval-action:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.agentdown-approval-action--secondary {
  background: transparent;
  color: #475569;
}

.agentdown-approval-error {
  margin: 0;
  color: #b65f5f;
  font-size: 0.82rem;
  line-height: 1.6;
}
</style>
