<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { cmd, RunSurface } from '../../index';
import { fileUploadPreset, type FileUploadDemoPacket } from '../presets/fileUploadPreset';

const RUN_ID = 'run:file';
const TOOL_ID = 'tool:file-parse';
const STREAM_ID = 'stream:file:answer';
const USER_GROUP_ID = 'turn:user:file';
const ASSISTANT_GROUP_ID = 'turn:file:assistant';
const playing = ref(false);
const timers: number[] = [];
const { runtime, bridge, surface } = fileUploadPreset.createSession();

const demoPackets: FileUploadDemoPacket[] = [
  {
    event: 'RunStarted',
    runId: RUN_ID,
    title: '文件助手'
  },
  {
    event: 'ContentOpen',
    streamId: STREAM_ID,
    slot: 'main',
    groupId: ASSISTANT_GROUP_ID
  },
  {
    event: 'ContentDelta',
    streamId: STREAM_ID,
    text: '我先读取你上传的文件'
  },
  {
    event: 'ToolCall',
    id: TOOL_ID,
    name: '解析 PDF'
  },
  {
    event: 'ToolCompleted',
    id: TOOL_ID,
    name: '解析 PDF',
    content: {
      fileName: '北京行程单.pdf',
      pageCount: 4,
      highlights: [
        '文档包含 4 月 7 日到 4 月 9 日的差旅行程。',
        '首日安排了北京朝阳区的客户拜访。',
        '附件里包含酒店与返程高铁信息。'
      ]
    }
  },
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
  const now = Date.now();

  runtime.apply([
    cmd.message.text({
      id: 'block:user:file:text',
      role: 'user',
      text: '帮我看看这个 PDF 里讲了什么',
      groupId: USER_GROUP_ID,
      at: now
    }),
    cmd.message.artifact({
      id: 'block:user:file:artifact',
      role: 'user',
      groupId: USER_GROUP_ID,
      title: '用户上传文件',
      artifactKind: 'file',
      artifactId: 'file:beijing-trip-pdf',
      label: '北京行程单.pdf',
      message: '一个 PDF 文件，想让助手帮忙快速提炼重点。',
      href: 'https://example.com/beijing-trip.pdf',
      at: now + 1
    })
  ]);
}

function resetDemo() {
  bridge.reset();
  seedConversation();
}

function replayDemo() {
  clearTimers();
  resetDemo();
  playing.value = true;

  demoPackets.forEach((payload, index) => {
    const timerId = globalThis.setTimeout(() => {
      bridge.push(payload);

      if (index === demoPackets.length - 1) {
        bridge.flush('demo-complete');
        playing.value = false;
      }
    }, 700 * (index + 1));

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
      <h1>用户上传文件</h1>
      <p>用户消息可以不只是 text，也可以直接是文件 block，然后助手继续流式回复和工具解析。</p>
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
