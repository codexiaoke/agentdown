<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRuntimeSnapshot } from '../composables/useRuntimeSnapshot';
import type { AgentRuntime } from '../runtime/types';
import type {
  RunSurfaceDraftDiagnostic,
  RunSurfaceDraftDiagnosticsResult
} from '../devtools/runSurfaceDraftDiagnostics';
import {
  resolveRunSurfaceDraftDiagnostics
} from '../devtools/runSurfaceDraftDiagnostics';

/**
 * `RunSurfaceDraftOverlay` 的组件输入参数。
 */
interface Props {
  /** 当前要观察的 runtime。 */
  runtime: AgentRuntime;
  /** 只分析指定 slot 下的 draft block。 */
  slot?: string;
  /** overlay 标题。 */
  title?: string;
  /** 没有 draft 时显示的文案。 */
  emptyText?: string;
  /** 首次渲染时是否默认展开。 */
  initiallyOpen?: boolean;
  /** 当页面里首次出现 draft 时是否自动展开。 */
  autoOpenOnDraft?: boolean;
  /** 最多显示最近多少条 draft 诊断。 */
  maxItems?: number;
  /** 是否记住用户上一次拖拽后的浮层位置。 */
  rememberPosition?: boolean;
  /** 记住浮层位置时使用的本地存储 key。 */
  positionStorageKey?: string;
}

const props = withDefaults(defineProps<Props>(), {
  slot: 'main',
  title: 'Draft Devtools',
  emptyText: '当前没有进行中的 draft block。',
  initiallyOpen: false,
  autoOpenOnDraft: true,
  maxItems: 6,
  rememberPosition: true,
  positionStorageKey: 'agentdown:overlay:draft:position'
});

const open = ref(props.initiallyOpen);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const snapshotState = useRuntimeSnapshot(() => props.runtime);
const overlayRef = ref<HTMLElement | null>(null);
const floatingPosition = ref<{
  left: number;
  top: number;
} | null>(null);
const dragging = ref(false);
let copyStateTimer: number | undefined;
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

/**
 * 读取当前浮层用于定位的内联样式。
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
 * 计算当前 runtime 对应的 draft 诊断结果。
 */
const diagnosticsResult = computed<RunSurfaceDraftDiagnosticsResult>(() => {
  return resolveRunSurfaceDraftDiagnostics(snapshotState.snapshot.value, {
    slot: props.slot
  });
});

/**
 * 读取当前 slot 下仍处于 draft 的总数。
 */
const draftCount = computed(() => diagnosticsResult.value.summary.draftBlockCount);

/**
 * 读取当前 overlay 实际展示的诊断条目。
 *
 * 默认保留最后几条，更贴近用户当前正在看到的尾部内容。
 */
const visibleDiagnostics = computed<RunSurfaceDraftDiagnostic[]>(() => {
  const maxItems = Math.max(1, props.maxItems);
  return diagnosticsResult.value.diagnostics.slice(-maxItems);
});

/**
 * 读取被折叠掉但仍然存在的 draft 条目数量。
 */
const hiddenDiagnosticsCount = computed(() => {
  return Math.max(0, diagnosticsResult.value.diagnostics.length - visibleDiagnostics.value.length);
});

/**
 * 生成当前 overlay 可直接复制的调试快照。
 */
const exportSnapshot = computed(() => ({
  schemaVersion: 1 as const,
  generatedAt: new Date().toISOString(),
  slot: props.slot,
  summary: diagnosticsResult.value.summary,
  diagnostics: diagnosticsResult.value.diagnostics
}));

watch(
  draftCount,
  (nextDraftCount, previousDraftCount) => {
    if (!props.autoOpenOnDraft) {
      return;
    }

    if (nextDraftCount > 0 && (previousDraftCount ?? 0) === 0) {
      open.value = true;
    }
  }
);

watch(open, () => {
  globalThis.requestAnimationFrame(() => {
    handleWindowResize();
  });
});

/**
 * 清理复制状态的短暂反馈定时器。
 */
function clearCopyStateTimer() {
  if (copyStateTimer !== undefined) {
    globalThis.clearTimeout(copyStateTimer);
    copyStateTimer = undefined;
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
  const height = overlay?.offsetHeight ?? 300;
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
  clearCopyStateTimer();
  stopDrag();
  globalThis.removeEventListener('resize', handleWindowResize);
});

/**
 * 切换 overlay 当前的展开状态。
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
 * 读取复制诊断快照按钮的即时文案。
 */
function resolveCopyDiagnosticsLabel(): string {
  return copyState.value === 'copied'
    ? '已复制'
    : copyState.value === 'failed'
      ? '复制失败'
      : '复制 JSON';
}

