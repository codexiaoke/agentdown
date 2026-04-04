<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { cmd, RunSurface } from '../../index';
import {
  protocolHelpersPreset,
  type ProtocolHelperPacket
} from '../presets/protocolHelpersPreset';

const RUN_ID = 'run:protocol-helpers';
const USER_GROUP_ID = 'turn:user:protocol-helpers';
const ASSISTANT_GROUP_ID = 'turn:assistant:protocol-helpers';
const TOOL_ID = 'tool:protocol-helpers:weather';
const ASSISTANT_BLOCK_ID = 'block:protocol-helpers:assistant';
const ARTIFACT_BLOCK_ID = 'block:protocol-helpers:artifact';
const APPROVAL_BLOCK_ID = 'block:protocol-helpers:approval';

const playing = ref(false);
const timers: number[] = [];
const { runtime, bridge, surface } = protocolHelpersPreset.createSession();

// 这组数据模拟“后端已经定义好一套固定语义事件名”的场景。
const demoPackets: ProtocolHelperPacket[] = [
  {
    type: 'run.start',
    runId: RUN_ID,
    title: '高阶 Helper 示例'
  },
  {
    type: 'content.replace',
    blockId: ASSISTANT_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    markdown: '我来整理一下北京天气，并补一份可发送的摘要。'
  },
  {
    type: 'tool.start',
    toolId: TOOL_ID,
    title: '查询天气',
    groupId: ASSISTANT_GROUP_ID
  },
  {
    type: 'tool.finish',
    toolId: TOOL_ID,
    title: '查询天气',
    result: {
      city: '北京',
      condition: '晴',
      tempC: 26,
      humidity: '42%'
    }
  },
  {
    type: 'content.replace',
    blockId: ASSISTANT_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    markdown: [
      '我已经整理好了。',
      '',
      '- 北京当前晴，26°C',
      '- 湿度 42%',
      '- 体感偏舒适，适合外出'
    ].join('\n')
  },
  {
    type: 'artifact.upsert',
    blockId: ARTIFACT_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    title: '天气简报',
    artifactId: 'artifact:weather-brief',
    artifactKind: 'report',
    label: 'weather-brief.md',
    message: '这是一份可以直接发给用户的简短结果。'
  },
  {
    type: 'approval.update',
    blockId: APPROVAL_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    title: '是否发送给用户',
    approvalId: 'approval:send-weather-brief',
    status: 'pending',
    message: '确认语气后即可发送。'
  },
  {
    type: 'approval.update',
    blockId: APPROVAL_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    title: '是否发送给用户',
    approvalId: 'approval:send-weather-brief',
    status: 'approved',
    message: '已确认，可以发送。'
  },
  {
    type: 'run.finish',
    runId: RUN_ID
  }
];

/**
 * 清理当前 demo 里挂起的所有定时器。
 */
function clearTimers() {
  while (timers.length > 0) {
    const timerId = timers.pop();

    if (timerId !== undefined) {
      globalThis.clearTimeout(timerId);
    }
  }

  playing.value = false;
}

// 先种一条用户消息，让后面的 assistant/group block 更接近真实聊天场景。
/**
 * 预先插入一条用户消息，模拟真实对话上下文。
 */
function seedConversation() {
  runtime.apply(cmd.message.text({
    id: 'block:user:protocol-helpers',
    role: 'user',
    text: '帮我整理一下北京天气，并做成一条可以发给用户的摘要',
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

/**
 * 重置 runtime，并重新播种初始用户消息。
 */
function resetDemo() {
  bridge.reset();
  seedConversation();
}

// 逐条推送 packet，方便直观看到 helper protocol 如何驱动整个界面。
/**
 * 按时间顺序回放整组 helper packet。
 */
function replayDemo() {
  clearTimers();
  resetDemo();
  playing.value = true;

  demoPackets.forEach((payload, index) => {
    const timerId = globalThis.setTimeout(() => {
      bridge.push(payload);

      if (index === demoPackets.length - 1) {
        bridge.flush('helpers-demo-complete');
        playing.value = false;
      }
    }, 520 * (index + 1));

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
      <h1>协议高阶 Helper</h1>
      <p>演示一套全局 helper protocol factory，怎么把自定义事件名直接映射到 content.replace、tool.finish、artifact.upsert、approval.update。</p>
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
