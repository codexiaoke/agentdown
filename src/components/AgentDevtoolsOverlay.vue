<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type {
  AgentDevtoolsProtocolTraceEntry,
  AgentDevtoolsRawEventEntry,
  AgentDevtoolsSideEffectEntry,
  AgentDevtoolsSnapshotDiffEntry,
  AgentDevtoolsSummary
} from '../composables/useAgentDevtools';
import type { ComputedRef, ShallowRef } from 'vue';

/**
 * overlay 当前支持的页签类型。
 */
type AgentDevtoolsTab = 'events' | 'trace' | 'effects' | 'diff';

/**
 * `AgentDevtoolsOverlay` 的输入参数。
 */
interface Props {
  /** 当前要展示的 devtools store。 */
  devtools: {
    rawEvents: ShallowRef<AgentDevtoolsRawEventEntry<any>[]>;
    protocolTrace: ShallowRef<AgentDevtoolsProtocolTraceEntry<any>[]>;
    sideEffects: ShallowRef<AgentDevtoolsSideEffectEntry<any>[]>;
    snapshotDiffs: ShallowRef<AgentDevtoolsSnapshotDiffEntry[]>;
    summary: ComputedRef<AgentDevtoolsSummary>;
    reset: () => void;
    exportSnapshot: () => unknown;
    exportReproduction: () => unknown;
  };
  /** 面板标题。 */
  title?: string;
  /** 首次渲染时是否默认展开。 */
  initiallyOpen?: boolean;
  /** 默认选中的页签。 */
  defaultTab?: AgentDevtoolsTab;
  /** 每个页签最多展示多少条记录。 */
  maxItems?: number;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Agent Devtools',
  initiallyOpen: false,
  defaultTab: 'events',
  maxItems: 8
});

const open = ref(props.initiallyOpen);
const activeTab = ref<AgentDevtoolsTab>(props.defaultTab);
const filterText = ref('');
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const globalCopyTarget = ref<'snapshot' | 'reproduction' | null>(null);
const copiedEntryId = ref<string | null>(null);
const expandedEntryIds = ref<string[]>([]);
let copyTimer: number | undefined;

/**
 * 读取当前三类日志的总数。
 */
const totalLogCount = computed(() => {
  return props.devtools.summary.value.rawEventCount
    + props.devtools.summary.value.protocolTraceCount
    + props.devtools.summary.value.sideEffectCount
    + props.devtools.summary.value.snapshotDiffCount;
});

/**
 * 把当前搜索词标准化，方便做大小写无关匹配。
 */
function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 判断一条原始事件日志是否命中当前搜索词。
 */
function matchesRawEvent(
  entry: AgentDevtoolsRawEventEntry<unknown>,
  query: string
): boolean {
  if (query.length === 0) {
    return true;
  }

  return entry.eventName.toLowerCase().includes(query)
    || entry.preview.toLowerCase().includes(query)
    || entry.id.toLowerCase().includes(query);
}

/**
 * 判断一条 protocol trace 是否命中当前搜索词。
 */
function matchesProtocolTrace(
  entry: AgentDevtoolsProtocolTraceEntry<unknown>,
  query: string
): boolean {
  if (query.length === 0) {
    return true;
  }

  return entry.eventName.toLowerCase().includes(query)
    || entry.commandTypes.join(' ').toLowerCase().includes(query)
    || entry.id.toLowerCase().includes(query);
}

/**
 * 判断一条 side effect 日志是否命中当前搜索词。
 */
function matchesSideEffect(
  entry: AgentDevtoolsSideEffectEntry<unknown>,
  query: string
): boolean {
  if (query.length === 0) {
    return true;
  }

  return (entry.eventName ?? '').toLowerCase().includes(query)
    || entry.actionKeys.join(' ').toLowerCase().includes(query)
    || entry.id.toLowerCase().includes(query);
}

/**
 * 判断一条 snapshot diff 是否命中当前搜索词。
 */
