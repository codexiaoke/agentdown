<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  RunSurface,
  createAgentRuntime,
  createBridge,
  createMarkdownAssembler,
  createPlainTextAssembler,
  restoreAgentdownRenderArchive,
  type BuiltinAgentdownRenderRecord,
  type RunSurfaceApprovalActionsOptions
} from '../../../../src/index';
import {
  ONLINE_DEMO_INTRO_CHUNKS,
  ONLINE_DEMO_PROMPT,
  ONLINE_DEMO_RESULT_CHUNKS,
  createOnlineDemoArchive,
  createOnlineDemoProtocol,
  reduceOnlineDemoRecords,
  type OnlineDemoEvent,
  type OnlineDemoEventLogEntry
} from '../../../../src/demo/onlineScenario';

type DemoPhase = 'idle' | 'streaming' | 'waiting' | 'running' | 'completed' | 'replaying';

const DEMO_BASE_AT = 1_784_240_000_000;
const prompt = ref(ONLINE_DEMO_PROMPT);
const phase = ref<DemoPhase>('idle');
const records = ref<BuiltinAgentdownRenderRecord[]>([]);
const eventLog = ref<OnlineDemoEventLogEntry[]>([]);
const runtime = createAgentRuntime();
const bridge = createBridge<OnlineDemoEvent>({
  runtime,
  protocol: createOnlineDemoProtocol(),
  assemblers: {
    markdown: createMarkdownAssembler(),
    text: createPlainTextAssembler()
  },
  scheduler: 'sync',
  debug: {
    recordRawPackets: true,
    maxEntries: 80
  }
});

let scenarioVersion = 0;
let eventIndex = 0;
const pendingDelays = new Map<number, () => void>();

const phaseMeta = computed(() => {
  switch (phase.value) {
    case 'streaming':
      return { label: '正在流式输出', tone: 'busy', hint: '浏览器内 mock 正在逐段推送事件。' };
    case 'waiting':
      return { label: '等待人工确认', tone: 'waiting', hint: '请在对话中的审批卡片点击“批准并继续”。' };
    case 'running':
      return { label: '工具执行中', tone: 'busy', hint: '批准后使用同一个 runtime 继续当前任务。' };
    case 'completed':
      return { label: '运行完成', tone: 'done', hint: '现在可以导出 archive，或从 records 重新回放。' };
    case 'replaying':
      return { label: '正在回放', tone: 'busy', hint: '正在用导出的 records 逐条恢复界面。' };
    default:
      return { label: '等待开始', tone: 'idle', hint: '无需 API Key，也无需启动后端。' };
  }
});

const canStart = computed(() => phase.value === 'idle' || phase.value === 'completed');
const canReplay = computed(() => phase.value === 'completed' && records.value.length > 0);
const canExport = computed(() => records.value.length > 0 && phase.value !== 'replaying');
const archiveStatus = computed<'running' | 'waiting' | 'completed'>(() => {
  if (phase.value === 'waiting') {
    return 'waiting';
  }

  return phase.value === 'completed' ? 'completed' : 'running';
});
const archive = computed(() => createOnlineDemoArchive(
  records.value,
  archiveStatus.value,
  DEMO_BASE_AT + Math.max(eventIndex, 1)
));
const latestEventIndex = computed(() => eventLog.value.at(-1)?.index ?? 0);

function cancelPendingDelays() {
  for (const [timerId, resolve] of pendingDelays) {
    globalThis.clearTimeout(timerId);
    resolve();
  }

  pendingDelays.clear();
}

function waitForStep(milliseconds: number, version: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timerId = globalThis.setTimeout(() => {
      pendingDelays.delete(timerId);
      resolve(version === scenarioVersion);
    }, milliseconds);

    pendingDelays.set(timerId, () => resolve(false));
  });
}

function nextAt(): number {
  eventIndex += 1;
  return DEMO_BASE_AT + eventIndex;
}

function emitEvent(event: OnlineDemoEvent) {
  bridge.push(event);
  records.value = reduceOnlineDemoRecords(records.value, event);
  eventLog.value = [...eventLog.value, {
    index: eventLog.value.length + 1,
    event
  }];
}

