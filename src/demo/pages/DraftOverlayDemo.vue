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

const RUN_ID = 'run:draft-overlay';
const STREAM_ID = 'stream:draft-overlay';
const USER_GROUP_ID = 'turn:user:draft-overlay';
const ASSISTANT_GROUP_ID = 'turn:assistant:draft-overlay';
const runtime = markdownStreamingPreset.createRuntime();
const surface = markdownStreamingPreset.getSurfaceOptions();

/**
 * `DraftOverlayDemoStep` 描述单个流式包以及它到达前的等待时间。
 */
interface DraftOverlayDemoStep {
  /** 当前这条 packet 到达前要等待多久。 */
  delayMs: number;
  /** 当前要送进 runtime 的原始 packet。 */
  packet: MarkdownStreamingPacket;
}

/**
 * 为单个 packet 包一层播放节奏，方便构造草稿停顿点。
 */
function createStep(
  packet: MarkdownStreamingPacket,
  delayMs: number
): DraftOverlayDemoStep {
  return {
    delayMs,
    packet
  };
}

/**
 * 把一段文本拆成逐字符 delta，并给每个 token 设置相同节奏。
 */
function createTokenSteps(
  text: string,
  delayMs: number
): DraftOverlayDemoStep[] {
  return Array.from(text).map((token) =>
    createStep({
      event: 'ContentDelta',
      streamId: STREAM_ID,
      text: token
    }, delayMs)
  );
}

/**
 * 当前页面用来专门演示 draft overlay 的本地事件序列。
 *
 * 这里故意插入两段明显停顿：
 * - 代码块还没闭合时先停一会
 * - 表格只有表头、还没到分隔线时再停一会
 */
const demoSteps: DraftOverlayDemoStep[] = [
  createStep({
    event: 'RunStarted',
    runId: RUN_ID,
    title: 'Draft Overlay Demo'
  }, 120),
  createStep({
    event: 'ContentOpen',
    streamId: STREAM_ID,
    slot: 'main',
    groupId: ASSISTANT_GROUP_ID
  }, 180),
  ...createTokenSteps('我先整理一份草稿，先看看未闭合结构会怎么显示。\n\n', 45),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '```ts\n'
  }, 160),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: 'const plan = {\n  city: "北京",\n'
  }, 180),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '  action: "lookup_weather"\n'
  }, 1200),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '};\n```\n\n'
  }, 220),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '| 字段 | 值 |\n'
  }, 180),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '| --- | --- |\n'
  }, 1200),
  createStep({
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '| 城市 | 北京 |\n| 状态 | 已返回 |\n\n'
  }, 260),
  ...createTokenSteps('等结构闭合之后，正文和块级内容就会一起进入 stable。', 42),
  createStep({
    event: 'ContentClose',
    streamId: STREAM_ID
  }, 160),
  createStep({
    event: 'RunCompleted',
    runId: RUN_ID
  }, 140)
];

/**
 * 用定时器模拟包与包之间的自然流式间隔。
 */
function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * 预先塞入一条用户消息，方便观察 assistant 草稿的稳定化过程。
 */
function seedConversation() {
  runtime.apply(cmd.message.text({
    id: 'block:user:draft-overlay',
    role: 'user',
    text: '帮我演示一下草稿 block 是怎么逐步稳定的',
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

/**
 * 逐条产出本地 mock packet，模拟真实后端持续推流。
 */
async function* createDemoPacketStream(): AsyncIterable<MarkdownStreamingPacket> {
  for (const step of demoSteps) {
    await sleep(step.delayMs);
    yield step.packet;
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
 * 清空当前 runtime，并重新回放一轮本地草稿流。
 */
async function replayDemo() {
  reset();
  seedConversation();
  await start(createDemoPacketStream());
}

onMounted(() => {
  replayDemo().catch(() => {
    // demo 页面里失败只需要安静结束，不影响其余示例。
  });
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>Draft Overlay</h1>
      <p>这个页面只看 RunSurfaceDraftOverlay，代码块和表格在结构没闭合前会先保持 draft。</p>
    </header>

    <RunSurface
      :runtime="runtime"
      v-bind="surface"
    />

    <RunSurfaceDraftOverlay
      :runtime="runtime"
      title="Draft Overlay"
      :initially-open="true"
      :max-items="6"
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