function matchesSnapshotDiff(
  entry: AgentDevtoolsSnapshotDiffEntry,
  query: string
): boolean {
  if (query.length === 0) {
    return true;
  }

  const searchableText = [
    entry.id,
    entry.eventName ?? '',
    ...entry.commandTypes,
    ...entry.diff.blocks.added.map((item) => item.id),
    ...entry.diff.blocks.updated.map((item) => item.id),
    ...entry.diff.blocks.removed.map((item) => item.id),
    ...entry.diff.nodes.added.map((item) => item.id),
    ...entry.diff.nodes.updated.map((item) => item.id),
    ...entry.diff.nodes.removed.map((item) => item.id)
  ].join(' ').toLowerCase();

  return searchableText.includes(query);
}

/**
 * 读取当前页签真正要显示的事件列表。
 */
const visibleEvents = computed(() => {
  const query = normalizeSearch(filterText.value);
  return props.devtools.rawEvents.value
    .filter((entry) => matchesRawEvent(entry, query))
    .slice(-Math.max(1, props.maxItems));
});

/**
 * 读取当前页签真正要显示的 trace 列表。
 */
const visibleTrace = computed(() => {
  const query = normalizeSearch(filterText.value);
  return props.devtools.protocolTrace.value
    .filter((entry) => matchesProtocolTrace(entry, query))
    .slice(-Math.max(1, props.maxItems));
});

/**
 * 读取当前页签真正要显示的 side effect 列表。
 */
const visibleSideEffects = computed(() => {
  const query = normalizeSearch(filterText.value);
  return props.devtools.sideEffects.value
    .filter((entry) => matchesSideEffect(entry, query))
    .slice(-Math.max(1, props.maxItems));
});

/**
 * 读取当前页签真正要显示的 diff 列表。
 */
const visibleDiffs = computed(() => {
  const query = normalizeSearch(filterText.value);
  return props.devtools.snapshotDiffs.value
    .filter((entry) => matchesSnapshotDiff(entry, query))
    .slice(-Math.max(1, props.maxItems));
});

/**
 * 读取当前页签总条数，方便按钮上展示。
 */
function resolveTabCount(tab: AgentDevtoolsTab): number {
  switch (tab) {
    case 'trace':
      return props.devtools.protocolTrace.value.length;
    case 'effects':
      return props.devtools.sideEffects.value.length;
    case 'diff':
      return props.devtools.snapshotDiffs.value.length;
    case 'events':
    default:
      return props.devtools.rawEvents.value.length;
  }
}

/**
 * 切换当前展开状态。
 */
function toggleOpen() {
  open.value = !open.value;
}

/**
 * 切换当前选中的页签。
 */
function switchTab(tab: AgentDevtoolsTab) {
  activeTab.value = tab;
}

/**
 * 判断一条日志当前是否处于展开状态。
 */
function isEntryExpanded(id: string): boolean {
  return expandedEntryIds.value.includes(id);
}

/**
 * 切换某条日志的详情展开状态。
 */
function toggleEntry(id: string) {
  expandedEntryIds.value = isEntryExpanded(id)
    ? expandedEntryIds.value.filter((value) => value !== id)
    : [...expandedEntryIds.value, id];
}

/**
 * 清理复制成功状态的反馈定时器。
 */
function clearCopyTimer() {
  if (copyTimer !== undefined) {
    globalThis.clearTimeout(copyTimer);
    copyTimer = undefined;
  }
}

onBeforeUnmount(() => {
  clearCopyTimer();
});

/**
 * 把当前 devtools 全量状态复制成 JSON。
 */
async function copySnapshot() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.devtools.exportSnapshot(), null, 2));
    copyState.value = 'copied';
    globalCopyTarget.value = 'snapshot';
    copiedEntryId.value = null;
  } catch {
    copyState.value = 'failed';
    globalCopyTarget.value = 'snapshot';
    copiedEntryId.value = null;
  }

  clearCopyTimer();
  copyTimer = globalThis.setTimeout(() => {
    copyState.value = 'idle';
    copyTimer = undefined;
  }, 3000);
}

/**
 * 把当前最小复现包复制成 JSON。
 */
