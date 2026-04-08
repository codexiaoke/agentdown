<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  createAgentDevtoolsReproductionPlayer,
  parseAgentDevtoolsReproduction,
  resolveRuntimeCommandTargetBlockIds,
  resolveRuntimeSnapshotDiff,
  resolveRuntimeSnapshotDiffTargetBlockIds,
  RunSurface,
  useAgentDevtoolsReproductionPlayer,
  type AgentDevtoolsReproductionExport,
  type RuntimeCommand,
  type RuntimeSnapshotDiff
} from '../../index';
import {
  createDevtoolsDemoReproduction,
  devtoolsDemoAssemblers,
  devtoolsPreset,
  type DevtoolsDemoPacket
} from '../presets/devtoolsPreset';

/**
 * replay debugger 里单步调试记录的结构。
 */
interface ReplayDebuggerEntry {
  /** 当前调试记录自身的稳定 id。 */
  id: string;
  /** 当前对应的 packet 顺序号。 */
  order: number;
  /** 当前对应的事件名。 */
  eventName: string;
  /** 当前对应的原始 packet。 */
  packet: DevtoolsDemoPacket;
  /** 当前这一步映射出的 runtime command。 */
  commands: RuntimeCommand[];
  /** 当前这一步产生的 snapshot diff。 */
  diff: RuntimeSnapshotDiff;
  /** 当前步骤最可能关联到的 block id 列表。 */
  targetBlockIds: string[];
}

const builtinReproduction = createDevtoolsDemoReproduction();
const reproductionInput = ref(JSON.stringify(builtinReproduction, null, 2));
const reproductionError = ref('');
const importedReproduction = ref<AgentDevtoolsReproductionExport<DevtoolsDemoPacket> | null>(null);
const selectedBlockId = ref<string | null>(null);
const activeEntryId = ref<string | null>(null);
const surfacePanelRef = ref<HTMLElement | null>(null);
const surface = devtoolsPreset.getSurfaceOptions();

/**
 * 当前 debugger 实际使用的 reproduction。
 *
 * 如果用户已经导入合法 JSON，就优先使用导入结果；
 * 否则回退到内置 demo reproduction。
 */
const activeReproduction = computed(() =>
  importedReproduction.value ?? builtinReproduction
);

const replay = useAgentDevtoolsReproductionPlayer<DevtoolsDemoPacket>(() => activeReproduction.value, {
  protocol: devtoolsPreset.protocol,
  assemblers: devtoolsDemoAssemblers
});
const replayRuntime = computed(() => replay.runtime.value);
const replayPosition = computed(() => replay.position.value);
const replayTotal = computed(() => replay.total.value);
const replayStatus = computed(() => replay.status.value);
const replayCurrent = computed(() => replay.current.value);
const replayIsPlaying = computed(() => replay.playing.value);

const visibleBlocks = computed(() =>
  replay.snapshot.value.blocks.filter((block) => block.slot === 'main')
);
const selectedBlock = computed(() =>
  visibleBlocks.value.find((block) => block.id === selectedBlockId.value)
    ?? visibleBlocks.value[0]
);
const latestMappedCommands = computed(() =>
  replay.bridgeSnapshot.value.mappedCommands.at(-1) ?? []
);
const latestCommandTypes = computed(() =>
  latestMappedCommands.value.map((command) => command.type)
);
const currentPacketPreview = computed(() =>
  replay.current.value
    ? JSON.stringify(replay.current.value.packet, null, 2)
    : '等待开始回放'
);
const currentBlockPreview = computed(() =>
  selectedBlock.value
    ? JSON.stringify(selectedBlock.value, null, 2)
    : '当前没有可选 block'
);
const importedPacketCount = computed(() => importedReproduction.value?.packets.length ?? 0);
const debugEntries = computed(() => buildReplayDebuggerEntries(replayPosition.value));
const activeDebugEntry = computed(() =>
  debugEntries.value.find((entry) => entry.id === activeEntryId.value)
    ?? debugEntries.value.at(-1)
    ?? null
);

watch(visibleBlocks, (nextBlocks) => {
  if (nextBlocks.length === 0) {
    selectedBlockId.value = null;
    return;
  }

  if (!selectedBlockId.value || !nextBlocks.some((block) => block.id === selectedBlockId.value)) {
    selectedBlockId.value = nextBlocks[0]?.id ?? null;
  }
}, {
  immediate: true
});

