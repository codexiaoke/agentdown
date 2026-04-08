<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  AgentDevtoolsOverlay,
  createAgentDevtoolsReproductionStream,
  eventToAction,
  parseAgentDevtoolsReproduction,
  RunSurface,
  type AgentDevtoolsReproductionExport,
  type BridgeHooks,
  useAgentDevtools,
  useAsyncIterableBridge
} from '../../index';
import {
  createDevtoolsDemoPackets,
  devtoolsDemoAssemblers,
  devtoolsPreset,
  type DevtoolsDemoPacket
} from '../presets/devtoolsPreset';

const runtime = devtoolsPreset.createRuntime();
const surface = devtoolsPreset.getSurfaceOptions();
const devtools = useAgentDevtools<DevtoolsDemoPacket>({
  maxEntries: 120
});
const sessionId = ref('');
const headerTitle = ref('等待 SetTitle');
const lastToast = ref('还没有收到 side effect 通知');
const reproductionInput = ref('');
const reproductionError = ref('');
const importedReproduction = ref<AgentDevtoolsReproductionExport<DevtoolsDemoPacket> | null>(null);
const playbackSource = ref<'builtin' | 'imported'>('builtin');

/**
 * demo 页面使用的本地 mock packet 序列。
 *
 * 这里故意混合：
 * - 不渲染 UI 的 side effect 事件
 * - 会驱动文本 / tool / artifact / approval 的 UI 事件
 */
const demoPackets: DevtoolsDemoPacket[] = createDevtoolsDemoPackets();

/**
 * 单次 packet 播放间隔。
 *
 * token 事件更快一些，方便观察真正的流式变化；
 * 结构事件稍慢一点，便于看清 diff 和 side effect 的更新。
 */
function resolvePacketDelay(packet: DevtoolsDemoPacket): number {
  if (packet.event === 'ContentDelta') {
    return packet.text.length <= 1 ? 45 : 120;
  }

  return 360;
}

/**
 * 用定时器模拟事件流之间的自然间隔。
 */
function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * 逐条产出 demo packet，模拟后端 transport 的消费过程。
 */
async function* createDemoPacketStream(): AsyncIterable<DevtoolsDemoPacket> {
  for (const packet of demoPackets) {
    await sleep(resolvePacketDelay(packet));
    yield packet;
  }
}

/**
 * 根据 reproduction 里的事件名推断更合适的播放速度。
 */
function resolveImportedPacketDelay(
  context: {
    eventName: string;
    packet: DevtoolsDemoPacket;
  }
): number {
  return context.eventName === 'ContentDelta'
    ? resolvePacketDelay(context.packet)
    : 360;
}

/**
 * 当前 demo 用来演示“非 UI 事件 side effect 通道”的规则集合。
 */
const sideEffects = eventToAction<DevtoolsDemoPacket>({
  createSession: {
    on: 'CreateSession',
    run({ event }) {
      if (event.event !== 'CreateSession') {
        return;
      }

      sessionId.value = event.sessionId;
    }
  },
  setTitle: {
    on: 'SetTitle',
    run({ event }) {
      if (event.event !== 'SetTitle') {
        return;
      }

      headerTitle.value = event.title;
    }
  },
  toast: {
    on: 'Toast',
    run({ event }) {
      if (event.event !== 'Toast') {
        return;
      }

      lastToast.value = event.message;
    }
  }
}, {
  resolveEventName: (packet) => packet.event
});

/**
 * 把 devtools 采集和 side effect 执行合并成同一个 bridge hook。
 */
const hooks: BridgeHooks<DevtoolsDemoPacket> = {
  onPacket(packet) {
    devtools.hooks.onPacket?.(packet);
    const executions = sideEffects.handleEvent(packet);
    devtools.recordSideEffects(packet, executions);
  },
  onMapped(commands, packet) {
    devtools.hooks.onMapped?.(commands, packet);
  },
  onFlush(commands) {
    sideEffects.hooks.onFlush?.(commands);
    devtools.hooks.onFlush?.(commands);
  },
  onError(error) {
    sideEffects.hooks.onError?.(error);
    devtools.hooks.onError?.(error);
  }
};

const {
  start,
  reset,
  consuming,
  error
} = useAsyncIterableBridge<DevtoolsDemoPacket>({
  runtime,
  protocol: devtoolsPreset.protocol,
  assemblers: devtoolsDemoAssemblers,
  hooks
});

devtools.attachRuntime(runtime);