async function copyReproduction() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.devtools.exportReproduction(), null, 2));
    copyState.value = 'copied';
    globalCopyTarget.value = 'reproduction';
    copiedEntryId.value = null;
  } catch {
    copyState.value = 'failed';
    globalCopyTarget.value = 'reproduction';
    copiedEntryId.value = null;
  }

  clearCopyTimer();
  copyTimer = globalThis.setTimeout(() => {
    copiedEntryId.value = null;
    globalCopyTarget.value = null;
    copyState.value = 'idle';
    copyTimer = undefined;
  }, 3000);
}

/**
 * 复制某一条日志的完整 JSON 内容。
 */
async function copyEntry(id: string, value: unknown) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    copyState.value = 'idle';
    copiedEntryId.value = id;
    globalCopyTarget.value = null;
  } catch {
    copyState.value = 'failed';
    copiedEntryId.value = id;
    globalCopyTarget.value = null;
  }

  clearCopyTimer();
  copyTimer = globalThis.setTimeout(() => {
    copiedEntryId.value = null;
    copyState.value = 'idle';
    copyTimer = undefined;
  }, 3000);
}

/**
 * 把任意对象格式化成适合面板内展示的 JSON 字符串。
 */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * 给某条 diff 生成一句更像“发生了什么”的摘要。
 */
function resolveDiffSummaryText(entry: AgentDevtoolsSnapshotDiffEntry): string {
  return entry.diff.blocks.added[0]?.id
    ?? entry.diff.blocks.updated[0]?.id
    ?? entry.diff.nodes.added[0]?.id
    ?? entry.diff.nodes.updated[0]?.id
    ?? entry.diff.blocks.removed[0]?.id
    ?? entry.diff.nodes.removed[0]?.id
    ?? '当前 diff 主要来自 history / intent 变化';
}

/**
 * 读取顶部全量导出按钮的即时文案。
 */
function resolveSnapshotCopyLabel(): string {
  if (globalCopyTarget.value !== 'snapshot') {
    return '复制 JSON';
  }

  return copyState.value === 'failed'
    ? '复制失败'
    : '已复制';
}

/**
 * 读取顶部最小复现按钮的即时文案。
 */
function resolveReproductionCopyLabel(): string {
  if (globalCopyTarget.value !== 'reproduction') {
    return '复制复现';
  }

  return copyState.value === 'failed'
    ? '复制失败'
    : '已复制';
}

/**
 * 将时间戳格式化成更适合面板展示的短时间。
 */
function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false
  });
}
</script>