watch(debugEntries, (nextEntries) => {
  if (nextEntries.length === 0) {
    activeEntryId.value = null;
    return;
  }

  if (!activeEntryId.value || !nextEntries.some((entry) => entry.id === activeEntryId.value)) {
    activeEntryId.value = nextEntries[nextEntries.length - 1]?.id ?? null;
  }
}, {
  immediate: true
});

watch(
  [selectedBlockId, visibleBlocks],
  async () => {
    await syncSurfaceSelection();
  },
  {
    flush: 'post'
  }
);

/**
 * 为当前步骤里的命令生成更适合展示的标题。
 */
function resolveCommandLabel(command: RuntimeCommand): string {
  switch (command.type) {
    case 'block.insert':
    case 'block.upsert':
      return `${command.type} -> ${command.block.id}`;
    case 'block.patch':
    case 'block.remove':
      return `${command.type} -> ${command.id}`;
    case 'node.upsert':
      return `${command.type} -> ${command.node.id}`;
    case 'node.patch':
    case 'node.remove':
      return `${command.type} -> ${command.id}`;
    case 'stream.open':
    case 'stream.delta':
    case 'stream.close':
    case 'stream.abort':
      return `${command.type} -> ${command.streamId}`;
    case 'event.record':
      return 'event.record';
    default:
      return 'unknown-command';
  }
}

/**
 * 为步骤列表生成一句更像“本步发生了什么”的摘要。
 */
function resolveEntrySummary(entry: ReplayDebuggerEntry): string {
  if (entry.diff.blocks.added[0]) {
    return `新增 block ${entry.diff.blocks.added[0].id}`;
  }

  if (entry.diff.blocks.updated[0]) {
    return `更新 block ${entry.diff.blocks.updated[0].current.id}`;
  }

  if (entry.commands[0]) {
    return entry.commands[0].type;
  }

  return '本步没有直接产生可见 block';
}

/**
 * 判断某个 block id 当前是否仍存在于可见 surface 中。
 */
function hasVisibleBlock(blockId: string): boolean {
  return visibleBlocks.value.some((block) => block.id === blockId);
}

/**
 * 从一组候选 block id 里选出当前还能高亮的第一个目标。
 */
function resolveSelectableBlockId(blockIds: string[]): string | null {
  return blockIds.find((blockId) => hasVisibleBlock(blockId)) ?? null;
}

/**
 * 把 surface 中对应的 block DOM 高亮出来，并尽量滚动到可见区域。
 */
async function syncSurfaceSelection() {
  await nextTick();

  const container = surfacePanelRef.value;

  if (!container) {
    return;
  }

  const nodes = container.querySelectorAll<HTMLElement>('[data-block-id]');

  nodes.forEach((node) => {
    node.classList.remove('demo-replay-block--selected');
  });

  if (!selectedBlockId.value) {
    return;
  }

  const target = container.querySelector<HTMLElement>(`[data-block-id="${selectedBlockId.value}"]`);

  if (!target) {
    return;
  }

  target.classList.add('demo-replay-block--selected');
  target.scrollIntoView({
    block: 'nearest',
    behavior: 'smooth'
  });
}

/**
 * 基于当前 reproduction 和已播放位置，重建一份“步骤 -> 命令 -> diff”的调试列表。
 */
function buildReplayDebuggerEntries(position: number): ReplayDebuggerEntry[] {
  const debugPlayer = createAgentDevtoolsReproductionPlayer(activeReproduction.value, {
    protocol: devtoolsPreset.protocol,
    assemblers: devtoolsDemoAssemblers,
    debug: {
      maxEntries: Math.max(activeReproduction.value.packets.length + 4, 96)
    }
  });
  const entries: ReplayDebuggerEntry[] = [];
  let previousSnapshot = debugPlayer.snapshot();

  for (let index = 0; index < position; index += 1) {
    const [result] = debugPlayer.step(1);

    if (!result) {
      break;
    }

    const commands = result.bridgeSnapshot.mappedCommands.at(-1) ?? [];
    const diff = resolveRuntimeSnapshotDiff(previousSnapshot, result.snapshot);
    const diffTargetBlockIds = resolveRuntimeSnapshotDiffTargetBlockIds(diff);
    const commandTargetBlockIds = commands.flatMap((command) =>
      resolveRuntimeCommandTargetBlockIds(command, result.snapshot, {
        fallbackBlockIds: diffTargetBlockIds
      })
    );
    const targetBlockIds = Array.from(new Set([
      ...commandTargetBlockIds,
      ...diffTargetBlockIds
    ]));

    entries.push({
      id: `step:${result.entry.order}`,
      order: result.entry.order,
      eventName: result.entry.eventName,
      packet: result.entry.packet,
      commands,
      diff,
      targetBlockIds
    });

    previousSnapshot = result.snapshot;
  }

  return entries;
}