/**
 * 把当前 draft 诊断快照复制成 JSON。
 */
async function copyDiagnostics(): Promise<void> {
  hideTooltip();

  try {
    await navigator.clipboard.writeText(JSON.stringify(exportSnapshot.value, null, 2));
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }

  clearCopyStateTimer();
  copyStateTimer = globalThis.setTimeout(() => {
    copyState.value = 'idle';
    copyStateTimer = undefined;
  }, 3000);
}

/**
 * 把时间戳格式化成更适合面板阅读的本地时间。
 */
function formatTimestamp(value: number | undefined): string {
  if (!value) {
    return '未记录';
  }

  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false
  });
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
    class="agentdown-draft-overlay"
    :data-open="open ? 'true' : 'false'"
    :data-dragging="dragging ? 'true' : 'false'"
    :style="overlayStyle"
  >
    <header class="agentdown-draft-overlay__header">
      <div
        class="agentdown-draft-overlay__header-main"
        title="拖动面板"
        @pointerdown.stop.prevent="startDrag"
      >
        <div class="agentdown-draft-overlay__title">
          <span>{{ title }}</span>
          <strong>{{ draftCount }}</strong>
        </div>
      </div>

      <div
        class="agentdown-draft-overlay__actions"
        :data-open="open ? 'true' : 'false'"
      >
        <button
          type="button"
          class="agentdown-draft-overlay__icon-action agentdown-draft-overlay__icon-action--primary"
          :aria-label="resolveCollapseLabel()"
          @mouseenter="showTooltip($event, resolveCollapseLabel())"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, resolveCollapseLabel())"
          @blur="hideTooltip"
          @click="toggleOpen"
        >
          <svg
            v-if="open"
            class="agentdown-draft-overlay__icon"
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
            class="agentdown-draft-overlay__icon"
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
          class="agentdown-draft-overlay__icon-action"
          :aria-label="resolveCopyDiagnosticsLabel()"
          @mouseenter="showTooltip($event, resolveCopyDiagnosticsLabel())"
          @mouseleave="hideTooltip"
          @focus="showTooltip($event, resolveCopyDiagnosticsLabel())"
          @blur="hideTooltip"
          @click="copyDiagnostics().catch(() => {})"
        >
          <svg
            v-if="copyState === 'copied'"
            class="agentdown-draft-overlay__icon"
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
            v-else-if="copyState === 'failed'"
            class="agentdown-draft-overlay__icon"
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
            class="agentdown-draft-overlay__icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M7 7.5V5.8a1.8 1.8 0 0 1 1.8-1.8h5.4A1.8 1.8 0 0 1 16 5.8v5.4A1.8 1.8 0 0 1 14.2 13H12.5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.6"
            />
            <rect
              x="4"
              y="7"
              width="9"
              height="9"
              rx="1.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            />
          </svg>
        </button>
      </div>
    </header>

    <div
      v-if="open"
      class="agentdown-draft-overlay__panel"
    >
      <div class="agentdown-draft-overlay__stats">
        <span>总 block：{{ diagnosticsResult.summary.totalBlockCount }}</span>
        <span>draft：{{ diagnosticsResult.summary.draftBlockCount }}</span>
        <span>preview：{{ diagnosticsResult.summary.previewModeCount }}</span>
        <span>hidden：{{ diagnosticsResult.summary.hiddenModeCount }}</span>
      </div>

      <p
        v-if="visibleDiagnostics.length === 0"
        class="agentdown-draft-overlay__empty"
      >
        {{ emptyText }}
      </p>

      <ol
        v-else
        class="agentdown-draft-overlay__list"
      >
        <li
          v-for="diagnostic in visibleDiagnostics"
          :key="diagnostic.blockId"
          class="agentdown-draft-overlay__item"
        >
          <div class="agentdown-draft-overlay__item-head">
            <strong>{{ diagnostic.reason.title }}</strong>
            <span>{{ formatTimestamp(diagnostic.updatedAt) }}</span>
          </div>

          <p class="agentdown-draft-overlay__item-desc">
            {{ diagnostic.reason.description }}
          </p>

          <div class="agentdown-draft-overlay__chips">
            <span>data-draft-mode={{ diagnostic.domAttributes['data-draft-mode'] }}</span>
            <span v-if="diagnostic.domAttributes['data-draft-kind']">
              data-draft-kind={{ diagnostic.domAttributes['data-draft-kind'] }}
            </span>
            <span v-if="diagnostic.domAttributes['data-draft-stability']">
              data-draft-stability={{ diagnostic.domAttributes['data-draft-stability'] }}
            </span>
            <span v-if="diagnostic.domAttributes['data-draft-multiline']">
              data-draft-multiline={{ diagnostic.domAttributes['data-draft-multiline'] }}
            </span>
          </div>

          <dl class="agentdown-draft-overlay__meta">
            <div>
              <dt>renderer</dt>
              <dd>{{ diagnostic.renderer }}</dd>
            </div>
            <div>
              <dt>blockId</dt>
              <dd>{{ diagnostic.blockId }}</dd>
            </div>
            <div v-if="diagnostic.nodeId">
              <dt>node</dt>
              <dd>{{ diagnostic.nodeTitle ?? diagnostic.nodeId }}</dd>
            </div>
            <div v-if="diagnostic.nodeStatus">
              <dt>status</dt>
              <dd>{{ diagnostic.nodeStatus }}</dd>
            </div>
            <div>
              <dt>kind</dt>
              <dd>{{ diagnostic.draftKindLabel }}</dd>
            </div>
            <div>
              <dt>stability</dt>
              <dd>{{ diagnostic.draftStabilityLabel }}</dd>
            </div>
          </dl>

          <pre class="agentdown-draft-overlay__preview">{{ diagnostic.contentPreview }}</pre>
        </li>
      </ol>

      <p
        v-if="hiddenDiagnosticsCount > 0"
        class="agentdown-draft-overlay__more"
      >
        还有 {{ hiddenDiagnosticsCount }} 条较早的 draft 未展开。
      </p>
    </div>
  </aside>

  <Teleport to="body">
    <div
      v-if="tooltipState.visible"
      class="agentdown-draft-overlay__tooltip"
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
.agentdown-draft-overlay {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  width: min(440px, calc(100vw - 24px));
  max-height: min(calc(100vh - 24px), 780px);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.agentdown-draft-overlay[data-open='false'] {
  width: auto;
  max-width: min(320px, calc(100vw - 24px));
}

.agentdown-draft-overlay[data-dragging='true'] {
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22);
}

