<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  /** 是否记住用户上一次拖拽后的浮层位置。 */
  rememberPosition?: boolean;
  /** 记住浮层位置时使用的本地存储 key。 */
  positionStorageKey?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Agent Devtools',
  initiallyOpen: false,
  defaultTab: 'events',
  maxItems: 8,
  rememberPosition: true,
  positionStorageKey: 'agentdown:overlay:devtools:position'
});

const open = ref(props.initiallyOpen);
const activeTab = ref<AgentDevtoolsTab>(props.defaultTab);
const filterText = ref('');
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const globalCopyTarget = ref<'reproduction' | null>(null);
const copiedEntryId = ref<string | null>(null);
const expandedEntryIds = ref<string[]>([]);
const overlayRef = ref<HTMLElement | null>(null);
const floatingPosition = ref<{
  left: number;
  top: number;
} | null>(null);
const dragging = ref(false);
let copyTimer: number | undefined;
let dragPointerId: number | null = null;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragStartLeft = 0;
let dragStartTop = 0;

/**
 * `OverlayTooltipState` 描述当前悬浮提示的显示状态。
 */
interface OverlayTooltipState {
  /** 当前 tooltip 是否可见。 */
  visible: boolean;
  /** tooltip 当前显示的文案。 */
  label: string;
  /** tooltip 的 fixed left 坐标。 */
  left: number;
  /** tooltip 的 fixed top 坐标。 */
  top: number;
  /** tooltip 当前停靠的位置。 */
  placement: 'top' | 'bottom';
}

/**
 * `OverlayStoredPosition` 描述持久化到本地存储的浮层坐标。
 */
interface OverlayStoredPosition {
  /** 浮层的 left 坐标。 */
  left: number;
  /** 浮层的 top 坐标。 */
  top: number;
}

const tooltipState = ref<OverlayTooltipState>({
  visible: false,
  label: '',
  left: 0,
  top: 0,
  placement: 'top'
});

watch(open, () => {
  globalThis.requestAnimationFrame(() => {
    handleWindowResize();
  });
});

/**
 * 读取当前浮层用于定位的内联样式。
 *
 * 初次挂载前继续使用 CSS 默认位置，
 * 读取到真实布局后再切换成 top / left 固定定位，
 * 这样拖拽时不会和 `bottom` 锚点互相打架。
 */
const overlayStyle = computed(() => {
  if (!floatingPosition.value) {
    return undefined;
  }

  return {
    left: `${floatingPosition.value.left}px`,
    top: `${floatingPosition.value.top}px`,
    right: 'auto',
    bottom: 'auto'
  };
});

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
  hideTooltip();
  open.value = !open.value;
}

/**
 * 读取当前展开按钮的即时文案。
 */
function resolveCollapseLabel(): string {
  return open.value ? '最小化' : '展开';
}

/**
 * 读取顶部清空日志按钮的提示文案。
 */