/**
 * 选中某一步调试记录，并优先高亮这一步最相关的 block。
 */
function selectDebugEntry(entry: ReplayDebuggerEntry) {
  activeEntryId.value = entry.id;
  selectedBlockId.value = resolveSelectableBlockId(entry.targetBlockIds);
}

/**
 * 选中某条命令对应的 block。
 */
function selectCommandTarget(entry: ReplayDebuggerEntry, command: RuntimeCommand) {
  activeEntryId.value = entry.id;
  const blockId = resolveSelectableBlockId(
    resolveRuntimeCommandTargetBlockIds(command, replay.snapshot.value, {
      fallbackBlockIds: entry.targetBlockIds
    })
  );

  if (blockId) {
    selectedBlockId.value = blockId;
  }
}

/**
 * 选中某条 diff 对应的 block。
 */
function selectDiffTarget(entry: ReplayDebuggerEntry, blockId: string) {
  activeEntryId.value = entry.id;

  if (hasVisibleBlock(blockId)) {
    selectedBlockId.value = blockId;
  }
}

/**
 * 从 textarea 中解析一份 reproduction。
 */
function importReproductionFromTextarea() {
  reproductionError.value = '';

  try {
    importedReproduction.value = parseAgentDevtoolsReproduction<DevtoolsDemoPacket>(reproductionInput.value);
    replay.reset();
    activeEntryId.value = null;
  } catch (error) {
    reproductionError.value = error instanceof Error
      ? error.message
      : 'Reproduction 导入失败。';
  }
}

/**
 * 从本地文件中读取 reproduction JSON。
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
 * 切回内置 demo reproduction。
 */
function useBuiltinReproduction() {
  importedReproduction.value = null;
  reproductionError.value = '';
  reproductionInput.value = JSON.stringify(builtinReproduction, null, 2);
  replay.reset();
  activeEntryId.value = null;
}

/**
 * 单步推进一条 packet。
 */
function stepReplay() {
  replay.step(1);
}

/**
 * 单步推进五条 packet，方便快速跨过 token 段。
 */
function stepFivePackets() {
  replay.step(5);
}

/**
 * 自动播放剩余 packet。
 */
async function playReplay() {
  await replay.play({
    intervalMs: 220
  });
}

/**
 * 直接跳到最终状态。
 */
