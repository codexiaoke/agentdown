<script setup lang="ts">
import { computed, onMounted } from 'vue';
import {
  cmd,
  createMarkdownAssembler,
  RunSurface,
  RunSurfaceDraftOverlay,
  useAsyncIterableBridge
} from '../../index';
import {
  markdownStreamingPreset,
  type MarkdownStreamingPacket
} from '../presets/markdownStreamingPreset';

const RUN_ID = 'run:streaming-markdown';
const STREAM_ID = 'stream:streaming-markdown';
const USER_GROUP_ID = 'turn:user:streaming-markdown';
const ASSISTANT_GROUP_ID = 'turn:assistant:streaming-markdown';
const runtime = markdownStreamingPreset.createRuntime();
const surface = markdownStreamingPreset.getSurfaceOptions();

/**
 * 把一段文本拆成逐字符 delta，模拟 token 级流式输出。
 */
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

/**
 * 用定时器模拟 token 之间的流式间隔。
 */
function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * 预先插入一条用户消息，方便观察 assistant 的流式回复。
 */
function seedConversation() {
  runtime.apply(cmd.message.text({
    id: 'block:user:streaming-markdown',
    role: 'user',
    text: '给我一份部署说明，最好带上命令和步骤表格',
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

/**
 * 逐条产出本地 mock packet，模拟后端流式返回。
 */
async function* createDemoPacketStream(): AsyncIterable<MarkdownStreamingPacket> {
  for (const payload of demoPackets) {
    const delay = payload.event === 'ContentDelta' && payload.text.length <= 1
      ? 90
      : 320;

    await sleep(delay);
    yield payload;
  }
}

const {
  start,
  reset,
  consuming
} = useAsyncIterableBridge<MarkdownStreamingPacket>({
  runtime,
  protocol: markdownStreamingPreset.protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});

const playing = computed(() => consuming.value);

/**
 * 重置 demo，并重新消费一轮本地 markdown 流。
 */
async function replayDemo() {
  reset();
  seedConversation();
  await start(createDemoPacketStream());
}

onMounted(() => {
  replayDemo().catch(() => {
    // demo 页面里失败只需要安静结束，不需要打断整个界面。
  });
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

    <RunSurfaceDraftOverlay
      :runtime="runtime"
      title="流式草稿观察"
      :initially-open="true"
      :max-items="4"
    />

    <button
      v-if="!playing"
      type="button"
      class="demo-page__replay"
      @click="replayDemo().catch(() => {})"
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