<template>
  <aside
    class="agentdown-devtools-overlay"
    :data-open="open ? 'true' : 'false'"
  >
    <header class="agentdown-devtools-overlay__header">
      <button
        type="button"
        class="agentdown-devtools-overlay__toggle"
        @click="toggleOpen"
      >
        <span>{{ title }}</span>
        <strong>{{ totalLogCount }}</strong>
      </button>

      <div
        v-if="open"
        class="agentdown-devtools-overlay__actions"
      >
        <button
          type="button"
          class="agentdown-devtools-overlay__action"
          @click="props.devtools.reset()"
        >
          清空
        </button>

        <button
          type="button"
          class="agentdown-devtools-overlay__action"
          @click="copyReproduction().catch(() => {})"
        >
          {{ resolveReproductionCopyLabel() }}
        </button>

        <button
          type="button"
          class="agentdown-devtools-overlay__action"
          @click="copySnapshot().catch(() => {})"
        >
          {{ resolveSnapshotCopyLabel() }}
        </button>
      </div>
    </header>

    <div
      v-if="open"
      class="agentdown-devtools-overlay__panel"
    >
      <div class="agentdown-devtools-overlay__tabs">
        <button
          type="button"
          class="agentdown-devtools-overlay__tab"
          :data-active="activeTab === 'events' ? 'true' : 'false'"
          @click="switchTab('events')"
        >
          事件 {{ resolveTabCount('events') }}
        </button>

        <button
          type="button"
          class="agentdown-devtools-overlay__tab"
          :data-active="activeTab === 'trace' ? 'true' : 'false'"
          @click="switchTab('trace')"
        >
          Trace {{ resolveTabCount('trace') }}
        </button>

        <button
          type="button"
          class="agentdown-devtools-overlay__tab"
          :data-active="activeTab === 'effects' ? 'true' : 'false'"
          @click="switchTab('effects')"
        >
          Effects {{ resolveTabCount('effects') }}
        </button>

        <button
          type="button"
          class="agentdown-devtools-overlay__tab"
          :data-active="activeTab === 'diff' ? 'true' : 'false'"
          @click="switchTab('diff')"
        >
          Diff {{ resolveTabCount('diff') }}
        </button>
      </div>

      <input
        v-model="filterText"
        class="agentdown-devtools-overlay__search"
        type="text"
        placeholder="搜索 event / command / block id"
      >

      <ol
        v-if="activeTab === 'events' && visibleEvents.length > 0"
        class="agentdown-devtools-overlay__list"
      >
        <li
          v-for="entry in visibleEvents"
          :key="entry.id"
          class="agentdown-devtools-overlay__item"
        >
          <div class="agentdown-devtools-overlay__item-head">
            <div>
              <strong>{{ entry.eventName }}</strong>
              <span>#{{ entry.order }} · {{ formatTime(entry.at) }}</span>
            </div>

            <div class="agentdown-devtools-overlay__item-actions">
              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="copyEntry(entry.id, entry.packet).catch(() => {})"
              >
                {{
                  copiedEntryId === entry.id && copyState !== 'failed'
                    ? '已复制'
                    : copiedEntryId === entry.id && copyState === 'failed'
                      ? '失败'
                      : '复制'
                }}
              </button>

              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="toggleEntry(entry.id)"
              >
                {{ isEntryExpanded(entry.id) ? '收起' : '展开' }}
              </button>
            </div>
          </div>

          <p class="agentdown-devtools-overlay__item-desc">
            {{ entry.preview }}
          </p>

          <div class="agentdown-devtools-overlay__chips">
            <span>{{ entry.size }} B</span>
            <span>{{ entry.id }}</span>
          </div>

          <pre
            v-if="isEntryExpanded(entry.id)"
            class="agentdown-devtools-overlay__detail"
          >{{ formatJson(entry.packet) }}</pre>
        </li>
      </ol>

      <ol
        v-else-if="activeTab === 'trace' && visibleTrace.length > 0"
        class="agentdown-devtools-overlay__list"
      >
        <li
          v-for="entry in visibleTrace"
          :key="entry.id"
          class="agentdown-devtools-overlay__item"
        >
          <div class="agentdown-devtools-overlay__item-head">
            <div>
              <strong>{{ entry.eventName }}</strong>
              <span>#{{ entry.order }} · {{ formatTime(entry.at) }}</span>
            </div>

            <div class="agentdown-devtools-overlay__item-actions">
              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="copyEntry(entry.id, { packet: entry.packet, commands: entry.commands }).catch(() => {})"
              >
                {{
                  copiedEntryId === entry.id && copyState !== 'failed'
                    ? '已复制'
                    : copiedEntryId === entry.id && copyState === 'failed'
                      ? '失败'
                      : '复制'
                }}
              </button>

              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="toggleEntry(entry.id)"
              >
                {{ isEntryExpanded(entry.id) ? '收起' : '展开' }}
              </button>
            </div>
          </div>

          <p class="agentdown-devtools-overlay__item-desc">
            {{ entry.commandTypes.join(' → ') || '当前事件未生成命令' }}
          </p>

          <div class="agentdown-devtools-overlay__chips">
            <span>commands={{ entry.commandCount }}</span>
            <span v-if="entry.packetOrder !== null">packet=#{{ entry.packetOrder }}</span>
            <span>{{ entry.id }}</span>
          </div>

          <div
            v-if="isEntryExpanded(entry.id)"
            class="agentdown-devtools-overlay__detail-stack"
          >
            <div class="agentdown-devtools-overlay__detail-section">
              <strong>Packet</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson(entry.packet) }}</pre>
            </div>

            <div class="agentdown-devtools-overlay__detail-section">
              <strong>Commands</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson(entry.commands) }}</pre>
            </div>
          </div>
        </li>
      </ol>

      <ol
        v-else-if="activeTab === 'effects' && visibleSideEffects.length > 0"
        class="agentdown-devtools-overlay__list"
      >
        <li
          v-for="entry in visibleSideEffects"
          :key="entry.id"
          class="agentdown-devtools-overlay__item"
        >
          <div class="agentdown-devtools-overlay__item-head">
            <div>
              <strong>{{ entry.eventName ?? 'unknown event' }}</strong>
              <span>#{{ entry.order }} · {{ formatTime(entry.at) }}</span>
            </div>

            <div class="agentdown-devtools-overlay__item-actions">
              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="copyEntry(entry.id, entry).catch(() => {})"
              >
                {{
                  copiedEntryId === entry.id && copyState !== 'failed'
                    ? '已复制'
                    : copiedEntryId === entry.id && copyState === 'failed'
                      ? '失败'
                      : '复制'
                }}
              </button>

              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="toggleEntry(entry.id)"
              >
                {{ isEntryExpanded(entry.id) ? '收起' : '展开' }}
              </button>
            </div>
          </div>

          <p class="agentdown-devtools-overlay__item-desc">
            {{ entry.actionKeys.join('、') }}
          </p>

          <div class="agentdown-devtools-overlay__chips">
            <span>actions={{ entry.actionCount }}</span>
            <span v-if="entry.packetOrder !== null">packet=#{{ entry.packetOrder }}</span>
            <span>{{ entry.id }}</span>
          </div>

          <div
            v-if="isEntryExpanded(entry.id)"
            class="agentdown-devtools-overlay__detail-stack"
          >
            <div class="agentdown-devtools-overlay__detail-section">
              <strong>Packet</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson(entry.packet) }}</pre>
            </div>

            <div class="agentdown-devtools-overlay__detail-section">
              <strong>Actions</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson(entry.actions) }}</pre>
            </div>
          </div>
        </li>
      </ol>

      <ol
        v-else-if="activeTab === 'diff' && visibleDiffs.length > 0"
        class="agentdown-devtools-overlay__list"
      >
        <li
          v-for="entry in visibleDiffs"
          :key="entry.id"
          class="agentdown-devtools-overlay__item"
        >
          <div class="agentdown-devtools-overlay__item-head">
            <div>
              <strong>Runtime Diff</strong>
              <span>#{{ entry.order }} · {{ formatTime(entry.at) }}</span>
            </div>

            <div class="agentdown-devtools-overlay__item-actions">
              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="copyEntry(entry.id, entry).catch(() => {})"
              >
                {{
                  copiedEntryId === entry.id && copyState !== 'failed'
                    ? '已复制'
                    : copiedEntryId === entry.id && copyState === 'failed'
                      ? '失败'
                      : '复制'
                }}
              </button>

              <button
                type="button"
                class="agentdown-devtools-overlay__item-action"
                @click="toggleEntry(entry.id)"
              >
                {{ isEntryExpanded(entry.id) ? '收起' : '展开' }}
              </button>
            </div>
          </div>

          <div class="agentdown-devtools-overlay__chips">
            <span v-if="entry.summary.addedBlockCount > 0">+block {{ entry.summary.addedBlockCount }}</span>
            <span v-if="entry.summary.updatedBlockCount > 0">~block {{ entry.summary.updatedBlockCount }}</span>
            <span v-if="entry.summary.removedBlockCount > 0">-block {{ entry.summary.removedBlockCount }}</span>
            <span v-if="entry.summary.addedNodeCount > 0">+node {{ entry.summary.addedNodeCount }}</span>
            <span v-if="entry.summary.updatedNodeCount > 0">~node {{ entry.summary.updatedNodeCount }}</span>
            <span v-if="entry.summary.removedNodeCount > 0">-node {{ entry.summary.removedNodeCount }}</span>
            <span v-if="entry.summary.historyDelta !== 0">history {{ entry.summary.historyDelta > 0 ? '+' : '' }}{{ entry.summary.historyDelta }}</span>
          </div>

          <p class="agentdown-devtools-overlay__item-desc">
            {{ resolveDiffSummaryText(entry) }}
          </p>

          <div class="agentdown-devtools-overlay__chips">
            <span v-if="entry.traceOrder !== null">trace=#{{ entry.traceOrder }}</span>
            <span v-if="entry.packetOrder !== null">packet=#{{ entry.packetOrder }}</span>
            <span v-if="entry.eventName">{{ entry.eventName }}</span>
            <span v-if="entry.historyEntries.length > 0">historyEntries={{ entry.historyEntries.length }}</span>
          </div>

          <div
            v-if="isEntryExpanded(entry.id)"
            class="agentdown-devtools-overlay__detail-stack"
          >
            <div class="agentdown-devtools-overlay__detail-section">
              <strong>Trace Link</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson({
                traceOrder: entry.traceOrder,
                packetOrder: entry.packetOrder,
                eventName: entry.eventName,
                commandTypes: entry.commandTypes
              }) }}</pre>
            </div>

            <div
              v-if="entry.historyEntries.length > 0"
              class="agentdown-devtools-overlay__detail-section"
            >
              <strong>History Entries</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson(entry.historyEntries) }}</pre>
            </div>

            <div class="agentdown-devtools-overlay__detail-section">
              <strong>Snapshot Diff</strong>
              <pre class="agentdown-devtools-overlay__detail">{{ formatJson(entry.diff) }}</pre>
            </div>
          </div>
        </li>
      </ol>

      <p
        v-else
        class="agentdown-devtools-overlay__empty"
      >
        当前页签还没有日志。
      </p>
    </div>
  </aside>
