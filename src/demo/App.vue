<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DemoAgentNodeCard from './DemoAgentNodeCard.vue';
import DemoRunBoard from './DemoRunBoard.vue';
import {
  MarkdownRenderer,
  createAguiRuntime,
  parseMarkdown,
  type AguiRuntimeEvent,
  type AguiRuntimeReducer,
  type AgentNodeState
} from '../index';

interface ScheduledWorkflowEvent {
  delay: number;
  event: AguiRuntimeEvent;
}

interface BindingPreviewRow {
  id: string;
  label: string;
  title: string;
  kind: string;
  status: string;
  childCount: number;
}

const demoFont = '500 15px "Avenir Next"';
const demoLineHeight = 28;

const fullMarkdown = `# Agentdown

Agentdown 是一个为 agent workflow 设计的 markdown runtime：正文继续走 pretext 布局，组件块则通过 \`{"ref":"..."}\` 绑定到同一个 AGUI runtime。

## Why pretext is still the backbone

pretext 会先完成文本测量和换行，再交给 Vue 去渲染，所以宽度变化、流式推进和长段落更新都能更稳。AGUI 不是脱离 markdown 的浮层，而是和正文共享同一个阅读节奏。

## Live run

下面这几张卡片不是一次性塞入最终数据，而是通过 runtime 事件持续推进。你可以暂停、继续、重播，组件会像读普通 ref 一样读取最新状态。

:::vue-component DemoRunBoard {"ref":"run:demo-1"}

### Coordinator
:::vue-component DemoAgentNodeCard {"ref":"node:leader-1"}

### Research agent
:::vue-component DemoAgentNodeCard {"ref":"node:agent-1"}

### GTM agent
:::vue-component DemoAgentNodeCard {"ref":"node:agent-2"}

### Pricing tool
:::vue-component DemoAgentNodeCard {"ref":"node:tool-1"}

:::thought
当 leader 进入 team mode 后，子 agent 和 tool 会继续挂在同一个 runtime 上。组件并不需要重新解析 markdown，只要拿到 \`ref\` 对应的 binding，就可以随着事件流自然更新。
:::

## Runtime sketch

\`\`\`ts
const runtime = createAguiRuntime({
  reducer: ({ event }) => {
    if (event.type === 'agent.blocked') {
      return {
        patch: {
          status: 'waiting_tool',
          message: 'Waiting for downstream tool output.'
        }
      };
    }
  }
});

runtime.emit({
  type: 'agent.blocked',
  nodeId: 'node:agent-1'
});
\`\`\`

## What this proves

1. markdown 文本可以继续按 token 流式出现。
2. AGUI block 可以像 \`ref\` 一样订阅状态，而不是只吃静态 props。
3. team mode、tool call、finish event 和自定义 reducer 都能落在同一条 runtime 里。`;

function tokenizeInlineText(line: string): string[] {
  const parts = line.match(
    /(\s+|`[^`]*`|\*\*[^*]+\*\*|[A-Za-z0-9@/_.:#-]+|[\u3400-\u9FFF]|[^\s])/gu
  );

  return parts ?? [line];
}

function tokenizeMarkdown(source: string): string[] {
  const tokens: string[] = [];
  const lines = source.split('\n');
  let inCodeFence = false;
  let inMathFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isFenceBoundary = trimmed.startsWith('```');
    const isMathBoundary = trimmed === '$$';
    const isStructuralLine =
      trimmed.startsWith('#') ||
      trimmed.startsWith(':::') ||
      trimmed.startsWith('>') ||
      /^\d+\.\s/.test(trimmed) ||
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ');

    // 结构行保持整块输出，避免 code fence 和 AGUI 指令被拆坏。
    if (isFenceBoundary || inCodeFence || isMathBoundary || inMathFence || isStructuralLine) {
      tokens.push(`${line}\n`);

      if (isFenceBoundary) {
        inCodeFence = !inCodeFence;
      }

      if (isMathBoundary) {
        inMathFence = !inMathFence;
      }

      continue;
    }

    if (trimmed === '') {
      tokens.push('\n');
      continue;
    }

    tokens.push(...tokenizeInlineText(line));
    tokens.push('\n');
  }

  return tokens;
}

