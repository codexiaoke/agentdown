<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import {
  RunSurface,
  cmd,
  createAgentRuntime,
  type RunSurfaceOptions,
  type RuntimeIntent,
  type RuntimeSnapshot
} from '../../index';

const CONVERSATION_ID = 'session:demo:human-loop';
const TURN_ID = 'turn:demo:human-loop:approval';
const USER_MESSAGE_ID = 'message:user:demo:human-loop:1';
const ASSISTANT_MESSAGE_ID = 'message:assistant:demo:human-loop:intro';
const PROGRESS_TURN_ID = 'turn:demo:human-loop:delivery';
const PROGRESS_MESSAGE_ID = 'message:assistant:demo:human-loop:delivery';
const USER_BLOCK_ID = 'block:demo:human-loop:user';
const INTRO_BLOCK_ID = 'block:demo:human-loop:intro';
const APPROVAL_BLOCK_ID = 'block:demo:human-loop:approval';
const PROGRESS_BLOCK_ID = 'block:demo:human-loop:progress';
const DELIVERY_NODE_ID = 'run:demo:human-loop:delivery';
const APPROVAL_ID = 'approval:demo:human-loop:send';

/**
 * demo 内发送流程的简化状态。
 */
type DeliveryState = 'waiting_approval' | 'running' | 'paused' | 'done' | 'rejected' | 'changes_requested';

const runtime = createAgentRuntime();
const snapshot = shallowRef<RuntimeSnapshot>(runtime.snapshot());
const deliveryState = shallowRef<DeliveryState>('waiting_approval');
let unsubscribe: (() => void) | null = null;
let deliveryTimer: number | undefined;

/**
 * 当前页面展示的 surface 配置。
 */
const surface = computed<RunSurfaceOptions>(() => ({
  approvalActions: {
    enabled: true,
    builtinHandlers: {
      approve: async () => {
        approveDelivery();
      },
      reject: async () => {
        rejectDelivery();
      },
      changes_requested: async () => {
        requestChanges();
      }
    }
  },
  messageActions: {
    assistant: {
      enabled: true,
      showWhileRunning: true,
      actions: [
        'copy',
        {
          key: 'interrupt',
          visible: ({ messageId }) => {
            return messageId === PROGRESS_MESSAGE_ID && deliveryState.value === 'running';
          }
        },
        {
          key: 'resume',
          visible: ({ messageId }) => {
            return messageId === PROGRESS_MESSAGE_ID && deliveryState.value === 'paused';
          }
        },
        {
          key: 'retry',
          visible: ({ messageId }) => {
            return (
              messageId === PROGRESS_MESSAGE_ID
              && (deliveryState.value === 'paused' || deliveryState.value === 'done')
            );
          }
        },
        {
          key: 'regenerate',
          visible: ({ messageId }) => {
            return (
              messageId === PROGRESS_MESSAGE_ID
              && deliveryState.value !== 'running'
            );
          }
        }
      ],
      builtinHandlers: {
        interrupt: async () => {
          interruptDelivery();
        },
        resume: async () => {
          resumeDelivery();
        },
        retry: async () => {
          retryDelivery();
        },
        regenerate: async () => {
          resetDemo();
        }
      }
    }
  }
}));

/**
 * 倒序读取最近几条 intent，方便观察 approval.action / message.action。
 */
const recentIntents = computed(() => {
  return snapshot.value.intents.slice(-8).reverse();
});

/**
 * 清理发送完成定时器。
 */
function clearDeliveryTimer() {
  if (deliveryTimer !== undefined) {
    globalThis.clearTimeout(deliveryTimer);
    deliveryTimer = undefined;
  }
}

/**
 * 同步 snapshot，供页面和日志区域使用。
 */
function refreshSnapshot() {
  snapshot.value = runtime.snapshot();
}

/**
 * 删除当前进度消息和关联节点。
 */
function removeProgressArtifacts() {
  runtime.apply([
    cmd.block.remove(PROGRESS_BLOCK_ID),
    cmd.node.remove(DELIVERY_NODE_ID)
  ]);
}

