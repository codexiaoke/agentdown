<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAgentSession } from '@agentdown/vue';
import { createReferenceAdapter } from '@agentdown/reference';
import { artifactReport, currentConnection, currentExecution, initialOptions, interactionConfirmation, label, reportDelivery, returnToLive, saveAndNavigate, text, toolOutput, toolTitle, uncertainOperations } from './ui';

const adapter = createReferenceAdapter({ endpoint: '/api' });
const initial = initialOptions('vue', adapter);
const { session, snapshot, actions } = useAgentSession(initial.options);
const draft = ref('调研 Agentdown 的下一代架构，关键操作前请让我确认。');
const notice = ref(initial.error);
const ackArmed = ref(false);
const execution = computed(() => currentExecution(snapshot.value));
const connection = computed(() => currentConnection(snapshot.value));
const uncertain = computed(() => uncertainOperations(snapshot.value));
const latestOperation = computed(() => snapshot.value.operations[snapshot.value.operations.length - 1]);
const artifacts = computed(() => snapshot.value.artifacts.map(artifact => ({ artifact, report: artifactReport(artifact) })));
const replay = computed(() => snapshot.value.mode === 'replay');
const canDisconnect = computed(() => !replay.value && ['connecting', 'connected', 'reconnecting'].includes(connection.value?.status ?? 'idle'));

function send() {
  if (!draft.value.trim() || !snapshot.value.canSend) return;
  const input = draft.value;
  const handle = actions.send({ text: input });
  reportDelivery(handle, message => { notice.value = message; });
  void handle.delivery.then(outcome => {
    if (outcome.status === 'delivered' && draft.value === input) draft.value = '';
  });
  ackArmed.value = false;
}
function respond(id: string, approved: boolean) {
  reportDelivery(actions.respond(id, { approved }), message => { notice.value = message; });
  ackArmed.value = false;
}
function disconnect() { reportDelivery(actions.disconnect(execution.value?.id), message => { notice.value = message; }); }
function resume() {
  if (execution.value) reportDelivery(actions.resume(execution.value.id), message => { notice.value = message; });
}
function cancel() {
  if (execution.value) reportDelivery(actions.cancel(execution.value.id), message => { notice.value = message; });
}
function retry(id: string) { reportDelivery(actions.retryOperation(id), message => { notice.value = message; }); ackArmed.value = false; }
function save(mode: 'live' | 'replay') {
  try { saveAndNavigate(session, 'vue', mode); }
  catch { notice.value = '会话保存失败，请检查浏览器是否允许本地存储。'; }
}
function loseAck() { adapter.loseNextAcknowledgement(); ackArmed.value = true; }
</script>