function formatLabel(value: string): string {
  return value
    .replace(/[._:]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const streamTokens = tokenizeMarkdown(fullMarkdown);
const workflowStartMarker = ':::vue-component DemoRunBoard {"ref":"run:demo-1"}';
const workflowStartIndex = fullMarkdown.indexOf(workflowStartMarker);
const workflowStartTokenCount = tokenizeMarkdown(
  workflowStartIndex === -1 ? fullMarkdown : fullMarkdown.slice(0, workflowStartIndex + workflowStartMarker.length)
).length;

const workflowSequence: ScheduledWorkflowEvent[] = [
  {
    delay: 260,
    event: {
      type: 'run.started',
      nodeId: 'run:demo-1',
      title: 'Enterprise pricing request',
      message: 'A new multi-agent run is now orchestrating the request.'
    }
  },
  {
    delay: 440,
    event: {
      type: 'user.message.created',
      nodeId: 'node:user-1',
      parentId: 'run:demo-1',
      title: 'Requester',
      message: 'Compare pricing signals and ship a recommendation.'
    }
  },
  {
    delay: 540,
    event: {
      type: 'agent.started',
      nodeId: 'node:leader-1',
      parentId: 'run:demo-1',
      kind: 'leader',
      title: 'Coordinator',
      message: 'Splitting the task into research and GTM tracks.'
    }
  },
  {
    delay: 360,
    event: {
      type: 'agent.assigned',
      nodeId: 'node:agent-1',
      parentId: 'node:leader-1',
      title: 'Pricing analyst',
      message: 'Research historical pricing signals.'
    }
  },
  {
    delay: 220,
    event: {
      type: 'agent.assigned',
      nodeId: 'node:agent-2',
      parentId: 'node:leader-1',
      title: 'GTM writer',
      message: 'Draft the rollout summary for the customer team.'
    }
  },
  {
    delay: 520,
    event: {
      type: 'agent.started',
      nodeId: 'node:agent-1',
      parentId: 'node:leader-1',
      title: 'Pricing analyst',
      message: 'Scanning prior quotes and deal variance.'
    }
  },
  {
    delay: 280,
    event: {
      type: 'agent.blocked',
      nodeId: 'node:agent-1',
      parentId: 'node:leader-1',
      title: 'Pricing analyst',
      message: 'Waiting for pricing.lookup before final synthesis.'
    }
  },
  {
    delay: 320,
    event: {
      type: 'tool.started',
      nodeId: 'node:tool-1',
      parentId: 'node:agent-1',
      title: 'Pricing API',
      toolName: 'pricing.lookup',
      message: 'Calling pricing.lookup with 12 comparable accounts.'
    }
  },
  {
    delay: 940,
    event: {
      type: 'tool.finished',
      nodeId: 'node:tool-1',
      title: 'Pricing API',
      toolName: 'pricing.lookup',
      message: 'Fetched 12 comparable deals with an 18% spread.'
    }
  },
  {
    delay: 420,
    event: {
      type: 'agent.finished',
      nodeId: 'node:agent-1',
      title: 'Pricing analyst',
      message: 'Pricing band narrowed and ready to merge.'
    }
  },
  {
    delay: 420,
    event: {
      type: 'agent.started',
      nodeId: 'node:agent-2',
      parentId: 'node:leader-1',
      title: 'GTM writer',
      message: 'Writing the final launch narrative and risk notes.'
    }
  },
  {
    delay: 980,
    event: {
      type: 'agent.finished',
      nodeId: 'node:agent-2',
      title: 'GTM writer',
      message: 'GTM summary is complete and ready for synthesis.'
    }
  },
  {
    delay: 460,
    event: {
      type: 'team.finished',
      nodeId: 'node:leader-1',
      kind: 'leader',
      title: 'Coordinator',
      message: 'Both tracks are merged into one final recommendation.'
    }
  },
  {
    delay: 360,
    event: {
      type: 'run.finished',
      nodeId: 'run:demo-1',
      title: 'Enterprise pricing request',
      message: 'Run completed successfully and is ready to hand off.'
    }
  }
];

const customAguiReducer: AguiRuntimeReducer = ({ event, previousState }) => {
  if (event.type === 'agent.blocked') {
    return {
      patch: {
        kind: previousState?.kind ?? event.kind ?? 'agent',
        status: 'waiting_tool',
        title: event.title ?? previousState?.title ?? event.nodeId,
        parentId: event.parentId ?? previousState?.parentId,
        message: event.message ?? 'Waiting for downstream tool output.',
        meta: {
          tone: 'warning'
        }
      }
    };
  }

  return null;
};

const aguiRuntime = createAguiRuntime({
  reducer: customAguiReducer
});
const runtimeEvents = aguiRuntime.events();
const previewWidth = ref(760);
const playbackDelay = ref(34);
const visibleTokenCount = ref(0);
const workflowEventIndex = ref(0);
const isPlaying = ref(true);

const aguiComponents = {
  DemoRunBoard: {
    component: DemoRunBoard,
    minHeight: 224
  },
  DemoAgentNodeCard: {
    component: DemoAgentNodeCard,
    minHeight: 170
  }
};

const bindingEntries = [
  {
    id: 'run:demo-1',
    label: 'Run ref',
    binding: aguiRuntime.binding<AgentNodeState>('run:demo-1')
  },
  {
    id: 'node:leader-1',
    label: 'Leader ref',
    binding: aguiRuntime.binding<AgentNodeState>('node:leader-1')
  },
  {
    id: 'node:agent-1',
    label: 'Research ref',
    binding: aguiRuntime.binding<AgentNodeState>('node:agent-1')
  },
  {
    id: 'node:agent-2',
    label: 'GTM ref',
    binding: aguiRuntime.binding<AgentNodeState>('node:agent-2')
  },
  {
    id: 'node:tool-1',
    label: 'Tool ref',
    binding: aguiRuntime.binding<AgentNodeState>('node:tool-1')
  }
] as const;

const streamedSource = computed(() => streamTokens.slice(0, visibleTokenCount.value).join(''));
const parsedBlocks = computed(() =>
  parseMarkdown(streamedSource.value, {
    aguiComponents
  })
);
const isTextComplete = computed(() => visibleTokenCount.value >= streamTokens.length);
const isWorkflowReady = computed(() => visibleTokenCount.value >= workflowStartTokenCount);
const isWorkflowComplete = computed(() => workflowEventIndex.value >= workflowSequence.length);
const isPlaybackComplete = computed(() => isTextComplete.value && isWorkflowComplete.value);
const streamProgress = computed(() => Math.round((visibleTokenCount.value / streamTokens.length) * 100));
const workflowProgress = computed(() => Math.round((workflowEventIndex.value / workflowSequence.length) * 100));
const currentRunStatus = computed(() => {
  if (!isWorkflowReady.value) {
    return 'queued';
  }

  return bindingEntries[0].binding.stateRef.value?.status ?? 'idle';
});
const currentStatus = computed(() => {
  if (isPlaybackComplete.value) {
    return 'Complete';
  }

  if (!isPlaying.value) {
    return 'Paused';
  }

  if (!isWorkflowReady.value) {
    return 'Streaming intro';
  }

  if (isTextComplete.value && !isWorkflowComplete.value) {
    return 'Runtime finishing';
  }

  return 'Live streaming';
});
const blockStats = computed(() =>
  parsedBlocks.value.reduce(
    (stats, block) => {
      stats.total += 1;
      stats[block.kind] += 1;
      return stats;
    },
    {
      total: 0,
      text: 0,
      html: 0,
      code: 0,
      thought: 0,
      math: 0,
      agui: 0
    }
  )
);
const runtimeSummary = computed(() => {
  const active = bindingEntries.filter(({ binding }) => {
    const status = binding.stateRef.value?.status;
    return status === 'running' || status === 'thinking' || status === 'assigned' || status === 'waiting_tool';
  }).length;
  const done = bindingEntries.filter(({ binding }) => binding.stateRef.value?.status === 'done').length;

  return {
    active,
    done,
    events: runtimeEvents.value.length
  };
});
const bindingRows = computed<BindingPreviewRow[]>(() =>
  bindingEntries.map(({ id, label, binding }) => {
    const state = binding.stateRef.value;

    return {
      id,
      label,
      title: state?.title ?? id,
      kind: state?.kind ?? 'pending',
      status: state?.status ?? 'idle',
      childCount: state?.childrenIds.length ?? 0
    };
  })
);
const latestEvents = computed(() => runtimeEvents.value.slice(-7).reverse());

let playbackTimer: ReturnType<typeof window.setTimeout> | null = null;
let workflowTimer: ReturnType<typeof window.setTimeout> | null = null;

function stopPlayback() {
  if (playbackTimer !== null) {
    window.clearTimeout(playbackTimer);
    playbackTimer = null;
  }
}

function stopWorkflow() {
  if (workflowTimer !== null) {
    window.clearTimeout(workflowTimer);
    workflowTimer = null;
  }
}

function finishPlaybackIfComplete() {
  if (isPlaybackComplete.value) {
    isPlaying.value = false;
  }
}

function getPlaybackDelay(token: string): number {
  if (token === '\n') {
    return playbackDelay.value * 2.1;
  }

  if (/[。！？.!?]/u.test(token)) {
    return playbackDelay.value * 1.85;
  }

  if (/[，、,:;]/u.test(token)) {
    return playbackDelay.value * 1.35;
  }

  return playbackDelay.value;
}

function scheduleNextToken() {
  stopPlayback();

  if (!isPlaying.value || isTextComplete.value) {
    finishPlaybackIfComplete();
    return;
  }

  const nextToken = streamTokens[visibleTokenCount.value] ?? '';

  playbackTimer = window.setTimeout(() => {
    visibleTokenCount.value += 1;
    scheduleNextToken();
  }, getPlaybackDelay(nextToken));
}

function scheduleNextWorkflowEvent() {
  stopWorkflow();

  // workflow 等 AGUI block 真正出现在流里之后再启动，视觉上会更自然。
  if (!isPlaying.value || !isWorkflowReady.value || isWorkflowComplete.value) {
    finishPlaybackIfComplete();
    return;
  }

  const nextStep = workflowSequence[workflowEventIndex.value];

  if (!nextStep) {
    finishPlaybackIfComplete();
    return;
  }

  workflowTimer = window.setTimeout(() => {
    aguiRuntime.emit(nextStep.event);
    workflowEventIndex.value += 1;
    scheduleNextWorkflowEvent();
  }, nextStep.delay);
}

function syncSchedulers() {
  if (!isPlaying.value) {
    stopPlayback();
    stopWorkflow();
    return;
  }

  scheduleNextToken();
  scheduleNextWorkflowEvent();
}

function resetRuntimeState() {
  aguiRuntime.reset();
  workflowEventIndex.value = 0;
}

function togglePlayback() {
  if (isPlaybackComplete.value) {
    resetPlayback();
    return;
  }

  isPlaying.value = !isPlaying.value;
}

function resetPlayback() {
  stopPlayback();
  stopWorkflow();
  visibleTokenCount.value = 0;
  resetRuntimeState();

  const shouldRestartImmediately = isPlaying.value;
  isPlaying.value = true;

  if (shouldRestartImmediately) {
    syncSchedulers();
  }
}

function completeWorkflow() {
  stopWorkflow();

  for (let index = workflowEventIndex.value; index < workflowSequence.length; index += 1) {
    const step = workflowSequence[index];

    if (step) {
      aguiRuntime.emit(step.event);
    }
  }

  workflowEventIndex.value = workflowSequence.length;
}

function revealAll() {
  stopPlayback();
  visibleTokenCount.value = streamTokens.length;
  completeWorkflow();
  isPlaying.value = false;
}

watch(isPlaying, syncSchedulers);
watch(playbackDelay, () => {
  if (isPlaying.value && !isTextComplete.value) {
    scheduleNextToken();
  }
});
watch(visibleTokenCount, (count, previousCount) => {
  if (count >= workflowStartTokenCount && previousCount < workflowStartTokenCount && isPlaying.value) {
    scheduleNextWorkflowEvent();
  }

  finishPlaybackIfComplete();
});
watch(workflowEventIndex, finishPlaybackIfComplete);

onMounted(syncSchedulers);

onBeforeUnmount(() => {
  stopPlayback();
  stopWorkflow();
});
</script>

<template>
  <main class="demo-shell">
    <section class="demo-hero">
      <div class="demo-hero-copy">
        <p class="demo-label">Open Source Vue Runtime</p>
        <h1>Agentdown</h1>
        <p class="demo-summary">
          一个面向 agent workflow 的 markdown UI runtime。正文继续交给 pretext 做稳定布局，AGUI 则通过
          runtime ref 持续响应 team mode、tool calls 和 finish events。
        </p>
        <p class="demo-note">
          这个 demo 会先流式吐出 markdown，再在 AGUI block 出现后启动 workflow 事件，所以文本和状态变化是同一条叙事线。
        </p>
      </div>

      <div class="demo-hero-rail">
        <article class="demo-metric-card">
          <span>Playback</span>
          <strong>{{ currentStatus }}</strong>
        </article>
        <article class="demo-metric-card">
          <span>Text stream</span>
          <strong>{{ streamProgress }}%</strong>
        </article>
        <article class="demo-metric-card">
          <span>Runtime</span>
          <strong>{{ workflowProgress }}%</strong>
        </article>
        <article class="demo-metric-card">
          <span>Run state</span>
          <strong>{{ formatLabel(currentRunStatus) }}</strong>
        </article>
      </div>
    </section>

    <section class="demo-toolbar">
      <div class="demo-toolbar-group">
        <button
          type="button"
          class="demo-button demo-button-primary"
          @click="togglePlayback"
        >
          {{ isPlaying ? 'Pause stream' : isPlaybackComplete ? 'Replay demo' : 'Resume stream' }}
        </button>
        <button
          type="button"
          class="demo-button"
          @click="resetPlayback"
        >
          Restart
        </button>
        <button
          type="button"
          class="demo-button"
          @click="revealAll"
        >
          Reveal all
        </button>
      </div>

      <label class="demo-control">
        <span>Preview width</span>
        <input
          v-model.number="previewWidth"
          type="range"
          min="520"
          max="920"
        />
        <strong>{{ previewWidth }}px</strong>
      </label>

      <label class="demo-control">
        <span>Token delay</span>
        <input
          v-model.number="playbackDelay"
          type="range"
          min="18"
          max="90"
        />
        <strong>{{ playbackDelay }}ms</strong>
      </label>
    </section>

    <section class="demo-grid">
      <section class="demo-card demo-preview-card">
        <div class="demo-card-header">
          <div>
            <p class="demo-kicker">Preview</p>
            <h2>Markdown + AGUI output</h2>
          </div>

          <div class="demo-badge-set">
            <span class="demo-badge">{{ blockStats.total }} blocks</span>
            <span class="demo-badge demo-badge-soft">{{ blockStats.text }} text / {{ blockStats.agui }} agui</span>
          </div>
        </div>

        <div class="demo-preview-frame">
          <div
            class="demo-preview-stage"
            :style="{ width: `${previewWidth}px`, maxWidth: '100%' }"
          >
            <div class="demo-renderer-surface">
              <MarkdownRenderer
                :source="streamedSource"
                :agui-components="aguiComponents"
                :agui-runtime="aguiRuntime"
                :line-height="demoLineHeight"
                :font="demoFont"
              />
            </div>
          </div>
        </div>
      </section>

      <aside class="demo-side-stack">
        <section class="demo-card">
          <div class="demo-card-header">
            <div>
              <p class="demo-kicker">Bindings</p>
              <h2>Reactive refs</h2>
            </div>
            <span class="demo-badge">{{ runtimeSummary.active }} active</span>
          </div>

          <div class="demo-binding-list">
            <article
              v-for="row in bindingRows"
              :key="row.id"
              class="demo-binding-row"
              :data-status="row.status"
            >
              <div class="demo-binding-copy">
                <span class="demo-binding-label">{{ row.label }}</span>
                <strong>{{ row.title }}</strong>
                <p>{{ formatLabel(row.kind) }} · {{ row.childCount }} children</p>
              </div>
              <span class="demo-binding-status">{{ formatLabel(row.status) }}</span>
            </article>
          </div>
        </section>

        <section class="demo-card">
          <div class="demo-card-header">
            <div>
              <p class="demo-kicker">Signals</p>
              <h2>Runtime event flow</h2>
            </div>
            <span class="demo-badge">{{ runtimeSummary.events }} events</span>
          </div>

          <div class="demo-event-list">
            <article
              v-for="event in latestEvents"
              :key="`${event.nodeId}-${event.type}-${event.at}`"
              class="demo-event-item"
            >
              <div>
                <code>{{ event.type }}</code>
                <p>{{ event.message ?? event.title ?? 'State updated' }}</p>
              </div>
              <span>{{ event.nodeId }}</span>
            </article>

            <p
              v-if="latestEvents.length === 0"
              class="demo-empty"
            >
              Waiting for the first AGUI block to become visible.
            </p>
          </div>
        </section>

        <section class="demo-card">
          <div class="demo-card-header">
            <div>
              <p class="demo-kicker">Source</p>
              <h2>Live markdown feed</h2>
            </div>
            <span class="demo-badge demo-badge-soft">{{ streamedSource.length }} chars</span>
          </div>

          <pre class="demo-source"><code>{{ streamedSource }}</code></pre>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.demo-shell {
  min-height: 100vh;
  padding: 32px 20px 48px;
  background:
    radial-gradient(circle at top left, rgba(210, 229, 233, 0.55), transparent 34%),
    linear-gradient(180deg, #fafaf9 0%, #f4f4f3 100%);
  color: #111827;
  font-family:
    "Avenir Next",
    "SF Pro Display",
    "PingFang SC",
    "Hiragino Sans GB",
    sans-serif;
}

.demo-hero,
.demo-toolbar,
.demo-grid {
  width: min(1280px, 100%);
  margin: 0 auto;
}

.demo-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 24px;
  align-items: start;
  margin-bottom: 20px;
}

.demo-label,
.demo-kicker,
.demo-binding-label {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.demo-hero h1 {
  margin: 10px 0 0;
  font-size: clamp(3rem, 5vw, 5rem);
  line-height: 0.94;
  letter-spacing: -0.06em;
}

.demo-summary {
  width: min(760px, 100%);
  margin: 18px 0 0;
  color: #374151;
  font-size: 17px;
  line-height: 1.9;
}

.demo-note {
  width: min(700px, 100%);
  margin: 16px 0 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.8;
}

.demo-hero-rail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.demo-card,
.demo-toolbar,
.demo-metric-card {
  border: 1px solid rgba(229, 231, 235, 0.88);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(16px);
}

.demo-metric-card {
  padding: 16px 18px;
}

.demo-metric-card span,
.demo-control span {
  display: block;
  color: #6b7280;
  font-size: 12px;
}

.demo-metric-card strong {
  display: block;
  margin-top: 8px;
  font-size: 20px;
  letter-spacing: -0.03em;
}

.demo-toolbar {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) minmax(220px, 1fr);
  gap: 18px;
  align-items: center;
  padding: 16px 18px;
  margin-bottom: 20px;
}

.demo-toolbar-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.demo-button {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  color: #111827;
  padding: 10px 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
}

.demo-button:hover {
  transform: translateY(-1px);
  border-color: #9ca3af;
}

.demo-button-primary {
  background: #111827;
  border-color: #111827;
  color: #fff;
}

.demo-control {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  color: #4b5563;
  font-size: 14px;
}

.demo-control input {
  width: 100%;
}

.demo-control strong {
  color: #111827;
  font-size: 13px;
}

.demo-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.62fr) minmax(320px, 0.92fr);
  gap: 20px;
  align-items: start;
}

