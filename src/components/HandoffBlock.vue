<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  createRunSurfaceHandoffActionIntent,
  isRunSurfaceHandoffActionDisabled,
  isRunSurfaceHandoffActionVisible,
  resolveRunSurfaceHandoffActionInputMode,
  resolveRunSurfaceHandoffActionItems,
  validateRunSurfaceHandoffActionInput
} from '../surface/handoffActions';
import { useRunSurfaceBlockContext } from '../surface/runSurfaceContext';
import type {
  RunSurfaceBuiltinHandoffActionKey,
  RunSurfaceHandoffActionContext,
  RunSurfaceHandoffActionDefinition,
  RunSurfaceHandoffActionsOptions
} from '../surface/types';

/**
 * `HandoffBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message?: string;
  handoffId?: string;
  status?: string;
  targetType?: string;
  assignee?: string;
  refId?: string;
}

/**
 * handoff 卡片最终可渲染的动作按钮结构。
 */
interface ResolvedHandoffAction {
  key: string;
  label: string;
  title: string;
  disabled: boolean;
  loading: boolean;
  success: boolean;
  action: RunSurfaceHandoffActionDefinition;
  onClick: () => Promise<void>;
}

const BUILTIN_PENDING_HANDOFF_ACTIONS = new Set([
  'submit'
]);

const BUILTIN_HANDOFF_ACTION_KEYS = new Set<RunSurfaceBuiltinHandoffActionKey>([
  'submit'
]);

const props = defineProps<Props>();
const runSurfaceContext = useRunSurfaceBlockContext();
const pendingActionKey = ref<string | null>(null);
const successActionKey = ref<string | null>(null);
const actionError = ref('');
const inputValue = ref('');
const inputError = ref('');
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
 * 读取 handoffId，统一成响应式值。
 */
const resolvedHandoffId = computed(() => props.handoffId);

/**
 * 读取当前 handoff 状态；未显式指定时默认为 pending。
 */
const resolvedStatus = computed(() => props.status ?? 'pending');

/**
 * 读取 handoff 目标类型，缺省时回退到 human。
 */
const resolvedTargetType = computed(() => props.targetType ?? 'human');

/**
 * 读取 handoff 接收方。
 */
const resolvedAssignee = computed(() => props.assignee);

/**
 * 读取 runtime refId，统一成响应式值。
 */
const resolvedRefId = computed(() => props.refId);

/**
 * 把当前状态映射成用户可读标签。
 */
const statusLabel = computed(() => {
  switch (resolvedStatus.value) {
    case 'accepted':
      return '已接收';
    case 'completed':
      return '已完成';
    case 'declined':
      return '已拒绝';
    default:
      return '等待中';
  }
});

/**
 * 收敛 RunSurface 里传入的 handoff actions 配置。
 *
 * 独立 MarkdownRenderer 场景下拿不到 RunSurface 上下文，此时自然退化成纯展示卡片。
 */
const resolvedHandoffActions = computed<RunSurfaceHandoffActionsOptions | undefined>(() => {
  const options = runSurfaceContext?.handoffActions.value;

  if (!options || options.enabled === false) {
    return undefined;
  }

  return options;
});

/**
 * 生成 handoff 动作执行时会用到的完整上下文。
 */
const actionContext = computed<RunSurfaceHandoffActionContext | null>(() => {
  if (!runSurfaceContext) {
    return null;
  }

  return {
    title: resolvedTitle.value,
    ...(resolvedMessage.value ? { message: resolvedMessage.value } : {}),
    ...(resolvedHandoffId.value ? { handoffId: resolvedHandoffId.value } : {}),
    status: resolvedStatus.value,
    ...(resolvedTargetType.value ? { targetType: resolvedTargetType.value } : {}),
    ...(resolvedAssignee.value ? { assignee: resolvedAssignee.value } : {}),
    ...(resolvedRefId.value ? { refId: resolvedRefId.value } : {}),
    block: runSurfaceContext.block.value,
    role: runSurfaceContext.role.value,
    runtime: runSurfaceContext.runtime,
    snapshot: runSurfaceContext.snapshot.value,
    emitIntent: runSurfaceContext.emitIntent
  };
});

/**
 * 判断某个 key 是否属于内置 handoff 动作。
 */