const playing = computed(() => consuming.value);
const summary = computed(() => devtools.summary.value);
const importedPacketCount = computed(() => importedReproduction.value?.packets.length ?? 0);
const activePlaybackLabel = computed(() =>
  playbackSource.value === 'imported' && importedReproduction.value
    ? '当前使用导入 reproduction'
    : '当前使用内置 demo 包'
);

/**
 * 把 side effect 展示值恢复到初始状态。
 */
function resetSideEffectState() {
  sessionId.value = '';
  headerTitle.value = '等待 SetTitle';
  lastToast.value = '还没有收到 side effect 通知';
}

/**
 * 重播内置 mock 事件流。
 */
async function replayBuiltinDemo() {
  reset();
  resetSideEffectState();
  playbackSource.value = 'builtin';
  await start(createDemoPacketStream());
}

/**
 * 重播最近一次导入的 reproduction。
 */
async function replayImportedDemo() {
  if (!importedReproduction.value) {
    throw new Error('请先导入一份 reproduction JSON。');
  }

  reset();
  resetSideEffectState();
  playbackSource.value = 'imported';
  await start(createAgentDevtoolsReproductionStream(importedReproduction.value, {
    resolveDelay: resolveImportedPacketDelay
  }));
}

/**
 * 根据当前选择的播放源执行一次完整回放。
 */
async function replayDemo() {
  if (playbackSource.value === 'imported' && importedReproduction.value) {
    await replayImportedDemo();
    return;
  }

  await replayBuiltinDemo();
}

/**
 * 将 textarea 中的 JSON 解析成一份可重放 reproduction。
 */
function importReproductionFromTextarea() {
  reproductionError.value = '';

  try {
    importedReproduction.value = parseAgentDevtoolsReproduction<DevtoolsDemoPacket>(reproductionInput.value);
    playbackSource.value = 'imported';
  } catch (error) {
    reproductionError.value = error instanceof Error
      ? error.message
      : 'Reproduction 导入失败。';
  }
}

/**
 * 把当前 devtools 已记录的 reproduction 快照直接填充到导入框里。
 */
function loadCurrentReproduction() {
  const exported = devtools.exportReproduction() as AgentDevtoolsReproductionExport<DevtoolsDemoPacket>;
  reproductionInput.value = JSON.stringify(exported, null, 2);
  importedReproduction.value = parseAgentDevtoolsReproduction<DevtoolsDemoPacket>(exported);
  reproductionError.value = '';
  playbackSource.value = 'imported';
}

/**
 * 从本地文件读取 reproduction JSON。
 */
async function importReproductionFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  reproductionInput.value = await file.text();
  importReproductionFromTextarea();
  input.value = '';
}

/**
 * 切回内置 demo 包，方便对照导入前后的差异。
 */
function useBuiltinPlayback() {
  playbackSource.value = 'builtin';
}