/**
 * 把 approval 卡片更新到指定状态。
 */
function updateApproval(status: DeliveryState, message: string) {
  const approvalStatus = status === 'rejected'
    ? 'rejected'
    : status === 'changes_requested'
      ? 'changes_requested'
      : status === 'waiting_approval'
        ? 'pending'
        : 'approved';

  runtime.apply(cmd.approval.update({
    id: APPROVAL_BLOCK_ID,
    role: 'assistant',
    title: '是否发送客户邮件',
    approvalId: APPROVAL_ID,
    status: approvalStatus,
    message,
    conversationId: CONVERSATION_ID,
    turnId: TURN_ID,
    messageId: ASSISTANT_MESSAGE_ID,
    at: Date.now()
  }));
}

/**
 * 创建或更新发送进度消息。
 */
function upsertProgressMessage(status: string, content: string) {
  runtime.apply([
    cmd.node.upsert({
      id: DELIVERY_NODE_ID,
      type: 'run',
      title: '邮件发送流程',
      status,
      data: {
        stage: 'delivery'
      },
      updatedAt: Date.now()
    }),
    cmd.message.upsert({
      id: PROGRESS_BLOCK_ID,
      role: 'assistant',
      nodeId: DELIVERY_NODE_ID,
      content,
      conversationId: CONVERSATION_ID,
      turnId: PROGRESS_TURN_ID,
      messageId: PROGRESS_MESSAGE_ID,
      at: Date.now()
    })
  ]);
}

/**
 * 模拟一段仍在运行中的发送流程。
 */
function startDelivery(content: string) {
  clearDeliveryTimer();
  deliveryState.value = 'running';
  upsertProgressMessage('running', content);
  deliveryTimer = globalThis.setTimeout(() => {
    completeDelivery();
  }, 1400);
}

/**
 * 把发送流程标记为完成。
 */
function completeDelivery() {
  clearDeliveryTimer();
  deliveryState.value = 'done';
  upsertProgressMessage(
    'done',
    '邮件已准备好并进入发送队列。你可以复制结果，也可以重试或重新生成一次。'
  );
}

/**
 * 点击批准后推进流程继续执行。
 */
function approveDelivery() {
  updateApproval('done', '已批准，Agent 正在继续执行发送流程。');
  startDelivery('已批准，正在发送前做最后检查...');
}

/**
 * 点击拒绝后停止当前流程。
 */
function rejectDelivery() {
  clearDeliveryTimer();
  deliveryState.value = 'rejected';
  updateApproval('rejected', '已拒绝，本次发送流程已停止。');
  removeProgressArtifacts();
}

/**
 * 点击“需修改”后回到待调整状态。
 */
function requestChanges() {
  clearDeliveryTimer();
  deliveryState.value = 'changes_requested';
  updateApproval('changes_requested', '已标记为需修改，Agent 会根据意见重新整理。');
  removeProgressArtifacts();
}

/**
 * 中断当前进行中的发送流程。
 */
function interruptDelivery() {
  if (deliveryState.value !== 'running') {
    return;
  }

  clearDeliveryTimer();
  deliveryState.value = 'paused';
  upsertProgressMessage('paused', '发送流程已暂停。你可以继续，或者直接重试这一轮。');
}

/**
 * 恢复一个已经暂停的发送流程。
 */
function resumeDelivery() {
  if (deliveryState.value !== 'paused') {
    return;
  }

  startDelivery('已恢复发送流程，正在继续发送...');
}

/**
 * 重新执行一次发送流程。
 */
function retryDelivery() {
  startDelivery('正在重新执行发送流程...');
}

/**
 * 初始化整个 demo 的基础对话。
 */
function seedConversation() {
  const now = Date.now();

  runtime.apply([
    cmd.message.text({
      id: USER_BLOCK_ID,
      role: 'user',
      text: '帮我整理一封客户确认邮件，发出去前先让我审批。',
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      messageId: USER_MESSAGE_ID,
      at: now
    }),
    cmd.message.text({
      id: INTRO_BLOCK_ID,
      role: 'assistant',
      text: '我已经整理好邮件草稿了。正式发送前，请先确认这一步审批。',
      conversationId: CONVERSATION_ID,
      turnId: TURN_ID,
      messageId: ASSISTANT_MESSAGE_ID,
      at: now + 1
    })
  ]);

  updateApproval('waiting_approval', '确认无误后我再继续发送。');
}