function resetDemo() {
  scenarioVersion += 1;
  cancelPendingDelays();
  bridge.reset();
  records.value = [];
  eventLog.value = [];
  eventIndex = 0;
  phase.value = 'idle';
}

async function runDemo() {
  if (!canStart.value || prompt.value.trim().length === 0) {
    return;
  }

  resetDemo();
  const version = scenarioVersion;
  phase.value = 'streaming';
  emitEvent({ type: 'user.message', text: prompt.value.trim(), at: nextAt() });

  if (!await waitForStep(260, version)) return;
  emitEvent({ type: 'assistant.stream.started', stream: 'intro', at: nextAt() });

  for (const chunk of ONLINE_DEMO_INTRO_CHUNKS) {
    emitEvent({ type: 'assistant.stream.delta', stream: 'intro', text: chunk, at: nextAt() });
    if (!await waitForStep(360, version)) return;
  }

  emitEvent({ type: 'assistant.stream.completed', stream: 'intro', at: nextAt() });
  if (!await waitForStep(240, version)) return;
  emitEvent({ type: 'tool.requested', at: nextAt() });
  if (!await waitForStep(280, version)) return;
  emitEvent({ type: 'approval.requested', at: nextAt() });
  phase.value = 'waiting';
}

async function continueAfterApproval() {
  if (phase.value !== 'waiting') {
    return;
  }

  const version = scenarioVersion;
  phase.value = 'running';
  emitEvent({ type: 'approval.approved', at: nextAt() });

  if (!await waitForStep(260, version)) return;
  emitEvent({ type: 'tool.started', at: nextAt() });
  if (!await waitForStep(720, version)) return;
  emitEvent({ type: 'tool.completed', at: nextAt() });
  if (!await waitForStep(260, version)) return;

  phase.value = 'streaming';
  emitEvent({ type: 'assistant.stream.started', stream: 'result', at: nextAt() });
  for (const chunk of ONLINE_DEMO_RESULT_CHUNKS) {
    emitEvent({ type: 'assistant.stream.delta', stream: 'result', text: chunk, at: nextAt() });
    if (!await waitForStep(330, version)) return;
  }

  emitEvent({ type: 'assistant.stream.completed', stream: 'result', at: nextAt() });
  if (!await waitForStep(240, version)) return;
  emitEvent({ type: 'artifact.created', at: nextAt() });
  phase.value = 'completed';
}

const approvalActions: RunSurfaceApprovalActionsOptions = {
  actions: [{
    key: 'approve',
    label: '批准并继续',
    title: '批准工具调用并继续运行'
  }],
  builtinHandlers: {
    approve: continueAfterApproval
  }
};