function seekToEnd() {
  replay.seek(replay.total.value);
}
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>Replay Debugger</h1>
      <p>这里不再只是看 devtools 日志，而是直接按 reproduction packet 一步一步推进 runtime，方便定位某条事件究竟改了哪些 block。</p>
    </header>

    <section class="demo-import">
      <div class="demo-import__head">
        <div>
          <h2>Reproduction 源</h2>
          <p>可以直接粘贴 `agentdown.devtools-repro/v1`，也可以回到内置 demo 包。</p>
        </div>

        <div class="demo-import__actions">
          <span v-if="importedReproduction">已导入 {{ importedPacketCount }} 条 packet</span>

          <button
            type="button"
            class="demo-button"
            @click="useBuiltinReproduction"
          >
            使用内置包
          </button>

          <label class="demo-button demo-button--file">
            读取文件
            <input
              type="file"
              accept=".json,application/json"
              @change="importReproductionFile"
            >
          </label>
        </div>
      </div>

      <textarea
        v-model="reproductionInput"
        class="demo-import__textarea"
        rows="9"
        placeholder="把 devtools reproduction JSON 粘贴到这里"
      />

      <div class="demo-import__footer">
        <button
          type="button"
          class="demo-button demo-button--primary"
          @click="importReproductionFromTextarea"
        >
          载入 Reproduction
        </button>
      </div>

      <p
        v-if="reproductionError"
        class="demo-error"
      >
        {{ reproductionError }}
      </p>
    </section>

    <section class="demo-status">
      <span>position {{ replayPosition }} / {{ replayTotal }}</span>
      <span>status {{ replayStatus }}</span>
      <span>blocks {{ visibleBlocks.length }}</span>
      <span>commands {{ latestMappedCommands.length }}</span>
    </section>

    <section class="demo-controls">
      <button
        type="button"
        class="demo-button"
        @click="replay.reset"
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
        class="demo-button"
        @click="stepFivePackets"
      >
        +5 步
      </button>

      <button
        type="button"
        class="demo-button demo-button--primary"
        :disabled="replayIsPlaying"
        @click="playReplay().catch(() => {})"
      >
        {{ replayIsPlaying ? '播放中...' : '自动播放' }}
      </button>

      <button
        type="button"
        class="demo-button"
        :disabled="!replayIsPlaying"
        @click="replay.pause"
      >
        暂停
      </button>

      <button
        type="button"
        class="demo-button"
        @click="seekToEnd"
      >
        直接完成
      </button>
    </section>

    <section class="demo-grid">
      <div class="demo-panel demo-panel--surface">
        <div class="demo-panel__head">
          <h2>当前 Surface</h2>
          <p>左侧直接看 runtime 当前渲染结果。</p>
        </div>

        <div
          ref="surfacePanelRef"
          class="demo-replay-surface"
        >
          <RunSurface
            :runtime="replayRuntime"
            v-bind="surface"
          />
        </div>
      </div>

      <div class="demo-panel demo-panel--inspect">
        <div class="demo-panel__head">
          <h2>当前 Packet</h2>
          <p v-if="replayCurrent">
            #{{ replayCurrent.order }} · {{ replayCurrent.eventName }}
          </p>
          <p v-else>
            还没有开始回放
          </p>
        </div>

        <div class="demo-chips">
          <span
            v-for="commandType in latestCommandTypes"
            :key="commandType"
          >
            {{ commandType }}
          </span>
          <span v-if="latestCommandTypes.length === 0">
            当前 packet 还没有命令
          </span>
        </div>

        <pre class="demo-preview">{{ currentPacketPreview }}</pre>

        <div class="demo-panel__head demo-panel__head--sub">
          <h2>回放步骤</h2>
          <p>点击某一步，自动跳到这一步最相关的 block。</p>
        </div>

        <div class="demo-entry-list">
          <button
            v-for="entry in debugEntries"
            :key="entry.id"
            type="button"
            class="demo-entry-list__item"
            :data-active="entry.id === activeDebugEntry?.id ? 'true' : 'false'"
            @click="selectDebugEntry(entry)"
          >
            <strong>#{{ entry.order }} · {{ entry.eventName }}</strong>
            <span>{{ resolveEntrySummary(entry) }}</span>
          </button>
        </div>

        <div class="demo-panel__head demo-panel__head--sub">
          <h2>本步命令</h2>
          <p>点击命令直接高亮它影响到的 block。</p>
        </div>

        <div
          v-if="activeDebugEntry && activeDebugEntry.commands.length > 0"
          class="demo-command-list"
        >
          <button
            v-for="(command, index) in activeDebugEntry.commands"
            :key="`${activeDebugEntry.id}:command:${index}`"
            type="button"
            class="demo-command-list__item"
            @click="selectCommandTarget(activeDebugEntry, command)"
          >
            <strong>{{ resolveCommandLabel(command) }}</strong>
            <span>{{ command.type }}</span>
          </button>
        </div>

        <p
          v-else
          class="demo-empty"
        >
          当前步骤没有可展示的命令。
        </p>

        <div class="demo-panel__head demo-panel__head--sub">
          <h2>本步 Diff</h2>
          <p>点击 diff 里涉及的 block，也会同步高亮到左侧 surface。</p>
        </div>

        <div
          v-if="activeDebugEntry"
          class="demo-diff-list"
        >
          <button
            v-for="block in activeDebugEntry.diff.blocks.added"
            :key="`${activeDebugEntry.id}:added:${block.id}`"
            type="button"
            class="demo-diff-list__item demo-diff-list__item--added"
            @click="selectDiffTarget(activeDebugEntry, block.id)"
          >
            <strong>added</strong>
            <span>{{ block.id }}</span>
          </button>

          <button
            v-for="block in activeDebugEntry.diff.blocks.updated"
            :key="`${activeDebugEntry.id}:updated:${block.current.id}`"
            type="button"
            class="demo-diff-list__item demo-diff-list__item--updated"
            @click="selectDiffTarget(activeDebugEntry, block.current.id)"
          >
            <strong>updated</strong>
            <span>{{ block.current.id }}</span>
          </button>
        </div>

        <p
          v-if="activeDebugEntry && activeDebugEntry.diff.blocks.added.length === 0 && activeDebugEntry.diff.blocks.updated.length === 0"
          class="demo-empty"
        >
          当前步骤没有新增或更新 block。
        </p>

        <div class="demo-panel__head demo-panel__head--sub">
          <h2>当前 Blocks</h2>
          <p>点击任意 block 查看完整结构。</p>
        </div>

        <div class="demo-block-list">
          <button
            v-for="block in visibleBlocks"
            :key="block.id"
            type="button"
            class="demo-block-list__item"
            :data-active="block.id === selectedBlock?.id ? 'true' : 'false'"
            @click="selectedBlockId = block.id"
          >
            <strong>{{ block.renderer }}</strong>
            <span>{{ block.id }}</span>
          </button>
        </div>

        <pre class="demo-preview">{{ currentBlockPreview }}</pre>
      </div>
    </section>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 44px 24px 88px;
  min-height: 100%;
}