onMounted(() => {
  replayBuiltinDemo().catch(() => {
    // demo 失败时保持当前页面可交互即可，不额外中断界面。
  });
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>Devtools 调试页</h1>
      <p>这个页面不依赖后端，直接用本地 async iterable 模拟一段完整运行流，专门用来观察 events / trace / effects / diff 四种日志怎么一起工作。</p>
    </header>

    <div class="demo-page__chips">
      <span>local packets</span>
      <span>streaming markdown</span>
      <span>side effects</span>
      <span>tool</span>
      <span>artifact</span>
      <span>approval</span>
    </div>

    <section class="demo-signals">
      <article class="demo-signal">
        <span>Session</span>
        <strong>{{ sessionId || '等待 CreateSession' }}</strong>
        <p>这项状态来自副作用通道，不会变成 surface block。</p>
      </article>

      <article class="demo-signal">
        <span>Title</span>
        <strong>{{ headerTitle }}</strong>
        <p><code>SetTitle</code> 命中后会直接更新页面，而不是写进 runtime。</p>
      </article>

      <article class="demo-signal">
        <span>Toast</span>
        <strong>{{ lastToast }}</strong>
        <p><code>Toast</code> 事件只做业务反馈，用来演示 effects tab。</p>
      </article>
    </section>

    <div class="demo-toolbar">
      <div class="demo-toolbar__summary">
        <span>events {{ summary.rawEventCount }}</span>
        <span>trace {{ summary.protocolTraceCount }}</span>
        <span>effects {{ summary.sideEffectCount }}</span>
        <span>diff {{ summary.snapshotDiffCount }}</span>
      </div>

      <div class="demo-toolbar__actions">
        <span class="demo-toolbar__label">{{ activePlaybackLabel }}</span>

        <button
          type="button"
          class="demo-toolbar__button demo-toolbar__button--secondary"
          :disabled="playing"
          @click="useBuiltinPlayback"
        >
          使用内置包
        </button>

        <button
          type="button"
          class="demo-toolbar__button"
          :disabled="playing"
          @click="replayDemo().catch(() => {})"
        >
          {{ playing ? '播放中...' : '开始回放' }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="demo-page__error"
    >
      {{ error.message }}
    </p>

    <section class="demo-import">
      <div class="demo-import__head">
        <div>
          <h2>导入 Reproduction</h2>
          <p>把 overlay 里的“复制复现”结果贴到这里，就能直接重放这一组 packet。</p>
        </div>

        <div class="demo-import__meta">
          <span v-if="importedReproduction">已导入 {{ importedPacketCount }} 条 packet</span>
          <button
            type="button"
            class="demo-import__action"
            @click="loadCurrentReproduction"
          >
            填充当前导出
          </button>
          <label class="demo-import__action demo-import__action--file">
            读取文件
            <input
              type="file"
              accept="application/json,.json"
              @change="importReproductionFile"
            >
          </label>
        </div>
      </div>

      <textarea
        v-model="reproductionInput"
        class="demo-import__textarea"
        rows="10"
        placeholder="把 Agent Devtools reproduction JSON 粘贴到这里"
      />

      <div class="demo-import__footer">
        <button
          type="button"
          class="demo-import__action"
          @click="importReproductionFromTextarea"
        >
          载入 Reproduction
        </button>

        <button
          type="button"
          class="demo-import__action"
          :disabled="!importedReproduction || playing"
          @click="replayImportedDemo().catch(() => {})"
        >
          回放导入包
        </button>
      </div>

      <p
        v-if="reproductionError"
        class="demo-import__error"
      >
        {{ reproductionError }}
      </p>
    </section>

    <RunSurface
      :runtime="runtime"
      v-bind="surface"
    />

    <AgentDevtoolsOverlay
      :devtools="devtools"
      title="Devtools Overlay"
      :initially-open="true"
      default-tab="effects"
      :max-items="6"
    />
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 780px;
  margin: 0 auto;
  padding: 44px 24px 88px;
  min-height: 100%;
}

.demo-page__header {
  margin-bottom: 18px;
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

.demo-page__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.demo-page__chips span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 12px;
  font-weight: 600;
}

.demo-signals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.demo-signal {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px;
  background: #ffffff;
}

.demo-signal span,
.demo-signal p {
  margin: 0;
}

.demo-signal span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.demo-signal strong {
  display: block;
  margin-top: 10px;
  color: #0f172a;
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
}

.demo-signal p {
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.demo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.demo-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.demo-toolbar__label {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.demo-toolbar__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.demo-toolbar__summary span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #e2e8f0;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}

.demo-toolbar__button {
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #0f172a;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-toolbar__button--secondary {
  background: #e2e8f0;
  color: #334155;
}

.demo-toolbar__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.demo-import {
  margin-bottom: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 18px;
  background: #ffffff;
}

.demo-import__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.demo-import__head h2,
.demo-import__head p {
  margin: 0;
}

.demo-import__head h2 {
  font-size: 18px;
}

.demo-import__head p {
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.8;
}

.demo-import__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.demo-import__meta span {
  color: #64748b;
  font-size: 12px;
}

.demo-import__textarea {
  width: 100%;
  min-height: 220px;
  border: 1px solid #dbe3ee;
  border-radius: 16px;
  padding: 14px;
  background: #f8fafc;
  color: #0f172a;
  font: 13px/1.7 "SFMono-Regular", "Consolas", monospace;
  resize: vertical;
}

.demo-import__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.demo-import__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e2e8f0;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.demo-import__action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.demo-import__action--file {
  position: relative;
  overflow: hidden;
}

.demo-import__action--file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.demo-import__error {
  margin: 12px 0 0;
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.7;
}

.demo-page__error {
  margin: 0 0 18px;
  border-radius: 14px;
  padding: 10px 12px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 760px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-signals {
    grid-template-columns: 1fr;
  }

  .demo-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .demo-toolbar__actions {
    flex-wrap: wrap;
  }

  .demo-toolbar__button {
    width: 100%;
  }

  .demo-import__head {
    flex-direction: column;
  }

  .demo-import__meta {
    justify-content: flex-start;
  }
}
</style>
