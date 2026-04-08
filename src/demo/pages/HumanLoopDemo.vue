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
const REVIEW_TURN_ID = 'turn:demo:human-loop:review';
const FLOW_TURN_ID = 'turn:demo:human-loop:flow';
const BRANCH_TURN_ID = 'turn:demo:human-loop:branch';
const HANDOFF_TURN_ID = 'turn:demo:human-loop:handoff';
const USER_MESSAGE_ID = 'message:user:demo:human-loop:review';
const REVIEW_MESSAGE_ID = 'message:assistant:demo:human-loop:review';
const PROGRESS_MESSAGE_ID = 'message:assistant:demo:human-loop:flow';
const BRANCH_MESSAGE_ID = 'message:assistant:demo:human-loop:branch';
const HANDOFF_MESSAGE_ID = 'message:assistant:demo:human-loop:handoff';
const USER_TEXT_BLOCK_ID = 'block:demo:human-loop:user:text';
const USER_ATTACHMENT_BLOCK_ID = 'block:demo:human-loop:user:attachment';
const INTRO_BLOCK_ID = 'block:demo:human-loop:intro';
const APPROVAL_BLOCK_ID = 'block:demo:human-loop:approval';
const PROGRESS_BLOCK_ID = 'block:demo:human-loop:progress';
const BRANCH_TEXT_BLOCK_ID = 'block:demo:human-loop:branch:text';
const BRANCH_BLOCK_ID = 'block:demo:human-loop:branch';
const HANDOFF_TEXT_BLOCK_ID = 'block:demo:human-loop:handoff:text';
const HANDOFF_BLOCK_ID = 'block:demo:human-loop:handoff';
const MAIN_RUN_ID = 'run:demo:human-loop:compose';
const BRANCH_RUN_ID = 'run:demo:human-loop:revision';
const APPROVAL_ID = 'approval:demo:human-loop:send';
const BRANCH_ID = 'branch:demo:human-loop:revision-2';
const HANDOFF_ID = 'handoff:demo:human-loop:review';

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
    actions: [
      {
        key: 'reject',
        reasonMinLength: 4
      },
      {
        key: 'changes_requested',
        reasonMinLength: 4
      }
    ],
    builtinHandlers: {
      approve: async () => {
        approveDelivery();
      },
      reject: async ({ reason }) => {
        rejectDelivery(reason);
      },
      changes_requested: async ({ reason }) => {
        requestChanges(reason);
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
 * 统一更新主运行节点的状态和说明文案。
 */
function patchMainRun(status: string, message: string, at = Date.now()) {
  runtime.apply(cmd.node.patch(MAIN_RUN_ID, {
    status,
    message,
    updatedAt: at,
    data: {
      stage: status
    }
  }));
}

/**
 * 删除后续流程里派生出的 block 和 branch node。
 */
function clearFollowupArtifacts() {
  runtime.apply([
    cmd.block.remove(PROGRESS_BLOCK_ID),
    cmd.block.remove(BRANCH_TEXT_BLOCK_ID),
    cmd.block.remove(BRANCH_BLOCK_ID),
    cmd.block.remove(HANDOFF_TEXT_BLOCK_ID),
    cmd.block.remove(HANDOFF_BLOCK_ID),
    cmd.node.remove(BRANCH_RUN_ID)
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
    refId: MAIN_RUN_ID,
    conversationId: CONVERSATION_ID,
    turnId: REVIEW_TURN_ID,
    messageId: REVIEW_MESSAGE_ID,
    at: Date.now()
  }));
}

/**
 * 创建或更新发送进度消息。
 */
function upsertProgressMessage(status: string, content: string) {
  const now = Date.now();

  patchMainRun(status, content, now);
  runtime.apply(cmd.message.upsert({
    id: PROGRESS_BLOCK_ID,
    role: 'assistant',
    nodeId: MAIN_RUN_ID,
    content,
    conversationId: CONVERSATION_ID,
    turnId: FLOW_TURN_ID,
    messageId: PROGRESS_MESSAGE_ID,
    at: now
  }));
}

/**
 * 展示“需修改”后派生 branch 并交接团队的流程。
 */
function showBranchFlow(reason?: string) {
  const now = Date.now();
  const summary = reason
    ? `我已根据你的修改意见创建修订分支，并交给文案团队继续处理。原因：${reason}`
    : '我已创建一个修订分支，并交给文案团队继续处理。';
  const handoffMessage = reason
    ? `文案团队会按这条意见继续改写：${reason}`
    : '等待文案团队继续补充和改写。';

  clearFollowupArtifacts();
  patchMainRun('blocked', '主流程已暂停，等待修订分支处理。', now);
  runtime.apply([
    cmd.run.start({
      id: BRANCH_RUN_ID,
      parentId: MAIN_RUN_ID,
      title: '邮件修订分支',
      status: 'running',
      message: '根据审批意见继续修订邮件内容。',
      at: now,
      data: {
        branchId: BRANCH_ID
      }
    }),
    cmd.message.text({
      id: BRANCH_TEXT_BLOCK_ID,
      role: 'assistant',
      text: summary,
      conversationId: CONVERSATION_ID,
      turnId: BRANCH_TURN_ID,
      messageId: BRANCH_MESSAGE_ID,
      at: now + 1
    }),
    cmd.message.branch({
      id: BRANCH_BLOCK_ID,
      role: 'assistant',
      title: '已派生修订分支',
      branchId: BRANCH_ID,
      sourceRunId: MAIN_RUN_ID,
      targetRunId: BRANCH_RUN_ID,
      status: 'running',
      label: 'revision-2',
      message: '当前主流程被挂起，后续修改会在分支里继续推进。',
      conversationId: CONVERSATION_ID,
      turnId: BRANCH_TURN_ID,
      messageId: BRANCH_MESSAGE_ID,
      at: now + 2
    }),
    cmd.message.handoff({
      id: HANDOFF_BLOCK_ID,
      role: 'assistant',
      title: '已交接给文案团队',
      handoffId: HANDOFF_ID,
      targetType: 'team',
      assignee: '文案团队',
      status: 'pending',
      message: handoffMessage,
      conversationId: CONVERSATION_ID,
      turnId: BRANCH_TURN_ID,
      messageId: BRANCH_MESSAGE_ID,
      at: now + 3
    })
  ]);
}

/**
 * 展示“拒绝”后转人工跟进的 handoff 流程。
 */
function showHumanHandoff(reason?: string) {
  const now = Date.now();
  const summary = reason
    ? `本次发送流程已停止，我已把这轮处理交接给客户成功经理。原因：${reason}`
    : '本次发送流程已停止，我已把这轮处理交接给客户成功经理。';
  const handoffMessage = reason
    ? `人工接手时会重点关注这条原因：${reason}`
    : '等待人工确认后再决定是否重开新的发送流程。';

  clearFollowupArtifacts();
  patchMainRun('blocked', '当前流程已停止，等待人工跟进。', now);
  runtime.apply([
    cmd.message.text({
      id: HANDOFF_TEXT_BLOCK_ID,
      role: 'assistant',
      text: summary,
      conversationId: CONVERSATION_ID,
      turnId: HANDOFF_TURN_ID,
      messageId: HANDOFF_MESSAGE_ID,
      at: now + 1
    }),
    cmd.message.handoff({
      id: HANDOFF_BLOCK_ID,
      role: 'assistant',
      title: '已交接给客户成功经理',
      handoffId: HANDOFF_ID,
      targetType: 'human',
      assignee: '客户成功经理',
      status: 'pending',
      message: handoffMessage,
      conversationId: CONVERSATION_ID,
      turnId: HANDOFF_TURN_ID,
      messageId: HANDOFF_MESSAGE_ID,
      at: now + 2
    })
  ]);
}

/**
 * 模拟一段仍在运行中的发送流程。
 */
function startDelivery(content: string) {
  clearDeliveryTimer();
  clearFollowupArtifacts();
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
 * 点击拒绝后停止当前流程，并转人工跟进。
 */
function rejectDelivery(reason?: string) {
  clearDeliveryTimer();
  deliveryState.value = 'rejected';
  updateApproval(
    'rejected',
    reason
      ? `已拒绝，本次发送流程已停止。原因：${reason}`
      : '已拒绝，本次发送流程已停止。'
  );
  showHumanHandoff(reason);
}

/**
 * 点击“需修改”后创建分支，并交给团队继续处理。
 */
function requestChanges(reason?: string) {
  clearDeliveryTimer();
  deliveryState.value = 'changes_requested';
  updateApproval(
    'changes_requested',
    reason
      ? `已标记为需修改。原因：${reason}`
      : '已标记为需修改，Agent 会根据意见重新整理。'
  );
  showBranchFlow(reason);
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
    cmd.run.start({
      id: MAIN_RUN_ID,
      title: '客户邮件处理',
      status: 'waiting_approval',
      message: '等待用户审批邮件发送。',
      at: now
    }),
    cmd.message.text({
      id: USER_TEXT_BLOCK_ID,
      role: 'user',
      text: '帮我整理一封客户确认邮件，发出去前先让我审批。',
      conversationId: CONVERSATION_ID,
      turnId: REVIEW_TURN_ID,
      messageId: USER_MESSAGE_ID,
      at: now + 1
    }),
    cmd.message.attachment({
      id: USER_ATTACHMENT_BLOCK_ID,
      role: 'user',
      title: '客户需求附件',
      attachmentKind: 'file',
      attachmentId: 'file:client-brief',
      label: 'client-brief.pdf',
      mimeType: 'application/pdf',
      sizeText: '1.7 MB',
      message: '用户上传了一份客户沟通摘要，邮件内容需要参考这里的关键信息。',
      conversationId: CONVERSATION_ID,
      turnId: REVIEW_TURN_ID,
      messageId: USER_MESSAGE_ID,
      at: now + 2
    }),
    cmd.message.text({
      id: INTRO_BLOCK_ID,
      role: 'assistant',
      text: '我已经整理好邮件草稿了。正式发送前，请先确认这一步审批。如果你点“需修改”，我会从当前运行派生一个修订分支；如果你点“拒绝”，我会直接交接给人工继续跟进。',
      conversationId: CONVERSATION_ID,
      turnId: REVIEW_TURN_ID,
      messageId: REVIEW_MESSAGE_ID,
      at: now + 3
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
      <p>这页把用户附件、审批动作、branch、handoff 和消息操作串成一条完整 workflow。批准后会继续执行；需修改会派生修订分支；拒绝会直接交接给人工。</p>
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
        <span>点击后可以直接复制 JSON，联调审批动作、消息动作和非 UI side effect 时都很方便。</span>
      </div>

      <p
        v-if="recentIntents.length === 0"
        class="demo-page__empty"
      >
        还没有动作 intent，先试一下批准、需修改或拒绝。
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