.demo-side-stack {
  display: grid;
  gap: 20px;
}

.demo-card {
  padding: 20px;
}

.demo-card-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.demo-card-header h2 {
  margin: 8px 0 0;
  font-size: 20px;
  letter-spacing: -0.04em;
}

.demo-badge-set {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.demo-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 7px 11px;
  background: #eef2f7;
  color: #111827;
  font-size: 12px;
  font-weight: 700;
}

.demo-badge-soft {
  background: #f6f7f8;
  color: #4b5563;
}

.demo-preview-card {
  padding-bottom: 24px;
}

.demo-preview-frame {
  padding: 18px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(249, 250, 251, 0.95), rgba(243, 244, 246, 0.95));
  border: 1px solid #eceff2;
}

.demo-preview-stage {
  margin: 0 auto;
}

.demo-renderer-surface {
  min-height: 640px;
  padding: 28px;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.demo-renderer-surface :deep(.vpm-root) {
  font-family:
    "Avenir Next",
    "SF Pro Text",
    "PingFang SC",
    sans-serif;
}

.demo-binding-list,
.demo-event-list {
  display: grid;
  gap: 12px;
}

.demo-binding-row,
.demo-event-item {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 15px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.demo-binding-copy strong {
  display: block;
  margin-top: 6px;
  font-size: 15px;
  letter-spacing: -0.02em;
}

.demo-binding-copy p,
.demo-event-item p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.demo-binding-status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 7px 10px;
  background: #f3f4f6;
  color: #111827;
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.demo-binding-row[data-status='running'] .demo-binding-status,
.demo-binding-row[data-status='thinking'] .demo-binding-status {
  background: #dbeafe;
  color: #1d4ed8;
}

.demo-binding-row[data-status='assigned'] .demo-binding-status {
  background: #fef3c7;
  color: #92400e;
}

.demo-binding-row[data-status='waiting_tool'] .demo-binding-status {
  background: #ffedd5;
  color: #c2410c;
}

.demo-binding-row[data-status='done'] .demo-binding-status {
  background: #dcfce7;
  color: #166534;
}

.demo-event-item code {
  color: #111827;
  font-size: 12px;
  font-weight: 700;
}

.demo-event-item span {
  color: #6b7280;
  font-size: 12px;
  word-break: break-all;
}

.demo-empty {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.7;
}

.demo-source {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  border-radius: 18px;
  background: #111827;
  color: #e5eef7;
}

.demo-source code {
  display: block;
  padding: 16px;
  font-family:
    "SFMono-Regular",
    "JetBrains Mono",
    "Fira Code",
    monospace;
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1080px) {
  .demo-hero,
  .demo-grid,
  .demo-toolbar {
    grid-template-columns: 1fr;
  }

  .demo-hero-rail {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .demo-shell {
    padding-inline: 14px;
  }

  .demo-hero-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-card-header,
  .demo-binding-row,
  .demo-event-item {
    flex-direction: column;
  }

  .demo-toolbar {
    padding: 14px;
  }

  .demo-control {
    grid-template-columns: 1fr;
  }

  .demo-renderer-surface {
    min-height: 520px;
    padding: 22px 18px;
  }
}
</style>
