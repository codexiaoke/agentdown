<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  MarkdownRenderer,
  createAguiRuntime,
  runFinished,
  runStarted,
  toolFinished,
  toolStarted,
  type AgentNodeState,
  type AguiComponentMap
} from '../../index';
import WeatherRunBoard from '../components/WeatherRunBoard.vue';

type WeatherSsePayload =
  | {
      event: 'RunContent';
      name: string;
    }
  | {
      event: 'ToolCall';
      name: string;
      id: string;
    }
  | {
      event: 'ToolCompleted';
      name: string;
      id: string;
      content: Record<string, unknown>;
    };

const RUN_ID = 'run:weather';
const TOOL_ID = 'tool-1';
const markdownFont = '400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif';
const runtime = createAguiRuntime();
const playing = ref(false);
const timers: number[] = [];
const runState = runtime.ref<AgentNodeState>(RUN_ID);

const aguiComponents: AguiComponentMap = {
  WeatherRunBoard: {
    component: WeatherRunBoard,
    minHeight: 120
  }
};

const demoPackets: WeatherSsePayload[] = [
  {
    event: 'RunContent',
    name: '我来为你查询天气'
  },
  {
    event: 'ToolCall',
    name: '查询天气',
    id: TOOL_ID
  },
  {
    event: 'ToolCompleted',
    name: '查询天气',
    id: TOOL_ID,
    content: {
      city: '北京',
      condition: '晴',
      tempC: 26,
      humidity: '42%'
    }
  }
];

const source = computed(() => {
  const content =
    typeof runState.value?.meta?.content === 'string' && runState.value.meta.content.trim()
      ? runState.value.meta.content
      : '';

  return [content, `:::vue-component WeatherRunBoard {"ref":"${RUN_ID}"}`]
    .filter(Boolean)
    .join('\n\n');
});

function clearTimers() {
  while (timers.length > 0) {
    const timerId = timers.pop();

    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
  }

  playing.value = false;
}

function resetDemo() {
  runtime.reset();

  runtime.emit(runStarted({
    nodeId: RUN_ID,
    title: '天气助手',
    message: ''
  }));
}

function applyPacket(payload: WeatherSsePayload) {
  switch (payload.event) {
    case 'RunContent':
      runtime.emit({
        type: 'run.content',
        nodeId: RUN_ID,
        kind: 'run',
        title: '天气助手',
        message: payload.name,
        meta: {
          content: payload.name
        }
      });
      break;

    case 'ToolCall':
      runtime.emit(toolStarted({
        nodeId: payload.id,
        parentId: RUN_ID,
        toolName: payload.name,
        title: payload.name,
        message: '查询中'
      }));
      break;

    case 'ToolCompleted':
      runtime.emit(toolFinished({
        nodeId: payload.id,
        parentId: RUN_ID,
        toolName: payload.name,
        title: payload.name,
        message: '查询完成',
        meta: {
          result: payload.content
        }
      }));
      break;
  }
}

function replayDemo() {
  clearTimers();
  resetDemo();
  playing.value = true;

  demoPackets.forEach((payload, index) => {
    const timerId = window.setTimeout(() => {
      applyPacket(payload);

      if (index === demoPackets.length - 1) {
        runtime.emit(runFinished({
          nodeId: RUN_ID,
          title: '天气助手',
          message: ''
        }));
        playing.value = false;
      }
    }, 650 * (index + 1));

    timers.push(timerId);
  });
}

onMounted(() => {
  replayDemo();
});

onBeforeUnmount(() => {
  clearTimers();
});
</script>

<template>
  <section class="demo-page">
    <MarkdownRenderer
      :source="source"
      :agui-runtime="runtime"
      :agui-components="aguiComponents"
      :font="markdownFont"
      :line-height="28"
    />

    <button
      type="button"
      class="demo-page__replay"
      @click="replayDemo"
    >
      {{ playing ? '播放中...' : '重播' }}
    </button>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 56px 24px 80px;
}

.demo-page :deep(.agentdown-block-list) {
  gap: 16px;
}

.demo-page__replay {
  margin-top: 20px;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e2e8f0;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }
}
</style>
