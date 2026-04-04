<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  cmd,
  RunSurface,
  useAgentSession
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

const session = useAgentSession(protocolHelpersPreset);
const {
  runtime: sourceRuntime,
  surface,
  activeTranscript: transcript,
  importedTranscript,
  activeTranscriptSource,
  replay,
  useExportedTranscript: loadExportedTranscript,
  useImportedTranscript: loadImportedTranscript,
  importTranscript,
  downloadTranscript
} = session;
const importError = ref('');

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

const activeTranscriptLabel = computed(() =>
  activeTranscriptSource.value === 'imported'
    ? '已导入 transcript'
    : activeTranscriptSource.value === 'custom'
      ? '自定义 transcript'
      : '当前导出 transcript'
);
const hasImportedTranscript = computed(() => importedTranscript.value !== null);
const replayPosition = computed(() => replay.position.value);
const replayTotal = computed(() => replay.total.value);
const replayRuntime = computed(() => replay.runtime.value);
const replayIsPlaying = computed(() => replay.playing.value);

const transcriptSummary = computed(() => ({
  messageCount: transcript.value.messages.length,
  historyCount: transcript.value.history.length,
  blockCount: transcript.value.snapshot.blocks.length,
  nodeCount: transcript.value.snapshot.nodes.length,
  toolCount: transcript.value.tools.length,
  artifactCount: transcript.value.artifacts.length,
  approvalCount: transcript.value.approvals.length
}));

const transcriptPreview = computed(() => {
  return JSON.stringify(
    {
      messages: transcript.value.messages.map((message) => ({
        id: message.id,
        role: message.role,
        blockKinds: message.blockKinds,
        text: message.text
      })),
      tools: transcript.value.tools,
      artifacts: transcript.value.artifacts,
      approvals: transcript.value.approvals
    },
    null,
    2
  );
});

/**
 * 在原始 runtime 中预先插入一条用户消息。
 */
function seedSourceConversation() {
  sourceRuntime.apply(cmd.message.text({
    id: 'block:user:replay-transcript',
    role: 'user',
    text: '帮我查一下北京天气，并且让我后面可以回放整个过程',
    groupId: USER_GROUP_ID,
    at: Date.now()
  }));
}

/**
 * 构造一段完整的源会话，并同步导出 transcript。
 */
function buildSourceRun() {
  session.reset();
  seedSourceConversation();
  session.push(demoPackets);
  session.flush('replay-demo-seed');
  loadExportedTranscript();
}

/**
 * 切换到当前 runtime 实时导出的 transcript。
 */
function useExportedTranscript() {
  importError.value = '';
  loadExportedTranscript();
}

/**
 * 切换到最近一次导入的 transcript。
 */
function useImportedTranscript() {
  importError.value = '';
  loadImportedTranscript();
}

/**
 * 把 replay player 重置回起点。
 */
function resetReplay() {
  replay.reset();
}

/**
 * 单步推进一次 replay。
 */
function stepReplay() {
  replay.step(1);
}

/**
 * 以固定节奏自动播放整个 replay。
 */
async function playReplay() {
  await replay.play({
    intervalMs: 380
  });
}

/**
 * 下载当前激活的 transcript JSON。
 */
function handleDownloadTranscript() {
  downloadTranscript();
}

/**
 * 从本地文件中导入 transcript。
 */
async function importTranscriptFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  importError.value = '';

  try {
    importTranscript(await file.text());
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Transcript 导入失败。';
  } finally {
    input.value = '';
  }
}

onMounted(() => {
  buildSourceRun();
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
      <span>tools {{ transcriptSummary.toolCount }}</span>
      <span>artifacts {{ transcriptSummary.artifactCount }}</span>
      <span>approvals {{ transcriptSummary.approvalCount }}</span>
    </div>

    <section class="demo-section">
      <div class="demo-section__head">
        <h2>Transcript 摘要</h2>
        <p>除了 messages，现在也会直接导出 tools / artifacts / approvals，也可以直接下载、导入并切换回放源。</p>
      </div>

      <div class="demo-controls demo-controls--wrap">
        <button
          type="button"
          class="demo-button"
          @click="handleDownloadTranscript"
        >
          下载当前 transcript
        </button>

        <label class="demo-button demo-button--file">
          导入 transcript
          <input
            type="file"
            accept=".json,application/json"
            @change="importTranscriptFile"
          >
        </label>

        <button
          type="button"
          class="demo-button"
          :class="{ 'demo-button--active': activeTranscriptSource === 'exported' }"
          @click="useExportedTranscript"
        >
          当前导出
        </button>

        <button
          type="button"
          class="demo-button"
          :class="{ 'demo-button--active': activeTranscriptSource === 'imported' }"
          :disabled="!hasImportedTranscript"
          @click="useImportedTranscript"
        >
          已导入
        </button>
      </div>

      <p class="demo-source">
        当前摘要 / 回放源：{{ activeTranscriptLabel }}
      </p>

      <p
        v-if="importError"
        class="demo-error"
      >
        {{ importError }}
      </p>

      <div class="demo-summary-grid">
        <article class="demo-summary-card">
          <h3>Tools</h3>
          <p v-if="transcript.tools[0]">
            {{ transcript.tools[0]?.title }} · {{ transcript.tools[0]?.status }}
          </p>
          <p v-else>
            暂无 tool
          </p>
        </article>

        <article class="demo-summary-card">
          <h3>Artifacts</h3>
          <p v-if="transcript.artifacts[0]">
            {{ transcript.artifacts[0]?.title }} · {{ transcript.artifacts[0]?.artifactKind }}
          </p>
          <p v-else>
            暂无 artifact
          </p>
        </article>

        <article class="demo-summary-card">
          <h3>Approvals</h3>
          <p v-if="transcript.approvals[0]">
            {{ transcript.approvals[0]?.title }} · {{ transcript.approvals[0]?.status }}
          </p>
          <p v-else>
            暂无 approval
          </p>
        </article>
      </div>

      <pre class="demo-preview">{{ transcriptPreview }}</pre>
    </section>

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
        <p>{{ activeTranscriptLabel }}，当前位置 {{ replayPosition }} / {{ replayTotal }}</p>
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
          :disabled="replayIsPlaying"
          @click="playReplay().catch(() => {})"
        >
          {{ replayIsPlaying ? '回放中...' : '自动回放' }}
        </button>
      </div>

      <RunSurface
        :runtime="replayRuntime"
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

.demo-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.demo-summary-card,
.demo-preview {
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #f8fafc;
}

.demo-summary-card {
  padding: 14px 16px;
}

.demo-summary-card h3,
.demo-summary-card p {
  margin: 0;
}

.demo-summary-card h3 {
  font-size: 14px;
  letter-spacing: -0.02em;
}

.demo-summary-card p {
  margin-top: 8px;
  color: #475569;
  line-height: 1.7;
}

.demo-preview {
  margin: 0;
  padding: 16px 18px;
  overflow: auto;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.7;
}

.demo-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.demo-controls--wrap {
  flex-wrap: wrap;
  margin-bottom: 12px;
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

.demo-button--file {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.demo-button--file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.demo-button--primary {
  background: #dbeafe;
  color: #1d4ed8;
}

.demo-button--active {
  background: #dbeafe;
  color: #1d4ed8;
}

.demo-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.demo-source,
.demo-error {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
}

.demo-source {
  color: #475569;
}

.demo-error {
  color: #b91c1c;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-summary-grid {
    grid-template-columns: 1fr;
  }

  .demo-controls {
    flex-wrap: wrap;
  }
}
</style>