<template>
  <main class="workspace">
    <header class="topbar">
      <a class="brand" href="/vue.html" aria-label="Agentdown Vue 工作台"><span class="brand-mark" aria-hidden="true">a</span>agentdown<span class="brand-note">交互运行时</span></a>
      <nav class="framework-tabs" aria-label="切换框架示例"><a class="framework-tab" href="/vue.html" aria-current="page">Vue</a><a class="framework-tab" href="/react.html">React</a></nav>
    </header>

    <div class="page-heading">
      <div><p class="eyebrow">Agent workspace / prototype</p><h1>每一步，都有迹可循。</h1><p class="page-description">发起任务、查看执行、处理决策，再带着完整上下文继续。</p></div>
      <span v-if="replay" class="mode-badge replay" data-testid="replay-mode">历史回放 · 只读</span>
      <span v-else class="mode-badge">Vue · 实时工作台</span>
    </div>
    <div v-if="replay" class="replay-banner"><span>正在查看已保存的会话。回放不会连接后端或提交操作。</span><button class="text-button" @click="returnToLive">返回实时模式</button></div>
    <div v-if="notice" class="toast" role="alert" data-testid="notice"><span>{{ notice }}</span><button aria-label="关闭提示" @click="notice = ''">×</button></div>

    <div v-for="operation in uncertain" :key="operation.id" class="operation-notice" data-testid="uncertain-operation" role="status">
      <p>这次操作的投递结果尚未确定。后端可能已经收到，当前界面仍等待确认。</p>
      <button class="secondary-button" :disabled="replay" :data-testid="`retry-${operation.id}`" @click="retry(operation.id)">沿原操作身份重试</button>
    </div>

    <div class="workbench-grid">
      <section class="panel conversation-panel" aria-labelledby="conversation-title">
        <div class="panel-header"><h2 id="conversation-title">对话</h2><span class="panel-count">{{ snapshot.messages.length }} 条消息</span></div>
        <div class="conversation-content" aria-live="polite" data-testid="messages">
          <div v-if="snapshot.messages.length === 0" class="conversation-empty">
            <div class="empty-symbol" aria-hidden="true">↗</div><h3>从一个任务开始</h3><p>这里会保留你的输入、Agent 的说明和最终结果。执行过程与待处理决策会同步显示在右侧。</p>
            <div class="flow-preview" aria-hidden="true"><span>发起任务</span><i>→</i><span>执行与工具</span><i>→</i><span>人工决策</span><i>→</i><span>交付产物</span></div>
          </div>
          <article v-for="message in snapshot.messages" :key="message.id" :class="['message', message.role]" :data-testid="`message-${message.id}`">
            <div class="message-avatar" aria-hidden="true">{{ message.role === 'user' ? '你' : 'AD' }}</div>
            <div><div class="message-meta">{{ message.role === 'user' ? '你' : message.role === 'tool' ? '工具' : 'Agent' }}<span>{{ label(message.status) }}</span></div><p class="message-text">{{ message.text }}</p></div>
          </article>
        </div>
        <form class="composer" @submit.prevent="send">
          <label for="task-input" class="composer-label">新的任务</label>
          <textarea id="task-input" v-model="draft" :disabled="replay" data-testid="task-input" placeholder="告诉 Agent，你想完成什么？" rows="3" />
          <div class="composer-footer"><span class="composer-note">只有点击发送，才会发起新的任务。</span><button class="primary-button" :disabled="replay || !snapshot.canSend || !draft.trim()" data-testid="send-task" type="submit">发送任务 <span aria-hidden="true">↗</span></button></div>
        </form>
      </section>

      <aside class="sidebar" aria-label="任务状态与结果">
        <section class="panel" aria-labelledby="state-title">
          <div class="panel-header"><h2 id="state-title">任务状态</h2></div>
          <div class="status-content">
            <div class="status-row"><span>执行</span><span :class="['status-value', execution?.status ?? 'idle']" data-testid="execution-status">{{ execution ? label(execution.status) : '等待任务' }}</span></div>
            <div class="status-row"><span>连接</span><span :class="['status-value', connection?.status ?? 'idle']" data-testid="connection-status">{{ label(connection?.status ?? 'idle') }}</span></div>
            <div class="status-row"><span>最近操作</span><span class="status-value" data-testid="operation-status">{{ latestOperation ? `${label(latestOperation.status)} · ${label(latestOperation.acceptance)}` : '暂无操作' }}</span></div>
            <div class="control-buttons"><button class="secondary-button" :disabled="!canDisconnect" data-testid="disconnect" @click="disconnect">断开连接</button><button class="secondary-button" :disabled="replay || !snapshot.canResume || !execution" data-testid="resume" @click="resume">恢复执行</button><button class="danger-button" :disabled="replay || !snapshot.canCancel || !execution" data-testid="cancel" @click="cancel">取消任务</button></div>
            <div class="archive-controls"><button class="text-button" data-testid="save-reload" @click="save('live')">保存并刷新</button><span class="separator" aria-hidden="true">/</span><button class="text-button" :disabled="replay || snapshot.messages.length === 0" data-testid="replay" @click="save('replay')">查看回放</button></div>
            <button v-if="!replay" class="text-button" :disabled="ackArmed" data-testid="simulate-lost-ack" @click="loseAck">{{ ackArmed ? '下一次投递将丢失确认' : '模拟确认丢失' }}</button>
            <p v-if="!replay" class="simulation-note">先断开连接，再模拟丢失确认，可观察待核实状态。</p>
          </div>
        </section>

        <section class="panel" aria-labelledby="progress-title">
          <div class="panel-header"><h2 id="progress-title">执行过程</h2><span class="panel-count">{{ snapshot.steps.length + snapshot.tools.length }} 项</span></div>
          <div class="timeline" data-testid="execution-progress">
            <p v-if="snapshot.steps.length === 0 && snapshot.tools.length === 0" class="timeline-empty">执行开始后，步骤和工具会出现在这里。</p>
            <div v-for="step in snapshot.steps" :key="step.id" :class="['timeline-item', step.status]" :data-testid="`step-${step.id}`"><div class="timeline-title"><span>{{ step.title }}</span><span class="timeline-status">{{ label(step.status) }}</span></div></div>
            <div v-for="tool in snapshot.tools" :key="tool.id" :class="['timeline-item', tool.status]" :data-testid="`tool-${tool.id}`"><div class="timeline-title"><span>{{ toolTitle(tool.name) }}</span><span class="timeline-status">{{ label(tool.status) }}</span></div><p v-if="tool.output !== undefined" class="tool-output">{{ toolOutput(tool.output) }}</p></div>
          </div>
        </section>

        <section class="panel interaction-panel" aria-labelledby="interactions-title">
          <div class="panel-header"><h2 id="interactions-title">待处理决策</h2><span class="panel-count" data-testid="pending-count">{{ snapshot.pendingInteractions.length }} 项待确认</span></div>
          <div class="interaction-content" data-testid="interactions">
            <p v-if="snapshot.interactions.length === 0" class="interaction-empty">Agent 需要你的决定时，会在这里提出请求。</p>
            <article v-for="interaction in snapshot.interactions" :key="interaction.id" :class="['interaction-card', { resolved: interaction.status === 'resolved' }]" :data-testid="`interaction-${interaction.id}`">
              <h3>{{ interaction.prompt }}</h3><p>{{ interaction.kind === 'approval' ? '这一项由你决定，结果以实际后端确认为准。' : '当前原型只支持审批交互。' }}</p>
              <div v-if="interaction.kind === 'approval' && interaction.status !== 'resolved'" class="interaction-actions"><button class="primary-button" :disabled="replay || interaction.status !== 'pending'" :data-testid="`approve-${interaction.id}`" @click="respond(interaction.id, true)">批准</button><button class="secondary-button" :disabled="replay || interaction.status !== 'pending'" :data-testid="`reject-${interaction.id}`" @click="respond(interaction.id, false)">拒绝</button></div>
              <p class="interaction-confirmation" :data-testid="`interaction-status-${interaction.id}`">{{ interaction.status === 'pending' ? '等待你的选择' : interactionConfirmation(interaction) }}</p>
            </article>
          </div>
        </section>

        <section class="panel artifact-panel" aria-labelledby="artifacts-title">
          <div class="panel-header"><h2 id="artifacts-title">交付产物</h2><span class="panel-count">{{ snapshot.artifacts.length }} 项</span></div>
          <div class="artifact-content" data-testid="artifacts">
            <p v-if="snapshot.artifacts.length === 0" class="artifact-empty">任务形成的报告与结构化结果会保留在这里。</p>
            <article v-for="{ artifact, report } in artifacts" :key="artifact.id" class="artifact-card" :data-testid="`artifact-${artifact.id}`">
              <div class="artifact-heading"><span class="artifact-icon" aria-hidden="true">▤</span><div><h3>{{ artifact.title }}</h3><span class="artifact-version">v{{ artifact.revision }} · {{ label(artifact.status) }}</span></div></div>
              <template v-if="report"><p class="artifact-text">{{ report.summary }}</p><p v-if="report.input" class="artifact-request"><span>原始任务</span>{{ report.input }}</p><ul class="artifact-decisions"><li v-for="(decision, index) in report.decisions" :key="index"><span>{{ decision.action }}</span><strong>{{ decision.decision }}</strong></li></ul><details class="artifact-data"><summary>查看原始数据</summary><pre>{{ text(artifact.content) }}</pre></details></template>
              <p v-else class="artifact-text">{{ text(artifact.content) }}</p>
            </article>
          </div>
        </section>
      </aside>
    </div>
    <p class="workbench-footnote">无模型参考后端 · 本阶段验证完整交互流程，内容以安全纯文本呈现。</p>
  </main>
</template>