function resolveResetLabel(): string {
  return '清空日志';
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

/**
 * 判断当前是否允许把浮层位置写入本地存储。
 */
function shouldRememberPosition(): boolean {
  return props.rememberPosition && props.positionStorageKey.trim().length > 0;
}

/**
 * 从本地存储中读取上一次拖拽保存的浮层位置。
 */
function readStoredPosition(): OverlayStoredPosition | null {
  if (!shouldRememberPosition()) {
    return null;
  }

  try {
    const rawValue = globalThis.localStorage?.getItem(props.positionStorageKey);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<OverlayStoredPosition>;

    return typeof parsed.left === 'number' && typeof parsed.top === 'number'
      ? {
          left: parsed.left,
          top: parsed.top
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * 把当前浮层位置写入本地存储，供下次挂载恢复。
 */
function writeStoredPosition(position: OverlayStoredPosition | null) {
  if (!shouldRememberPosition() || !position) {
    return;
  }

  try {
    globalThis.localStorage?.setItem(props.positionStorageKey, JSON.stringify(position));
  } catch {
    // 写入失败时静默跳过，避免打断浮层交互。
  }
}

/**
 * 读取当前浮层应该遵守的最小安全边距。
 */
function resolveViewportMargin(): number {
  return globalThis.innerWidth <= 720 ? 12 : 20;
}

/**
 * 把浮层位置限制在可视区域内，避免被拖出屏幕。
 */
function clampOverlayPosition(left: number, top: number) {
  const overlay = overlayRef.value;
  const margin = resolveViewportMargin();
  const width = overlay?.offsetWidth ?? 420;
  const height = overlay?.offsetHeight ?? 320;
  const maxLeft = Math.max(margin, globalThis.innerWidth - width - margin);
  const maxTop = Math.max(margin, globalThis.innerHeight - height - margin);

  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop)
  };
}

/**
 * 基于当前真实布局初始化一份可拖拽的 top / left 定位。
 */
function syncFloatingPositionFromLayout() {
  const storedPosition = readStoredPosition();

  if (storedPosition) {
    floatingPosition.value = clampOverlayPosition(storedPosition.left, storedPosition.top);
    return;
  }

  const overlay = overlayRef.value;

  if (!overlay) {
    return;
  }

  const rect = overlay.getBoundingClientRect();
  floatingPosition.value = clampOverlayPosition(rect.left, rect.top);
}

/**
 * 在窗口尺寸变化后把浮层重新夹回可视区域。
 */
function handleWindowResize() {
  hideTooltip();

  if (!floatingPosition.value) {
    syncFloatingPositionFromLayout();
    return;
  }

  floatingPosition.value = clampOverlayPosition(
    floatingPosition.value.left,
    floatingPosition.value.top
  );
  writeStoredPosition(floatingPosition.value);
}

/**
 * 停止当前拖拽会话，并清理全局监听器。
 */
function stopDrag(pointerId?: number) {
  if (pointerId !== undefined && dragPointerId !== pointerId) {
    return;
  }

  dragging.value = false;
  dragPointerId = null;
  globalThis.removeEventListener('pointermove', handleWindowPointerMove);
  globalThis.removeEventListener('pointerup', handleWindowPointerUp);
  globalThis.removeEventListener('pointercancel', handleWindowPointerUp);
  document.body.style.userSelect = '';

  writeStoredPosition(floatingPosition.value);
}

/**
 * 拖拽过程中实时更新浮层位置。
 */
function handleWindowPointerMove(event: PointerEvent) {
  if (!dragging.value || dragPointerId !== event.pointerId) {
    return;
  }

  floatingPosition.value = clampOverlayPosition(
    dragStartLeft + event.clientX - dragStartClientX,
    dragStartTop + event.clientY - dragStartClientY
  );
}

/**
 * pointer 抬起或取消时结束拖拽。
 */
function handleWindowPointerUp(event: PointerEvent) {
  stopDrag(event.pointerId);
}

/**
 * 从顶部拖拽手柄开始一次新的拖拽会话。
 */
function startDrag(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  if (!floatingPosition.value) {
    syncFloatingPositionFromLayout();
  }

  if (!floatingPosition.value) {
    return;
  }

  dragPointerId = event.pointerId;
  dragStartClientX = event.clientX;
  dragStartClientY = event.clientY;
  dragStartLeft = floatingPosition.value.left;
  dragStartTop = floatingPosition.value.top;
  dragging.value = true;
  document.body.style.userSelect = 'none';
  globalThis.addEventListener('pointermove', handleWindowPointerMove);
  globalThis.addEventListener('pointerup', handleWindowPointerUp);
  globalThis.addEventListener('pointercancel', handleWindowPointerUp);
}

onMounted(() => {
  globalThis.requestAnimationFrame(() => {
    syncFloatingPositionFromLayout();
  });
  globalThis.addEventListener('resize', handleWindowResize);
});

onBeforeUnmount(() => {
  clearCopyTimer();
  stopDrag();
  globalThis.removeEventListener('resize', handleWindowResize);
});

/**
 * 把当前最小复现包复制成 JSON。
 */
async function copyReproduction() {
  hideTooltip();

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

/**
 * 清空 devtools 日志，并关闭当前 tooltip。
 */
function resetDevtools() {
  hideTooltip();
  props.devtools.reset();
}

/**
 * 隐藏当前悬浮提示。
 */
function hideTooltip() {
  tooltipState.value.visible = false;
}

/**
 * 根据按钮位置计算 tooltip 的 fixed 定位。
 */
function showTooltip(event: MouseEvent | FocusEvent, label: string) {
  const target = event.currentTarget;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const placement: OverlayTooltipState['placement'] = rect.top >= 48 ? 'top' : 'bottom';
  tooltipState.value = {
    visible: true,
    label,
    left: rect.right,
    top: placement === 'top'
      ? rect.top - 8
      : rect.bottom + 8,
    placement
  };
}
</script>

<template>
  <aside
    ref="overlayRef"
    class="agentdown-devtools-overlay"
    :data-open="open ? 'true' : 'false'"
    :data-dragging="dragging ? 'true' : 'false'"
    :style="overlayStyle"
  >
    <header class="agentdown-devtools-overlay__header">
      <div
        class="agentdown-devtools-overlay__header-main"
        title="拖动面板"
        @pointerdown.stop.prevent="startDrag"
      >
        <div class="agentdown-devtools-overlay__title">
          <span>{{ title }}</span>
          <strong>{{ totalLogCount }}</strong>
        </div>
      </div>

      <div
        class="agentdown-devtools-overlay__actions"
        :data-open="open ? 'true' : 'false'"
      >
        <button
          type="button"
          class="agentdown-devtools-overlay__icon-action agentdown-devtools-overlay__icon-action--primary"
          :aria-label="resolveCollapseLabel()"
          @mouseenter="showTooltip($event, resolveCollapseLabel())"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, resolveCollapseLabel())"
          @blur="hideTooltip"
          @click="toggleOpen"
        >
          <svg
            v-if="open"
            class="agentdown-devtools-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <rect
              x="3.5"
              y="4.5"
              width="13"
              height="11"
              rx="1.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M3.5 7.5h13M7.2 11.3h5.6"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
          </svg>
          <svg
            v-else
            class="agentdown-devtools-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <rect
              x="3.5"
              y="4.5"
              width="13"
              height="11"
              rx="1.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M3.5 7.5h13M8 12l4-4M9.4 8h2.6v2.6"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
          </svg>
        </button>

        <button
          v-if="open"
          type="button"
          class="agentdown-devtools-overlay__icon-action"
          :aria-label="resolveResetLabel()"
          @mouseenter="showTooltip($event, resolveResetLabel())"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, resolveResetLabel())"
          @blur="hideTooltip"
          @click="resetDevtools"
        >
          <svg
            class="agentdown-devtools-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M7 4.5h6M4.5 6h11M8 4.5l.4-1.1A1 1 0 0 1 9.34 3h1.32a1 1 0 0 1 .94.4L12 4.5M6.5 6l.6 8.1A1.6 1.6 0 0 0 8.7 15.5h2.6a1.6 1.6 0 0 0 1.6-1.4l.6-8.1M8.6 8.5v4.2M11.4 8.5v4.2"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
          </svg>
        </button>

        <button
          v-if="open"
          type="button"
          class="agentdown-devtools-overlay__icon-action"
          :aria-label="resolveReproductionCopyLabel()"
          @mouseenter="showTooltip($event, resolveReproductionCopyLabel())"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, resolveReproductionCopyLabel())"
          @blur="hideTooltip"
          @click="copyReproduction().catch(() => {})"
        >
          <svg
            v-if="globalCopyTarget === 'reproduction' && copyState === 'copied'"
            class="agentdown-devtools-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M4.5 10.5 8 14l7.5-8"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
          </svg>
          <svg
            v-else-if="globalCopyTarget === 'reproduction' && copyState === 'failed'"
            class="agentdown-devtools-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M6 6l8 8M14 6l-8 8"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
          </svg>
          <svg
            v-else
            class="agentdown-devtools-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M7 5.5h6M10 5.5v9M6 9l4-4 4 4M6 14.5h8"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
          </svg>
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

  <Teleport to="body">
    <div
      v-if="tooltipState.visible"
      class="agentdown-devtools-overlay__tooltip"
      :data-placement="tooltipState.placement"
      :style="{
        left: `${tooltipState.left}px`,
        top: `${tooltipState.top}px`
      }"
    >
      {{ tooltipState.label }}
    </div>
  </Teleport>
