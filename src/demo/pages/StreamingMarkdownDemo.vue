<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { cmd, RunSurface } from '../../index';
import {
  markdownStreamingPreset,
  type MarkdownStreamingPacket
} from '../presets/markdownStreamingPreset';

const RUN_ID = 'run:streaming-markdown';
const STREAM_ID = 'stream:streaming-markdown';
const USER_GROUP_ID = 'turn:user:streaming-markdown';
const ASSISTANT_GROUP_ID = 'turn:assistant:streaming-markdown';
const playing = ref(false);
const timers: number[] = [];
const { runtime, bridge, surface } = markdownStreamingPreset.createSession();

function createTokenDeltas(text: string): MarkdownStreamingPacket[] {
  return Array.from(text).map((token) => ({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: token
  }));
}

const demoPackets: MarkdownStreamingPacket[] = [
  {
    event: 'RunStarted',
    runId: RUN_ID,
    title: 'Markdown 助手'
  },
  {
    event: 'ContentOpen',
    streamId: STREAM_ID,
    slot: 'main',
    groupId: ASSISTANT_GROUP_ID
  },
  ...createTokenDeltas('我先整理一份部署摘要。\n\n'),
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '```bash\n'
  },
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: 'pnpm install\npnpm build\n'
  },
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: 'pnpm preview\n```\n'
  },
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '\n| 步骤 | 说明 |\n'
  },
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '| --- | --- |\n'
  },
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '| install | 安装依赖 |\n| build | 打包项目 |\n'
  },
  ...createTokenDeltas('\n最后再检查环境变量是否齐全。'),
  {
    event: 'ContentClose',
    streamId: STREAM_ID
  },
  {
    event: 'RunCompleted',
    runId: RUN_ID
  }
];

function clearTimers() {
  while (timers.length > 0) {
    const timerId = timers.pop();

    if (timerId !== undefined) {
      globalThis.clearTimeout(timerId);
    }
  }

  playing.value = false;
}

function seedConversation() {
  runtime.apply(cmd.message.text({
    id: 'block:user:streaming-markdown',
    role: 'user',
    text: '给我一份部署说明，最好带上命令和步骤表格',
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

function resetDemo() {
  bridge.reset();
  seedConversation();
}

function replayDemo() {
  clearTimers();
  resetDemo();
  playing.value = true;
  let elapsed = 0;

  demoPackets.forEach((payload, index) => {
    const delay = payload.event === 'ContentDelta' && payload.text.length <= 1
      ? 90
      : 320;
    elapsed += delay;
    const timerId = globalThis.setTimeout(() => {
      bridge.push(payload);

      if (index === demoPackets.length - 1) {
        bridge.flush('demo-complete');
        playing.value = false;
      }
    }, elapsed);

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
    <header class="demo-page__header">
      <h1>流式 Markdown</h1>
      <p>代码块和表格不会先显示半截源码，只有结构完整后才会稳定渲染出来。</p>
    </header>

    <RunSurface
      :runtime="runtime"
      v-bind="surface"
    />

    <button
      v-if="!playing"
      type="button"
      class="demo-page__replay"
      @click="replayDemo"
    >
      重播
    </button>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 44px 24px 80px;
  min-height: 100%;
}

.demo-page__header {
  margin-bottom: 28px;
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

.demo-page__replay {
  margin-top: 24px;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e8eef7;
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