function exportArchive() {
  if (!canExport.value || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([JSON.stringify(archive.value, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'agentdown-online-demo.json';
  anchor.click();
  URL.revokeObjectURL(href);
}

async function replayArchive() {
  if (!canReplay.value) {
    return;
  }

  const version = ++scenarioVersion;
  cancelPendingDelays();
  const replayRecords = [...records.value];
  phase.value = 'replaying';
  runtime.reset();

  for (let index = 1; index <= replayRecords.length; index += 1) {
    runtime.reset();
    const restored = restoreAgentdownRenderArchive(replayRecords.slice(0, index));
    runtime.apply(restored.commands);

    if (!await waitForStep(420, version)) return;
  }

  phase.value = 'completed';
}

function eventPayload(event: OnlineDemoEvent): string {
  const { type: _type, at: _at, ...payload } = event;
  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : '{}';
}

onBeforeUnmount(() => {
  scenarioVersion += 1;
  cancelPendingDelays();
  bridge.close();
});
</script>

<template>
  <section class="online-demo">
    <header class="online-demo__hero">
      <div class="online-demo__eyebrow">
        <span class="online-demo__live-dot" />
        零配置在线体验
      </div>
      <div class="online-demo__hero-grid">
        <div>
          <h1>一次看懂 Agentdown 的完整运行闭环</h1>
          <p>
            这不是截图或静态聊天模板。下面的事件会在浏览器内经过真实的
            protocol、bridge、runtime 和 RunSurface，直到人工审批、工具继续执行与 archive 回放。
          </p>
        </div>
        <ul aria-label="演示特性">
          <li><strong>0</strong><span>API Key</span></li>
          <li><strong>0</strong><span>后端服务</span></li>
          <li><strong>1</strong><span>完整闭环</span></li>
        </ul>
      </div>
    </header>

    <div class="online-demo__shell">
      <main class="online-demo__conversation">
        <div class="online-demo__toolbar">
          <div>
            <span class="online-demo__status" :data-tone="phaseMeta.tone">
              <i />
              {{ phaseMeta.label }}
            </span>
            <p aria-live="polite">{{ phaseMeta.hint }}</p>
          </div>
          <button type="button" class="online-demo__quiet-button" @click="resetDemo">
            重置
          </button>
        </div>

        <div class="online-demo__surface" data-testid="online-demo-surface">
          <RunSurface
            :runtime="runtime"
            :approval-actions="approvalActions"
            empty-text="输入问题，开始这段确定性演示。"
            :performance="{ lazyMount: false, blockVirtualize: false }"
          />
        </div>

        <form class="online-demo__composer" @submit.prevent="runDemo">
          <label for="online-demo-prompt">给 Agent 的问题</label>
          <div>
            <textarea
              id="online-demo-prompt"
              v-model="prompt"
              rows="2"
              :disabled="!canStart"
              aria-describedby="online-demo-composer-hint"
            />
            <button type="submit" :disabled="!canStart || prompt.trim().length === 0">
              {{ phase === 'completed' ? '重新运行' : '运行演示' }}
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10h11M11 6l4 4-4 4" />
              </svg>
            </button>
          </div>
          <small id="online-demo-composer-hint">输出内容固定，修改问题只会改变用户消息，方便稳定复现。</small>
        </form>
      </main>

      <aside class="online-demo__inspector">
        <div class="online-demo__inspector-header">
          <div>
            <span>Runtime inspector</span>
            <strong>{{ eventLog.length }} 个原始事件</strong>
          </div>
          <span class="online-demo__browser-badge">Browser mock</span>
        </div>

        <div class="online-demo__pipeline" aria-label="事件处理链路">
          <span>event</span><i>→</i><span>protocol</span><i>→</i><span>runtime</span><i>→</i><span>UI</span>
        </div>

        <div class="online-demo__events" aria-live="polite">
          <div v-if="eventLog.length === 0" class="online-demo__events-empty">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 6.5h14M5 12h9M5 17.5h11" />
            </svg>
            <strong>事件会在这里出现</strong>
            <span>运行演示后可观察协议输入。</span>
          </div>
          <div
            v-for="entry in eventLog"
            :key="entry.index"
            class="online-demo__event"
            :data-latest="entry.index === latestEventIndex"
          >
            <span>#{{ String(entry.index).padStart(2, '0') }}</span>
            <div>
              <strong>{{ entry.event.type }}</strong>
              <code>{{ eventPayload(entry.event) }}</code>
            </div>
          </div>
        </div>

        <div class="online-demo__archive">
          <div>
            <span>agentdown.session/v1</span>
            <strong>{{ records.length }} records · {{ archiveStatus }}</strong>
          </div>
          <div class="online-demo__archive-actions">
            <button type="button" :disabled="!canExport" @click="exportArchive">
              导出 JSON
            </button>
            <button type="button" class="online-demo__archive-primary" :disabled="!canReplay" @click="replayArchive">
              回放 records
            </button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.online-demo {
  --demo-ink: #17221b;
  --demo-muted: #66736b;
  --demo-accent: #176c45;
  --demo-accent-soft: #e9f4ed;
  --demo-line: rgba(23, 34, 27, 0.11);
  width: min(1440px, calc(100% - 40px));
  margin: 0 auto;
  padding: 56px 0 72px;
  color: var(--demo-ink);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
}

.online-demo__hero {
  margin-bottom: 28px;
}

.online-demo__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  border: 1px solid rgba(23, 108, 69, 0.16);
  border-radius: 999px;
  padding: 7px 11px;
  background: var(--demo-accent-soft);
  color: var(--demo-accent);
  font-size: 12px;
  font-weight: 720;
  letter-spacing: 0.06em;
}

.online-demo__live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #25a66a;
  box-shadow: 0 0 0 4px rgba(37, 166, 106, 0.12);
}

.online-demo__hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 48px;
}

.online-demo__hero h1 {
  max-width: 820px;
  margin: 0;
  color: var(--demo-ink);
  font-size: clamp(34px, 4.4vw, 62px);
  font-weight: 740;
  line-height: 1.06;
  letter-spacing: -0.055em;
}

.online-demo__hero p {
  max-width: 820px;
  margin: 20px 0 0;
  color: var(--demo-muted);
  font-size: 17px;
  line-height: 1.75;
}

.online-demo__hero ul {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.online-demo__hero li {
  display: flex;
  width: 86px;
  min-height: 76px;
  flex-direction: column;
  justify-content: center;
  border: 1px solid var(--demo-line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
  text-align: center;
}

.online-demo__hero li strong {
  color: var(--demo-ink);
  font-size: 24px;
  line-height: 1;
}

.online-demo__hero li span {
  margin-top: 8px;
  color: var(--demo-muted);
  font-size: 11px;
}

.online-demo__shell {
  display: grid;
  min-height: 710px;
  grid-template-columns: minmax(0, 1.55fr) minmax(330px, 0.72fr);
  overflow: hidden;
  border: 1px solid var(--demo-line);
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(26, 48, 35, 0.11);
}

.online-demo__conversation {
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(360px, 1fr) auto;
  background:
    radial-gradient(circle at 18% 0%, rgba(225, 241, 231, 0.7), transparent 30%),
    #fcfdfc;
}

.online-demo__toolbar,
.online-demo__inspector-header,
.online-demo__archive {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.online-demo__toolbar {
  min-height: 76px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--demo-line);
}

.online-demo__toolbar > div {
  min-width: 0;
}

.online-demo__toolbar p {
  margin: 5px 0 0;
  overflow: hidden;
  color: var(--demo-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-demo__status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.online-demo__status i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #98a29b;
}

.online-demo__status[data-tone='busy'] i {
  background: #2c8c5c;
  animation: online-demo-pulse 1.4s ease-in-out infinite;
}

.online-demo__status[data-tone='waiting'] i {
  background: #d68b24;
  box-shadow: 0 0 0 4px rgba(214, 139, 36, 0.13);
}

.online-demo__status[data-tone='done'] i {
  background: #176c45;
  box-shadow: 0 0 0 4px rgba(23, 108, 69, 0.12);
}

.online-demo__quiet-button,
.online-demo__archive button {
  border: 1px solid var(--demo-line);
  border-radius: 10px;
  background: #fff;
  color: var(--demo-ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}

.online-demo__quiet-button {
  padding: 8px 12px;
}

.online-demo__surface {
  min-height: 0;
  overflow: auto;
  padding: 28px 28px 18px;
  scrollbar-color: rgba(23, 34, 27, 0.18) transparent;
}

.online-demo__surface :deep(.agentdown-root) {
  max-width: 760px;
  margin: 0 auto;
}

.online-demo__surface :deep(.agentdown-approval-block) {
  border-color: rgba(214, 139, 36, 0.25);
  background: #fffdf8;
}

.online-demo__composer {
  padding: 16px 22px 20px;
  border-top: 1px solid var(--demo-line);
  background: rgba(255, 255, 255, 0.9);
}

.online-demo__composer label {
  display: block;
  margin-bottom: 8px;
  color: var(--demo-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.online-demo__composer > div {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.online-demo__composer textarea {
  min-width: 0;
  flex: 1;
  resize: none;
  border: 1px solid var(--demo-line);
  border-radius: 14px;
  padding: 12px 14px;
  outline: none;
  background: #fff;
  color: var(--demo-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.online-demo__composer textarea:focus {
  border-color: rgba(23, 108, 69, 0.48);
  box-shadow: 0 0 0 3px rgba(23, 108, 69, 0.09);
}

.online-demo__composer textarea:disabled {
  background: #f5f7f5;
  color: #88918b;
}

.online-demo__composer button {
  display: inline-flex;
  min-width: 132px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 14px;
  padding: 0 17px;
  background: var(--demo-ink);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.online-demo__composer button:disabled,
.online-demo__archive button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.online-demo__composer button svg {
  width: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.online-demo__composer small {
  display: block;
  margin-top: 8px;
  color: #89938c;
  font-size: 11px;
}

.online-demo__inspector {
  display: grid;
  min-width: 0;
  grid-template-rows: auto auto minmax(280px, 1fr) auto;
  border-left: 1px solid var(--demo-line);
  background: #17221b;
  color: #f5f7f5;
}

.online-demo__inspector-header {
  min-height: 76px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}

.online-demo__inspector-header > div,
.online-demo__archive > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.online-demo__inspector-header span,
.online-demo__archive span {
  color: #93a198;
  font-size: 10px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.online-demo__inspector-header strong,
.online-demo__archive strong {
  color: #f7faf8;
  font-size: 13px;
}

.online-demo__browser-badge {
  border: 1px solid rgba(143, 224, 178, 0.2);
  border-radius: 999px;
  padding: 5px 8px;
  background: rgba(65, 157, 103, 0.12);
  color: #9ed6b6 !important;
  font-size: 9px !important;
}

.online-demo__pipeline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.online-demo__pipeline span {
  border-radius: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.065);
  color: #c9d2cc;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
}

.online-demo__pipeline i {
  color: #657168;
  font-size: 10px;
  font-style: normal;
}

.online-demo__events {
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.online-demo__events-empty {
  display: flex;
  height: 100%;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #78857c;
  text-align: center;
}

.online-demo__events-empty svg {
  width: 28px;
  margin-bottom: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.4;
}

.online-demo__events-empty strong {
  color: #9ca8a0;
  font-size: 12px;
}

.online-demo__events-empty span {
  margin-top: 5px;
  font-size: 10px;
}

.online-demo__event {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 7px;
  border-radius: 9px;
  padding: 8px 7px;
}

.online-demo__event[data-latest='true'] {
  background: rgba(88, 184, 128, 0.1);
}

.online-demo__event > span {
  padding-top: 1px;
  color: #59665d;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
}

.online-demo__event div {
  min-width: 0;
}

.online-demo__event strong,
.online-demo__event code {
  display: block;
  overflow: hidden;
  font-family: "SFMono-Regular", Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-demo__event strong {
  color: #c8e3d2;
  font-size: 10px;
  font-weight: 600;
}

.online-demo__event code {
  margin-top: 3px;
  padding: 0;
  background: transparent;
  color: #7e8c82;
  font-size: 9px;
}

.online-demo__archive {
  gap: 12px;
  padding: 16px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(0, 0, 0, 0.1);
}

.online-demo__archive-actions {
  display: flex;
  flex-direction: row !important;
  gap: 6px !important;
}

.online-demo__archive button {
  border-color: rgba(255, 255, 255, 0.13);
  padding: 7px 9px;
  background: rgba(255, 255, 255, 0.06);
  color: #d6ded8;
  font-size: 10px;
}

.online-demo__archive .online-demo__archive-primary {
  border-color: #d9eadf;
  background: #eaf5ee;
  color: #17472e;
}

@keyframes online-demo-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(44, 140, 92, 0.28); }
  50% { box-shadow: 0 0 0 5px rgba(44, 140, 92, 0); }
}

@media (max-width: 960px) {
  .online-demo__hero-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .online-demo__shell {
    grid-template-columns: 1fr;
  }

  .online-demo__inspector {
    min-height: 460px;
    border-top: 1px solid var(--demo-line);
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .online-demo {
    width: min(100% - 24px, 1440px);
    padding: 32px 0 48px;
  }

  .online-demo__hero h1 {
    font-size: 36px;
  }

  .online-demo__hero p {
    font-size: 15px;
  }

  .online-demo__hero ul {
    width: 100%;
  }

  .online-demo__hero li {
    width: auto;
    flex: 1;
  }

  .online-demo__shell {
    border-radius: 20px;
  }

  .online-demo__conversation {
    grid-template-rows: auto minmax(430px, 1fr) auto;
  }

  .online-demo__toolbar,
  .online-demo__surface,
  .online-demo__composer {
    padding-right: 14px;
    padding-left: 14px;
  }

  .online-demo__composer > div {
    flex-direction: column;
  }

  .online-demo__composer button {
    min-height: 44px;
  }

  .online-demo__archive {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .online-demo__status[data-tone='busy'] i {
    animation: none;
  }
}
</style>