/**
 * 重置当前 demo，回到最初的待审批状态。
 */
function resetDemo() {
  clearDeliveryTimer();
  runtime.reset();
  deliveryState.value = 'waiting_approval';
  seedConversation();
  refreshSnapshot();
}

/**
 * 从 intent 中提取更好读的摘要文案。
 */
function resolveIntentSummary(intent: RuntimeIntent): string {
  const payload = intent.payload as Record<string, unknown>;

  if (intent.type === 'approval.action') {
    return `approval.action / ${String(payload.action ?? '')}`;
  }

  if (intent.type === 'message.action') {
    return `message.action / ${String(payload.action ?? '')}`;
  }

  return intent.type;
}

/**
 * 复制一条 intent 的完整 JSON。
 */
async function copyIntent(intent: RuntimeIntent) {
  await navigator.clipboard?.writeText(JSON.stringify(intent, null, 2));
}

onMounted(() => {
  unsubscribe = runtime.subscribe(() => {
    refreshSnapshot();
  });

  resetDemo();
});

onBeforeUnmount(() => {
  clearDeliveryTimer();
  unsubscribe?.();
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>Human-In-The-Loop</h1>
      <p>这页直接演示审批卡动作、消息动作和 runtime intent。批准后会进入“发送流程”，你可以中断、恢复、重试或重新生成。</p>
    </header>

    <div class="demo-page__toolbar">
      <button
        type="button"
        class="demo-page__reset"
        @click="resetDemo"
      >
        重置 Demo
      </button>

      <span class="demo-page__status">
        当前状态：{{ deliveryState }}
      </span>
    </div>

    <RunSurface
      :runtime="runtime"
      v-bind="surface"
    />

    <section class="demo-page__panel">
      <div class="demo-page__panel-head">
        <strong>最近 Intent</strong>
        <span>点击后可以直接复制 JSON，联调后端时很方便。</span>
      </div>

      <p
        v-if="recentIntents.length === 0"
        class="demo-page__empty"
      >
        还没有动作 intent，先试一下批准或中断。
      </p>

      <button
        v-for="intent in recentIntents"
        v-else
        :key="intent.id"
        type="button"
        class="demo-page__intent"
        @click="copyIntent(intent).catch(() => {})"
      >
        <div>
          <strong>{{ resolveIntentSummary(intent) }}</strong>
          <span>{{ new Date(intent.at).toLocaleTimeString() }}</span>
        </div>

        <code>{{ JSON.stringify(intent.payload) }}</code>
      </button>
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 44px 24px 80px;
  min-height: 100%;
}

.demo-page__header h1,
.demo-page__header p {
  margin: 0;
}

.demo-page__header h1 {
  font-size: 28px;
  letter-spacing: -0.05em;
}

.demo-page__header p {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.8;
}

.demo-page__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 22px 0 24px;
}

.demo-page__reset {
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e8eef7;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-page__status {
  color: #475569;
  font-size: 13px;
}

.demo-page__panel {
  margin-top: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 18px;
  background: #fff;
}

.demo-page__panel-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.demo-page__panel-head strong {
  font-size: 15px;
}

.demo-page__panel-head span,
.demo-page__empty {
  color: #64748b;
  font-size: 13px;
  line-height: 1.8;
}

.demo-page__empty {
  margin: 0;
}

.demo-page__intent {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #f8fafc;
  text-align: left;
  cursor: pointer;
}

.demo-page__intent + .demo-page__intent {
  margin-top: 10px;
}

.demo-page__intent > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.demo-page__intent strong {
  font-size: 13px;
}

.demo-page__intent span {
  color: #64748b;
  font-size: 12px;
}

.demo-page__intent code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #334155;
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-page__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .demo-page__intent > div {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