</template>

<style scoped>
.agentdown-devtools-overlay {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 60;
  width: min(560px, calc(100vw - 24px));
  max-height: min(calc(100vh - 24px), 820px);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.agentdown-devtools-overlay[data-open='true'] {
  height: min(720px, calc(100vh - 24px));
}

.agentdown-devtools-overlay[data-open='false'] {
  width: auto;
  height: auto;
  max-width: min(320px, calc(100vw - 24px));
}

.agentdown-devtools-overlay[data-dragging='true'] {
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22);
}

.agentdown-devtools-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px;
  flex: 0 0 auto;
}

.agentdown-devtools-overlay__header-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.agentdown-devtools-overlay__title,
.agentdown-devtools-overlay__action,
.agentdown-devtools-overlay__icon-action,
.agentdown-devtools-overlay__tab {
  color: inherit;
  font: inherit;
}

.agentdown-devtools-overlay__action,
.agentdown-devtools-overlay__icon-action,
.agentdown-devtools-overlay__tab {
  border: 0;
  background: transparent;
}

.agentdown-devtools-overlay__header-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  cursor: grab;
  touch-action: none;
}

.agentdown-devtools-overlay[data-dragging='true'] .agentdown-devtools-overlay__header-main {
  cursor: grabbing;
}

.agentdown-devtools-overlay__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.agentdown-devtools-overlay__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-devtools-overlay__title strong {
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
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: 0;
}