</template>

<style scoped>
.agentdown-devtools-overlay {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 60;
  width: min(420px, calc(100vw - 24px));
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
}

.agentdown-devtools-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px;
}

.agentdown-devtools-overlay__toggle,
.agentdown-devtools-overlay__action,
.agentdown-devtools-overlay__tab {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.agentdown-devtools-overlay__toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.agentdown-devtools-overlay__toggle strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 12px;
}

.agentdown-devtools-overlay__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agentdown-devtools-overlay__action {
  border-radius: 999px;
  padding: 6px 10px;
  background: #f1f5f9;
  color: #334155;
  font-size: 12px;
  cursor: pointer;
}

.agentdown-devtools-overlay__panel {
  border-top: 1px solid rgba(226, 232, 240, 0.92);
  padding: 12px;
}

.agentdown-devtools-overlay__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agentdown-devtools-overlay__tab {
  border-radius: 999px;
  padding: 6px 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
}

.agentdown-devtools-overlay__tab[data-active='true'] {
  background: #dbeafe;
  color: #1d4ed8;
}

.agentdown-devtools-overlay__search {
  width: 100%;
  margin-top: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 12px;
}

.agentdown-devtools-overlay__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.agentdown-devtools-overlay__item {
  border-radius: 14px;
  padding: 12px;
  background: #f8fafc;
}