function isBuiltinHandoffActionKey(actionKey: string): actionKey is RunSurfaceBuiltinHandoffActionKey {
  return BUILTIN_HANDOFF_ACTION_KEYS.has(actionKey as RunSurfaceBuiltinHandoffActionKey);
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
 * 读取 handoff 动作的默认显示标签。
 */
function resolveActionLabel(action: RunSurfaceHandoffActionDefinition): string {
  if (action.label) {
    return action.label;
  }

  switch (action.key) {
    case 'submit':
      return '继续';
    default:
      return action.key;
  }
}

/**
 * 读取 handoff 动作的提示文案。
 */
function resolveActionTitle(action: RunSurfaceHandoffActionDefinition): string {
  return action.title ?? resolveActionLabel(action);
}

/**
 * 读取输入区标题。
 */
function resolveInputLabel(action: RunSurfaceHandoffActionDefinition): string {
  if (action.inputLabel) {
    return action.inputLabel;
  }

  return '人工回复';
}

/**
 * 读取输入框占位文案。
 */
function resolveInputPlaceholder(action: RunSurfaceHandoffActionDefinition): string {
  if (action.inputPlaceholder) {
    return action.inputPlaceholder;
  }

  return '请输入交接后的回复内容，例如：已确认，请继续执行。';
}

/**
 * 读取输入提交按钮文案。
 */
function resolveInputSubmitLabel(action: RunSurfaceHandoffActionDefinition): string {
  if (action.inputSubmitLabel) {
    return action.inputSubmitLabel;
  }

  return resolveActionLabel(action);
}

/**
 * 判断一个 handoff 动作在未显式声明 visible 时是否应该显示。
 */
function resolveDefaultActionVisible(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext
): boolean {
  if (action.visible !== undefined) {
    return isRunSurfaceHandoffActionVisible(action, context);
  }

  if (BUILTIN_PENDING_HANDOFF_ACTIONS.has(action.key)) {
    return context.status === 'pending';
  }

  return true;
}

/**
 * 判断一个 handoff 动作在未显式声明 disabled 时是否应该禁用。
 */
function resolveDefaultActionDisabled(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext
): boolean {
  const waitingAnotherAction = pendingActionKey.value !== null;
  const pendingOnlyActionBlocked = (
    BUILTIN_PENDING_HANDOFF_ACTIONS.has(action.key)
    && context.status !== 'pending'
  );

  return (
    waitingAnotherAction
    || pendingOnlyActionBlocked
    || isRunSurfaceHandoffActionDisabled(action, context)
  );
}

/**
 * 用默认策略执行一次内置 handoff 动作。
 */
async function runBuiltinHandoffAction(
  actionKey: string,
  context: RunSurfaceHandoffActionContext
): Promise<void> {
  context.emitIntent(createRunSurfaceHandoffActionIntent(actionKey, context));

  if (isBuiltinHandoffActionKey(actionKey)) {
    await resolvedHandoffActions.value?.builtinHandlers?.[actionKey]?.(context);
  }
}

/**
 * 统一执行一次 handoff 动作，并在需要时把输入内容一起带给 handler 和 intent。
 */
async function executeHandoffAction(
  action: RunSurfaceHandoffActionDefinition,
  context: RunSurfaceHandoffActionContext,
  input?: string
) {
  actionError.value = '';
  inputError.value = '';
  pendingActionKey.value = action.key;

  const executionContext: RunSurfaceHandoffActionContext = {
    ...context,
    ...(input !== undefined ? { input } : {})
  };

  try {
    if (action.onClick) {
      await action.onClick(executionContext);
    } else {
      await runBuiltinHandoffAction(action.key, executionContext);
    }

    markSuccess(action.key);

    if (input !== undefined) {
      inputValue.value = '';
    }
  } catch (error) {
    actionError.value = error instanceof Error
      ? error.message
      : '交接动作执行失败，请稍后再试。';
  } finally {
    pendingActionKey.value = null;
  }
}

/**
 * 生成当前 handoff 卡片真正会渲染的动作按钮列表。
 */
const actions = computed<ResolvedHandoffAction[]>(() => {
  const context = actionContext.value;

  if (!context || !resolvedHandoffActions.value) {
    return [];
  }

  return resolveRunSurfaceHandoffActionItems(resolvedHandoffActions.value)
    .filter((action) => resolveDefaultActionVisible(action, context))
    .map((action) => ({
      key: action.key,
      label: pendingActionKey.value === action.key ? '处理中...' : resolveActionLabel(action),
      title: resolveActionTitle(action),
      disabled: resolveDefaultActionDisabled(action, context),
      loading: pendingActionKey.value === action.key,
      success: successActionKey.value === action.key,
      action,
      onClick: async () => {
        await executeHandoffAction(action, context);
      }
    }));
});

/**
 * 当前负责承载输入框的主动作。
 */
const primaryInputAction = computed<ResolvedHandoffAction | null>(() => {
  const context = actionContext.value;

  if (!context) {
    return null;
  }

  return actions.value.find((action) => {
    return resolveRunSurfaceHandoffActionInputMode(action.action, context) !== 'hidden';
  }) ?? null;
});

/**
 * 当前需要渲染成普通按钮的 handoff 动作。
 */
const secondaryActions = computed(() => {
  const primary = primaryInputAction.value;

  if (!primary) {
    return actions.value;
  }

  return actions.value.filter((action) => action.key !== primary.key);
});

/**
 * 提交主输入动作。
 */
async function submitPrimaryInputAction() {
  const action = primaryInputAction.value;
  const context = actionContext.value;

  if (!action || !context) {
    return;
  }

  const validationResult = validateRunSurfaceHandoffActionInput(
    action.action,
    context,
    inputValue.value
  );

  if (validationResult) {
    inputError.value = validationResult;
    return;
  }

  await executeHandoffAction(action.action, context, inputValue.value.trim());
}
</script>

<template>
  <section
    class="agentdown-handoff-block"
    :data-status="resolvedStatus"
    :data-target="resolvedTargetType"
  >
    <div class="agentdown-handoff-head">
      <div class="agentdown-handoff-copy">
        <span class="agentdown-handoff-eyebrow">Handoff</span>
        <strong>{{ title }}</strong>
      </div>

      <div class="agentdown-handoff-badges">
        <span class="agentdown-handoff-target">{{ resolvedTargetType }}</span>
        <span class="agentdown-handoff-status">{{ statusLabel }}</span>
      </div>
    </div>

    <p
      v-if="message"
      class="agentdown-handoff-message"
    >
      {{ message }}
    </p>

    <dl class="agentdown-handoff-meta">
      <div v-if="assignee">
        <dt>To</dt>
        <dd>{{ assignee }}</dd>
      </div>

      <div v-if="handoffId">
        <dt>ID</dt>
        <dd>{{ handoffId }}</dd>
      </div>
    </dl>

    <form
      v-if="primaryInputAction"
      class="agentdown-handoff-form"
      @submit.prevent="submitPrimaryInputAction().catch(() => {})"
    >
      <label class="agentdown-handoff-form__label">
        {{ resolveInputLabel(primaryInputAction.action) }}
      </label>

      <textarea
        v-model="inputValue"
        class="agentdown-handoff-form__input"
        rows="3"
        :placeholder="resolveInputPlaceholder(primaryInputAction.action)"
        :disabled="primaryInputAction.disabled"
      />

      <p
        v-if="inputError"
        class="agentdown-handoff-form__error"
      >
        {{ inputError }}
      </p>

      <button
        type="submit"
        class="agentdown-handoff-form__submit"
        :title="primaryInputAction.title"
        :disabled="primaryInputAction.disabled"
      >
        {{ primaryInputAction.loading ? '处理中...' : resolveInputSubmitLabel(primaryInputAction.action) }}
      </button>
    </form>

    <div
      v-if="secondaryActions.length > 0"
      class="agentdown-handoff-actions"
    >
      <button
        v-for="action in secondaryActions"
        :key="action.key"
        type="button"
        class="agentdown-handoff-actions__button"
        :title="action.title"
        :disabled="action.disabled"
        :data-success="action.success ? 'true' : 'false'"
        @click="action.onClick().catch(() => {})"
      >
        {{ action.label }}
      </button>
    </div>

    <p
      v-if="actionError"
      class="agentdown-handoff-error"
    >
      {{ actionError }}
    </p>
  </section>
</template>

<style scoped>
.agentdown-handoff-block {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--agentdown-border-color);
  border-radius: calc(var(--agentdown-radius) + 2px);
  padding: 1rem 1.05rem;
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.1), transparent 34%),
    var(--agentdown-elevated-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-handoff-head,
.agentdown-handoff-meta,
.agentdown-handoff-meta div,
.agentdown-handoff-badges {
  display: flex;
  align-items: center;
}

.agentdown-handoff-head {
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-handoff-copy {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  min-width: 0;
}

.agentdown-handoff-copy strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}

.agentdown-handoff-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-handoff-badges {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.agentdown-handoff-target,
.agentdown-handoff-status {
  border-radius: 999px;
  padding: 0.3rem 0.66rem;
  font-size: 0.79rem;
  font-weight: 600;
  text-transform: capitalize;
}

.agentdown-handoff-target {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.agentdown-handoff-status {
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
}

.agentdown-handoff-message {
  margin: 0;
  color: var(--agentdown-text-color);
  line-height: 1.7;
}

.agentdown-handoff-meta {
  flex-wrap: wrap;
  gap: 0.9rem;
}

.agentdown-handoff-meta div {
  gap: 0.42rem;
}

.agentdown-handoff-meta dt {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-handoff-meta dd {
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

.agentdown-handoff-form {
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
}

.agentdown-handoff-form__label {
  color: var(--agentdown-text-color);
  font-size: 0.84rem;
  font-weight: 600;
}

.agentdown-handoff-form__input {
  width: 100%;
  min-height: 92px;
  resize: vertical;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 14px;
  padding: 0.8rem 0.92rem;
  background: rgba(255, 255, 255, 0.82);
  color: var(--agentdown-text-color);
  font: inherit;
  line-height: 1.65;
  box-sizing: border-box;
}

.agentdown-handoff-form__submit,
.agentdown-handoff-actions__button {
  align-self: flex-start;
  border: 0;
  border-radius: 999px;
  padding: 0.58rem 1rem;
  background: #0f172a;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.agentdown-handoff-form__submit:disabled,
.agentdown-handoff-actions__button:disabled {
  cursor: progress;
  opacity: 0.72;
}

.agentdown-handoff-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.agentdown-handoff-actions__button[data-success='true'] {
  background: #0f766e;
}

.agentdown-handoff-form__error,
.agentdown-handoff-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.84rem;
  line-height: 1.6;
}
</style>
