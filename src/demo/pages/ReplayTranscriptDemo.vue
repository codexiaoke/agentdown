<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  cmd,
  createRuntimeReplayPlayer,
  createRuntimeTranscript,
  RunSurface
} from '../../index';
import {
  protocolHelpersPreset,
  type ProtocolHelperPacket
} from '../presets/protocolHelpersPreset';

const RUN_ID = 'run:replay-transcript';
const USER_GROUP_ID = 'turn:user:replay-transcript';
const ASSISTANT_GROUP_ID = 'turn:assistant:replay-transcript';
const TOOL_ID = 'tool:replay-transcript:weather';
const ASSISTANT_BLOCK_ID = 'block:replay-transcript:assistant';
const ARTIFACT_BLOCK_ID = 'block:replay-transcript:artifact';
const APPROVAL_BLOCK_ID = 'block:replay-transcript:approval';

const { runtime: sourceRuntime, bridge: sourceBridge, surface } = protocolHelpersPreset.createSession();
const transcript = shallowRef(createRuntimeTranscript(sourceRuntime));
const replayPlayer = shallowRef(createRuntimeReplayPlayer(transcript.value.history));
const playing = ref(false);
const replayPosition = ref(0);
let playAbortController: AbortController | null = null;

const demoPackets: ProtocolHelperPacket[] = [
  {
    type: 'run.start',
    runId: RUN_ID,
    title: 'Replay Transcript 示例'
  },
  {
    type: 'content.replace',
    blockId: ASSISTANT_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    markdown: '我先整理一份北京天气摘要，并生成一个可复盘的 transcript。'
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
      '结果已经整理好了。',
      '',
      '- 北京天气晴',
      '- 当前 26°C',
      '- 湿度 42%'
    ].join('\n')
  },
  {
    type: 'artifact.upsert',
    blockId: ARTIFACT_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    title: '天气简报',
    artifactId: 'artifact:replay-weather-brief',
    artifactKind: 'report',
    label: 'weather-brief.md',
    message: '这份产物会一起进入 transcript。'
  },
  {
    type: 'approval.update',
    blockId: APPROVAL_BLOCK_ID,
    groupId: ASSISTANT_GROUP_ID,
    title: '是否发送',
    approvalId: 'approval:replay-send',
    status: 'approved',
    message: '已确认，可以直接发送。'
  },
  {
    type: 'run.finish',
    runId: RUN_ID
  }
];

const transcriptSummary = computed(() => ({
  messageCount: transcript.value.messages.length,
  historyCount: transcript.value.history.length,
  blockCount: transcript.value.snapshot.blocks.length,
  nodeCount: transcript.value.snapshot.nodes.length
}));

function syncReplayMeta() {
  replayPosition.value = replayPlayer.value.position();
}

function stopReplay() {
  playAbortController?.abort();
  playAbortController = null;
  playing.value = false;
}

function seedSourceConversation() {
  sourceRuntime.apply(cmd.message.text({
    id: 'block:user:replay-transcript',
    role: 'user',
    text: '帮我查一下北京天气，并且让我后面可以回放整个过程',
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

function rebuildTranscript() {
  transcript.value = createRuntimeTranscript(sourceRuntime);
  replayPlayer.value = createRuntimeReplayPlayer(transcript.value.history);
  syncReplayMeta();
}

function buildSourceRun() {
  sourceBridge.reset();
  seedSourceConversation();
  sourceBridge.push(demoPackets);
  sourceBridge.flush('replay-demo-seed');
  rebuildTranscript();
}

function resetReplay() {
  stopReplay();
  replayPlayer.value.reset();
  syncReplayMeta();
}

function stepReplay() {
  stopReplay();
  replayPlayer.value.step(1);
  syncReplayMeta();
}

async function playReplay() {
  stopReplay();
  playing.value = true;
  playAbortController = new AbortController();

  try {
    await replayPlayer.value.play({
      intervalMs: 380,
      signal: playAbortController.signal,
      onStep: () => {
        syncReplayMeta();
      }
    });
  } finally {
    playing.value = false;
    playAbortController = null;
    syncReplayMeta();
  }
}

onMounted(() => {
  buildSourceRun();
});

onBeforeUnmount(() => {
  stopReplay();
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>Replay / Transcript</h1>
      <p>先导出 transcript，再按 history 逐步回放到一个新的 runtime。</p>
    </header>

    <div class="demo-stats">
      <span>messages {{ transcriptSummary.messageCount }}</span>
      <span>history {{ transcriptSummary.historyCount }}</span>
      <span>blocks {{ transcriptSummary.blockCount }}</span>
      <span>nodes {{ transcriptSummary.nodeCount }}</span>
    </div>

    <section class="demo-section">
      <div class="demo-section__head">
        <h2>原始结果</h2>
        <p>这里是一次完整 run 结束后的最终状态。</p>
      </div>

      <RunSurface
        :runtime="sourceRuntime"
        v-bind="surface"
      />
    </section>

    <section class="demo-section">
      <div class="demo-section__head">
        <h2>回放结果</h2>
        <p>当前位置 {{ replayPosition }} / {{ replayPlayer.total() }}</p>
      </div>

      <div class="demo-controls">
        <button
          type="button"
          class="demo-button"
          @click="resetReplay"
        >
          重置
        </button>

        <button
          type="button"
          class="demo-button"
          @click="stepReplay"
        >
          单步
        </button>

        <button
          type="button"
          class="demo-button demo-button--primary"
          :disabled="playing"
          @click="playReplay"
        >
          {{ playing ? '回放中...' : '自动回放' }}
        </button>
      </div>

      <RunSurface
        :runtime="replayPlayer.runtime"
        v-bind="surface"
      />
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 44px 24px 80px;
  min-height: 100%;
}

.demo-page__header {
  margin-bottom: 24px;
}

.demo-page__header h1,
.demo-page__header p,
.demo-section__head h2,
.demo-section__head p {
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

.demo-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.demo-stats span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef2f7;
  color: #475569;
  font-size: 12px;
}

.demo-section + .demo-section {
  margin-top: 32px;
  padding-top: 28px;
  border-top: 1px solid #e2e8f0;
}

.demo-section__head {
  margin-bottom: 18px;
}

.demo-section__head h2 {
  font-size: 20px;
  letter-spacing: -0.04em;
}

.demo-section__head p {
  margin-top: 8px;
  color: #64748b;
  line-height: 1.8;
}

.demo-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.demo-button {
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e8eef7;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-button--primary {
  background: #dbeafe;
  color: #1d4ed8;
}

.demo-button:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-controls {
    flex-wrap: wrap;
  }
}
</style>