.agentdown-draft-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px;
  flex: 0 0 auto;
}

.agentdown-draft-overlay__header-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.agentdown-draft-overlay__title,
.agentdown-draft-overlay__icon-action {
  color: inherit;
  font: inherit;
}

.agentdown-draft-overlay__header-main {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  cursor: grab;
  touch-action: none;
}

.agentdown-draft-overlay[data-dragging='true'] .agentdown-draft-overlay__header-main {
  cursor: grabbing;
}

.agentdown-draft-overlay__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.agentdown-draft-overlay__title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-draft-overlay__title strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.agentdown-draft-overlay__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: 0;
}

.agentdown-draft-overlay__icon-action {
  border: 0;
  padding: 2px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.agentdown-draft-overlay__icon-action:hover {
  color: #0f172a;
}

.agentdown-draft-overlay__icon-action--primary {
  color: #1d4ed8;
}

.agentdown-draft-overlay__icon {
  display: block;
  width: 18px;
  height: 18px;
}

.agentdown-draft-overlay__tooltip {
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

.agentdown-draft-overlay__tooltip[data-placement='bottom'] {
  transform: translate(-100%, 0);
}

.agentdown-draft-overlay__panel {
  border-top: 1px solid rgba(226, 232, 240, 0.92);
  padding: 0 12px 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.agentdown-draft-overlay__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding-top: 12px;
  color: #64748b;
  font-size: 12px;
}

.agentdown-draft-overlay__empty,
.agentdown-draft-overlay__more {
  margin: 12px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.agentdown-draft-overlay__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.agentdown-draft-overlay__item {
  border-radius: 14px;
  padding: 12px;
  background: #f8fafc;
}

.agentdown-draft-overlay__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agentdown-draft-overlay__item-head strong {
  font-size: 13px;
}

.agentdown-draft-overlay__item-head span {
  color: #64748b;
  font-size: 11px;
}

.agentdown-draft-overlay__item-desc {
  margin: 8px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.agentdown-draft-overlay__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.agentdown-draft-overlay__chips span {
  border-radius: 999px;
  padding: 4px 8px;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
}

.agentdown-draft-overlay__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 10px 0 0;
}

.agentdown-draft-overlay__meta div {
  min-width: 0;
}

.agentdown-draft-overlay__meta dt {
  color: #94a3b8;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.agentdown-draft-overlay__meta dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 11px;
  line-height: 1.5;
}

.agentdown-draft-overlay__preview {
  margin: 10px 0 0;
  border-radius: 12px;
  padding: 10px;
  max-height: 220px;
  overflow: auto;
  background: #ffffff;
  color: #0f172a;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .agentdown-draft-overlay {
    right: 12px;
    bottom: 12px;
    width: min(440px, calc(100vw - 24px));
  }
}
</style>
