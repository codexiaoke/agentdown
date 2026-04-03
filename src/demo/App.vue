<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DemoAgentNodeCard from './DemoAgentNodeCard.vue';
import DemoRunBoard from './DemoRunBoard.vue';
import runtimeOverviewUrl from './assets/runtime-overview.svg';
import {
  agentAssigned,
  agentBlocked,
  agentFinished,
  agentStarted,
  MarkdownRenderer,
  createAguiRuntime,
  parseMarkdown,
  runFinished,
  runStarted,
  teamFinished,
  toolFinished,
  toolStarted,
  userMessageCreated,
  type CoreAguiEvent,
  type AguiRuntimeReducer,
  type AgentNodeState
} from '../index';
import { formatDemoLabel } from './demoLabels';

interface ScheduledWorkflowEvent {
  delay: number;
  event: CoreAguiEvent;
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

Agentdown 是一个为智能体工作流设计的 markdown 运行时：正文继续走 pretext 布局，组件块则通过 \`{"ref":"..."}\` 绑定到同一个 AGUI 运行时。

## 为什么 pretext 仍然是核心骨架

pretext 会先完成文本测量和换行，再交给 Vue 去渲染，所以宽度变化、流式推进和长段落更新都能更稳。AGUI 不是脱离 markdown 的浮层，而是和正文共享同一个阅读节奏。

## 实时运行演示

下面这几张卡片不是一次性塞入最终数据，而是通过运行时事件持续推进。你可以暂停、继续、重播，组件会像读取普通 ref 一样拿到最新状态。

:::vue-component DemoRunBoard {"ref":"run:demo-1"}

### 协调者
:::vue-component DemoAgentNodeCard {"ref":"node:leader-1"}

### 研究智能体
:::vue-component DemoAgentNodeCard {"ref":"node:agent-1"}

### GTM 智能体
:::vue-component DemoAgentNodeCard {"ref":"node:agent-2"}

### 定价工具
:::vue-component DemoAgentNodeCard {"ref":"node:tool-1"}

:::thought
当协调者进入团队模式后，子智能体和工具会继续挂在同一个运行时上。组件并不需要重新解析 markdown，只要拿到 \`ref\` 对应的 binding，就可以随着事件流自然更新。
:::

## 运行时示例

\`\`\`ts
import { agentBlocked, createAguiRuntime } from 'agentdown';

const runtime = createAguiRuntime({
  reducer: ({ event }) => {
    if (event.type === 'agent.blocked') {
      return {
        patch: {
          status: 'waiting_tool',
          message: '等待下游工具返回结果。'
        }
      };
    }
  }
});

runtime.emit(agentBlocked({ nodeId: 'node:agent-1' }));
\`\`\`

## 复杂 Markdown 渲染

![Agentdown 运行态概览](${runtimeOverviewUrl} "多智能体运行态概览")

| 阶段 | 负责人 | 当前状态 | 输出物 | 风险级别 | 执行窗口 | 依赖工具 | 地区策略 | 定价区间 | 同步频率 | 客户类型 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 需求拆解 | 协调者 | 已完成 | 任务树 | 低 | T+0 | planner.split | 中国区优先 | 12k-16k | 实时 | 企业 | 先锁定高意向客户 |
| 历史研究 | 研究智能体 | 已完成 | 历史报价摘要 | 中 | T+1h | retrieval.search | 华东 | 11k-15k | 30 分钟 | SaaS | 同时回看折扣记录 |
| 竞品扫描 | 研究智能体 | 已完成 | 竞品矩阵 | 中 | T+2h | web.lookup | 华北 | 10k-14k | 1 小时 | 平台型 | 竞品最近在降价 |
| 线索清洗 | GTM 智能体 | 进行中 | ICP 清单 | 低 | T+3h | crm.segment | 全国 | 13k-18k | 15 分钟 | 新签 | 过滤掉低预算线索 |
| 销售话术 | GTM 智能体 | 进行中 | 销售脚本 | 中 | T+4h | copy.compose | 华南 | 14k-18k | 实时 | 增购 | 要强调回本周期 |
| 定价比对 | 定价工具 | 已完成 | 可比案例表 | 高 | T+5h | pricing.lookup | 东南亚 | 9k-13k | 实时 | 渠道 | 汇率波动需要单独备注 |
| 折扣模拟 | 定价工具 | 已完成 | 折扣模型 | 中 | T+6h | pricing.simulate | 中国港澳 | 11k-14k | 30 分钟 | 企业 | 年付折扣更有优势 |
| 审批准备 | 协调者 | 排队中 | 审批草案 | 中 | T+7h | approval.prepare | 全国 | 12k-17k | 2 小时 | 战略客户 | 需要财务共同确认 |
| 发布计划 | 协调者 | 排队中 | 发布时间线 | 低 | T+8h | launch.schedule | 海外 | 13k-16k | 1 天 | 存量客户 | 注意节假日窗口 |
| 复盘沉淀 | 系统 | 等待中 | 复盘文档 | 低 | T+9h | docs.archive | 全区域 | 12k-16k | 每周 | 全量 | 自动沉淀到知识库 |

| 单元格类型 | 示例内容 | 说明 |
| --- | --- | --- |
| 链接 | [GitHub 仓库](https://github.com/codexiaoke/agentdown) | 表格内链接可以直接点击，并默认新开窗口。 |
| 图片 | ![运行态缩略图](${runtimeOverviewUrl}) | 表格内图片会自动压成缩略尺寸，不会撑坏布局。 |

## Mermaid 图表示例

\`\`\`mermaid
flowchart LR
  User[用户请求] --> Leader[协调者]
  Leader --> Research[研究智能体]
  Leader --> GTM[GTM 智能体]
  Research --> Tool[定价工具]
  Tool --> Leader
  GTM --> Leader
  Leader --> Output[交付结果]
\`\`\`

> 当 markdown 遇到表格、图片、引用和列表时，Agentdown 会优先保留语义结构，再补上阅读体验。

- 复杂块优先保证稳定渲染。
- 内置 \`html\` renderer 会补齐表格、图片和外链的细节体验。
- 当表头很多或行数很多时，表格会自动出现滚动条。
- mermaid fence 会直接渲染成可视化图表。

## 这个示例说明了什么

1. markdown 文本可以继续按 token 流式出现。
2. AGUI 区块可以像 \`ref\` 一样订阅状态，而不是只接收静态 props。
3. 团队模式、工具调用、结束事件和自定义 reducer 都能落在同一条运行时里。
4. 默认代码块、思考块和 AGUI 外壳都可以替换成你自己的设计系统组件。
5. 表格、图片、引用和列表等复杂块会走增强型 html 渲染路径。`;

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
      trimmed.startsWith('![') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('>') ||
      /^(-{3,}|_{3,}|\*{3,})$/.test(trimmed) ||
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
  return formatDemoLabel(value);
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
    event: runStarted({
      nodeId: 'run:demo-1',
      title: '企业定价请求',
      message: '新的多智能体运行正在编排这次任务。'
    })
  },
  {
    delay: 440,
    event: userMessageCreated({
      nodeId: 'node:user-1',
      parentId: 'run:demo-1',
      title: '需求方',
      message: '请比较定价信号，并给出一份建议。'
    })
  },
  {
    delay: 540,
    event: agentStarted({
      nodeId: 'node:leader-1',
      parentId: 'run:demo-1',
      kind: 'leader',
      title: '协调者',
      message: '准备把任务拆成研究和 GTM 两条支线。'
    })
  },
  {
    delay: 360,
    event: agentAssigned({
      nodeId: 'node:agent-1',
      parentId: 'node:leader-1',
      title: '定价分析师',
      message: '先去研究历史定价信号。'
    })
  },
  {
    delay: 220,
    event: agentAssigned({
      nodeId: 'node:agent-2',
      parentId: 'node:leader-1',
      title: 'GTM 撰写者',
      message: '整理一份面向客户团队的投放总结。'
    })
  },
  {
    delay: 520,
    event: agentStarted({
      nodeId: 'node:agent-1',
      parentId: 'node:leader-1',
      title: '定价分析师',
      message: '正在扫描历史报价与成交波动。'
    })
  },
  {
    delay: 280,
    event: agentBlocked({
      nodeId: 'node:agent-1',
      parentId: 'node:leader-1',
      title: '定价分析师',
      message: '在最终归纳前，先等待 pricing.lookup 的结果。'
    })
  },
  {
    delay: 320,
    event: toolStarted({
      nodeId: 'node:tool-1',
      parentId: 'node:agent-1',
      title: '定价 API',
      toolName: 'pricing.lookup',
      message: '正在调用 pricing.lookup，并带上 12 个可比客户样本。'
    })
  },
  {
    delay: 940,
    event: toolFinished({
      nodeId: 'node:tool-1',
      title: '定价 API',
      toolName: 'pricing.lookup',
      message: '已取回 12 个可比成交案例，价格带波动约为 18%。'
    })
  },
  {
    delay: 420,
    event: agentFinished({
      nodeId: 'node:agent-1',
      title: '定价分析师',
      message: '定价区间已经收敛，可以并入总结果。'
    })
  },
  {
    delay: 420,
    event: agentStarted({
      nodeId: 'node:agent-2',
      parentId: 'node:leader-1',
      title: 'GTM 撰写者',
      message: '开始撰写最终上线叙事和风险备注。'
    })
  },
  {
    delay: 980,
    event: agentFinished({
      nodeId: 'node:agent-2',
      title: 'GTM 撰写者',
      message: 'GTM 总结已完成，可以交给协调者汇总。'
    })
  },
  {
    delay: 460,
    event: teamFinished({
      nodeId: 'node:leader-1',
      kind: 'leader',
      title: '协调者',
      message: '两条支线结果已经汇总成一份最终建议。'
    })
  },
  {
    delay: 360,
    event: runFinished({
      nodeId: 'run:demo-1',
      title: '企业定价请求',
      message: '运行已顺利完成，可以准备交付。'
    })
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
        message: event.message ?? '等待下游工具返回结果。',
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
    label: '运行引用',
    binding: aguiRuntime.binding<AgentNodeState>('run:demo-1')
  },
  {
    id: 'node:leader-1',
    label: '协调者引用',
    binding: aguiRuntime.binding<AgentNodeState>('node:leader-1')
  },
  {
    id: 'node:agent-1',
    label: '研究引用',
    binding: aguiRuntime.binding<AgentNodeState>('node:agent-1')
  },
  {
    id: 'node:agent-2',
    label: 'GTM 引用',
    binding: aguiRuntime.binding<AgentNodeState>('node:agent-2')
  },
  {
    id: 'node:tool-1',
    label: '工具引用',
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
    return '等待开始';
  }

  return bindingEntries[0].binding.stateRef.value?.status ?? 'idle';
});
const currentStatus = computed(() => {
  if (isPlaybackComplete.value) {
    return '已完成';
  }

  if (!isPlaying.value) {
    return '已暂停';
  }

  if (!isWorkflowReady.value) {
    return '正文流式中';
  }

  if (isTextComplete.value && !isWorkflowComplete.value) {
    return '运行时收尾中';
  }

  return '实时播放中';
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
      mermaid: 0,
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

  // workflow 等 AGUI 区块真正出现在流里之后再启动，视觉上会更自然。
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
        <p class="demo-label">开源 Vue 运行时</p>
        <h1>Agentdown</h1>
        <p class="demo-summary">
          一个面向智能体工作流的 markdown UI 运行时。正文继续交给 pretext 做稳定布局，AGUI 则通过
          运行时 ref 持续响应团队模式、工具调用和结束事件。
        </p>
        <p class="demo-note">
          这个 demo 会先流式输出 markdown，再在 AGUI 区块出现后启动工作流事件，所以文本和状态变化属于同一条叙事线。
        </p>
      </div>

      <div class="demo-hero-rail">
        <article class="demo-metric-card">
          <span>播放状态</span>
          <strong>{{ currentStatus }}</strong>
        </article>
        <article class="demo-metric-card">
          <span>正文流式</span>
          <strong>{{ streamProgress }}%</strong>
        </article>
        <article class="demo-metric-card">
          <span>运行时进度</span>
          <strong>{{ workflowProgress }}%</strong>
        </article>
        <article class="demo-metric-card">
          <span>运行状态</span>
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
          {{ isPlaying ? '暂停流式' : isPlaybackComplete ? '重播演示' : '继续流式' }}
        </button>
        <button
          type="button"
          class="demo-button"
          @click="resetPlayback"
        >
          重新开始
        </button>
        <button
          type="button"
          class="demo-button"
          @click="revealAll"
        >
          直接展开
        </button>
      </div>

      <label class="demo-control">
        <span>预览宽度</span>
        <input
          v-model.number="previewWidth"
          type="range"
          min="520"
          max="920"
        />
        <strong>{{ previewWidth }}px</strong>
      </label>

      <label class="demo-control">
        <span>流式延迟</span>
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
            <p class="demo-kicker">预览</p>
            <h2>Markdown + AGUI 输出</h2>
          </div>

          <div class="demo-badge-set">
            <span class="demo-badge">{{ blockStats.total }} 个区块</span>
            <span class="demo-badge demo-badge-soft">
              {{ blockStats.text }} 文本 / {{ blockStats.agui }} AGUI / {{ blockStats.mermaid }} 图表
            </span>
          </div>
        </div>

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
                thought-title="思考过程"
              />
            </div>
          </div>
      </section>

      <aside class="demo-side-stack">
        <section class="demo-card">
          <div class="demo-card-header">
            <div>
              <p class="demo-kicker">绑定</p>
              <h2>响应式 ref</h2>
            </div>
            <span class="demo-badge">{{ runtimeSummary.active }} 个活跃中</span>
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
                <p>{{ formatLabel(row.kind) }} · {{ row.childCount }} 个子节点</p>
              </div>
              <span class="demo-binding-status">{{ formatLabel(row.status) }}</span>
            </article>
          </div>
        </section>

        <section class="demo-card">
          <div class="demo-card-header">
            <div>
              <p class="demo-kicker">信号</p>
              <h2>运行时事件流</h2>
            </div>
            <span class="demo-badge">{{ runtimeSummary.events }} 条事件</span>
          </div>

          <div class="demo-event-list">
            <article
              v-for="event in latestEvents"
              :key="`${event.nodeId}-${event.type}-${event.at}`"
              class="demo-event-item"
            >
              <div>
                <code>{{ event.type }}</code>
                <p>{{ event.message ?? event.title ?? '状态已更新' }}</p>
              </div>
              <span>{{ event.nodeId }}</span>
            </article>

            <p
              v-if="latestEvents.length === 0"
              class="demo-empty"
            >
              等待首个 AGUI 区块出现在页面中。
            </p>
          </div>
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

.demo-renderer-surface :deep(.agentdown-root) {
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