.agentdown-devtools-overlay__item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agentdown-devtools-overlay__item-head > div {
  min-width: 0;
}

.agentdown-devtools-overlay__item-head strong {
  display: block;
  font-size: 13px;
}

.agentdown-devtools-overlay__item-head span {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
}

.agentdown-devtools-overlay__item-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.agentdown-devtools-overlay__item-action {
  border: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: #e2e8f0;
  color: #334155;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.agentdown-devtools-overlay__item-desc,
.agentdown-devtools-overlay__empty {
  margin: 8px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.agentdown-devtools-overlay__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.agentdown-devtools-overlay__chips span {
  border-radius: 999px;
  padding: 4px 8px;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
}

.agentdown-devtools-overlay__detail-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.agentdown-devtools-overlay__detail-section {
  min-width: 0;
}

.agentdown-devtools-overlay__detail-section strong {
  display: block;
  margin-bottom: 6px;
  color: #334155;
  font-size: 11px;
}

.agentdown-devtools-overlay__detail {
  margin: 0;
  border-radius: 12px;
  padding: 10px;
  overflow-x: auto;
  background: #ffffff;
  color: #0f172a;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .agentdown-devtools-overlay {
    left: 12px;
    bottom: 12px;
    width: min(420px, calc(100vw - 24px));
  }
}
</style>