.agentdown-devtools-overlay__actions[data-open='false'] {
  gap: 0;
}

.agentdown-devtools-overlay__action {
  border-radius: 999px;
  padding: 6px 10px;
  background: #f1f5f9;
  color: #334155;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.agentdown-devtools-overlay__icon-action {
  padding: 2px;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.agentdown-devtools-overlay__icon-action:hover {
  color: #0f172a;
}

.agentdown-devtools-overlay__icon-action--primary {
  color: #1d4ed8;
}

.agentdown-devtools-overlay__icon {
  display: block;
  width: 18px;
  height: 18px;
}

.agentdown-devtools-overlay__tooltip {
  position: fixed;
  transform: translate(-100%, -100%);
  pointer-events: none;
  border-radius: 8px;
  padding: 4px 8px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
  z-index: 120;
}

.agentdown-devtools-overlay__tooltip[data-placement='bottom'] {
  transform: translate(-100%, 0);
}

.agentdown-devtools-overlay__panel {
  flex: 1 1 auto;
  border-top: 1px solid rgba(226, 232, 240, 0.92);
  padding: 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
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
  box-sizing: border-box;
  min-width: 0;
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
  max-height: 260px;
  overflow: auto;
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
    width: min(560px, calc(100vw - 24px));
  }

  .agentdown-devtools-overlay[data-open='true'] {
    height: min(680px, calc(100vh - 24px));
  }

  .agentdown-devtools-overlay[data-open='false'] {
    max-width: calc(100vw - 24px);
  }
}
</style>