.demo-page__header {
  margin-bottom: 22px;
}

.demo-page__header h1,
.demo-page__header p,
.demo-panel__head h2,
.demo-panel__head p,
.demo-import__head h2,
.demo-import__head p {
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

.demo-import,
.demo-panel {
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #ffffff;
}

.demo-import {
  padding: 18px;
}

.demo-import__head,
.demo-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.demo-import__head p,
.demo-panel__head p {
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.8;
}

.demo-import__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.demo-import__actions span {
  color: #64748b;
  font-size: 12px;
}

.demo-import__textarea {
  width: 100%;
  min-height: 210px;
  margin-top: 14px;
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
  gap: 10px;
  margin-top: 12px;
}

.demo-status,
.demo-controls,
.demo-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.demo-status {
  margin-top: 18px;
}

.demo-status span,
.demo-chips span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef2f7;
  color: #475569;
  font-size: 12px;
}

.demo-controls {
  margin: 18px 0 22px;
}

.demo-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  background: #e2e8f0;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-button--primary {
  background: #0f172a;
  color: #ffffff;
}

.demo-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.demo-button--file {
  position: relative;
  overflow: hidden;
}

.demo-button--file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.demo-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  gap: 18px;
}

.demo-panel {
  padding: 18px;
}

.demo-panel--surface {
  min-height: 720px;
}

.demo-panel__head--sub {
  margin-top: 18px;
}

.demo-entry-list,
.demo-command-list,
.demo-diff-list,
.demo-block-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.demo-preview {
  margin: 12px 0 0;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
  overflow: auto;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.7;
}

.demo-entry-list__item,
.demo-command-list__item,
.demo-diff-list__item,
.demo-block-list__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #ffffff;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.demo-entry-list__item[data-active='true'],
.demo-command-list__item[data-active='true'],
.demo-diff-list__item[data-active='true'],
.demo-block-list__item[data-active='true'] {
  border-color: #0f172a;
  background: #f8fafc;
}

.demo-entry-list__item strong,
.demo-command-list__item strong,
.demo-diff-list__item strong,
.demo-block-list__item strong {
  font-size: 13px;
}

.demo-entry-list__item span,
.demo-command-list__item span,
.demo-diff-list__item span,
.demo-block-list__item span {
  color: #64748b;
  font-size: 12px;
  word-break: break-all;
}

.demo-diff-list__item--added {
  background: #f0fdf4;
}

.demo-diff-list__item--updated {
  background: #eff6ff;
}

.demo-empty {
  margin: 12px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.demo-error {
  margin: 12px 0 0;
  color: #b91c1c;
  font-size: 13px;
  line-height: 1.7;
}

.demo-replay-surface :deep(.demo-replay-block--selected) {
  position: relative;
  outline: 2px solid #0f172a;
  outline-offset: 4px;
  border-radius: 16px;
  box-shadow: 0 0 0 8px rgba(15, 23, 42, 0.08);
}

@media (max-width: 980px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-grid {
    grid-template-columns: 1fr;
  }

  .demo-import__head,
  .demo-panel__head {
    flex-direction: column;
  }

  .demo-import__actions {
    justify-content: flex-start;
  }
}
</style>
