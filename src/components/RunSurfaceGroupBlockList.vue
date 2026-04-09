<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type {
  AguiComponentMap,
  MarkdownBuiltinComponents
} from '../core/types';
import type {
  AgentRuntime,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';
import type {
  RunSurfaceApprovalActionsOptions,
  RunSurfaceDraftPlaceholder,
  RunSurfaceHandoffActionsOptions,
  RunSurfaceMessageShellMap,
  RunSurfaceRendererMap,
  RunSurfaceRole
} from '../surface/types';
import {
  buildMarkdownHeightPrefixSums,
  findMarkdownWindowRange,
  parseMarkdownVirtualOverscan,
  shouldRetainMarkdownWindowRange
} from './markdownWindowing';
import {
  estimateSurfaceBlockHeight,
  RUN_SURFACE_BLOCK_GAP,
  shouldMeasureSurfaceBlockHeight
} from './runSurfaceBlockPerformance';
import { hasSurfaceBlockVisibleContent } from '../surface/renderUtils';
import RunSurfaceBlock from './RunSurfaceBlock.vue';
import RunSurfaceMeasuredBlock from './RunSurfaceMeasuredBlock.vue';

/**
 * `RunSurfaceGroupBlockList` 的输入参数。
 * 这个组件负责在单条消息内部，对大量 surface block 做窗口化挂载。
 */
interface Props {
  blocks: SurfaceBlock[];
  role: RunSurfaceRole;
  runtime: AgentRuntime;
  snapshot: RuntimeSnapshot;
  width: number;
  lineHeight: number;
  font: string;
  aguiComponents: AguiComponentMap;
  builtinComponents: MarkdownBuiltinComponents;
  renderers: RunSurfaceRendererMap;
  draftPlaceholder: RunSurfaceDraftPlaceholder;
  messageShells: RunSurfaceMessageShellMap;
  approvalActions: RunSurfaceApprovalActionsOptions | false | undefined;
  handoffActions: RunSurfaceHandoffActionsOptions | false | undefined;
  lazyMount: boolean;
  lazyMountMargin: string;
  textSlabChars: number;
  virtualize: boolean;
  virtualizeMargin: string;
  virtualizeThreshold: number;
}

/**
 * 当前已经挂载到 DOM 中的一条 block 项。
 */
interface MountedSurfaceBlockEntry {
  block: SurfaceBlock;
  index: number;
  gapAfter: number;
  shouldMeasure: boolean;
}

const props = defineProps<Props>();

const containerRef = ref<HTMLElement | null>(null);
const mountedStartIndex = ref(0);
const mountedEndIndex = ref(0);
const measuredHeights = shallowRef<Record<string, number>>({});

let observer: ResizeObserver | null = null;
let viewportRaf = 0;
let measuredHeightFlushRaf = 0;
let pendingMeasuredHeights: Record<string, number> = {};

/**
 * 当前消息组是否真的需要启动窗口化。
 * 小消息全部直接挂载，避免额外观察器和 spacer 成本。
 */
const shouldVirtualize = computed(() => {
  return props.virtualize && props.blocks.length >= props.virtualizeThreshold;
});

/**
 * 把前面是否已经出现可见内容预先算成数组，避免每个 block 都重复 slice + some。
 */
const hasVisibleContentBeforeFlags = computed(() => {
  let seenVisibleContent = false;

  return props.blocks.map((block) => {
    const hasVisibleContentBefore = seenVisibleContent;

    if (hasSurfaceBlockVisibleContent(block)) {
      seenVisibleContent = true;
    }

    return hasVisibleContentBefore;
  });
});

/**
 * 读取当前窗口化使用的 overscan 配置。
 */
const virtualOverscan = computed(() => {
  return parseMarkdownVirtualOverscan(props.virtualizeMargin);
});

/**
 * 让窗口边缘的缓冲区更厚一点，减少滚动时换窗抖动。
 */
const retainedOverscan = computed(() => ({
  top: Math.max(virtualOverscan.value.top * 2, 1600),
  bottom: Math.max(virtualOverscan.value.bottom * 2, 1600)
}));

/**
 * 为每个 block 附上组内默认间距，和当前消息栈的视觉间距保持一致。
 */
const blockGaps = computed(() => {
  return props.blocks.map((_, index) => {
    return index < props.blocks.length - 1 ? RUN_SURFACE_BLOCK_GAP : 0;
  });
});

/**
 * 估算每个 block 在当前宽度下对应的 slot 高度。
 * 如果已经测到真实高度，则优先用真实值纠正。
 */
const blockSlotHeights = computed(() => {
  return props.blocks.map((block, index) => {
    const contentHeight = measuredHeights.value[block.id]
      ?? estimateSurfaceBlockHeight(block, props.width, props.lineHeight, props.font);
    const gapAfter = blockGaps.value[index] ?? 0;

    return contentHeight + gapAfter;
  });
});

/**
 * 把 block 高度数组收敛成前缀和，后续滚动窗口查找直接复用。
 */
const heightPrefixSums = computed(() => {
  return buildMarkdownHeightPrefixSums(blockSlotHeights.value);
});

/**
 * 当前消息组在虚拟列表中的总高度。
 */
const totalVirtualHeight = computed(() => {
  return heightPrefixSums.value[heightPrefixSums.value.length - 1] ?? 0;
});

/**
 * 当前真正需要挂载的 block 窗口。
 */
const mountedWindow = computed(() => {
  if (!shouldVirtualize.value) {
    return {
      startIndex: 0,
      endIndex: props.blocks.length
    };
  }

  return {
    startIndex: mountedStartIndex.value,
    endIndex: mountedEndIndex.value
  };
});

/**
 * 当前窗口实际要渲染的 block 列表。
 */
const mountedEntries = computed<MountedSurfaceBlockEntry[]>(() => {
  return props.blocks
    .slice(mountedWindow.value.startIndex, mountedWindow.value.endIndex)
    .map((block, offset) => {
      const index = mountedWindow.value.startIndex + offset;

      return {
        block,
        index,
        gapAfter: blockGaps.value[index] ?? 0,
        shouldMeasure: shouldMeasureSurfaceBlockHeight(block)
      };
    });
});

/**
 * 当前挂载窗口上方需要补出来的 spacer 高度。
 */
const topSpacerHeight = computed(() => {
  return heightPrefixSums.value[mountedWindow.value.startIndex] ?? 0;
});

/**
 * 当前挂载窗口下方需要补出来的 spacer 高度。
 */
const bottomSpacerHeight = computed(() => {
  return Math.max(0, totalVirtualHeight.value - (heightPrefixSums.value[mountedWindow.value.endIndex] ?? 0));
});

/**
 * 取消当前排队中的视口同步任务。
 */
function cancelViewportSync() {
  if (viewportRaf === 0 || typeof window === 'undefined') {
    return;
  }

  window.cancelAnimationFrame(viewportRaf);
  viewportRaf = 0;
}

/**
 * 取消当前排队中的高度批量写入任务。
 */
function cancelMeasuredHeightFlush() {
  if (measuredHeightFlushRaf !== 0 && typeof window !== 'undefined') {
    window.cancelAnimationFrame(measuredHeightFlushRaf);
  }

  measuredHeightFlushRaf = 0;
  pendingMeasuredHeights = {};
}

/**
 * 根据当前消息组相对视口的位置，同步真正需要挂载的 block 窗口。
 */
function syncViewportWindow() {
  viewportRaf = 0;

  if (!shouldVirtualize.value || !containerRef.value || typeof window === 'undefined') {
    mountedStartIndex.value = 0;
    mountedEndIndex.value = props.blocks.length;
    return;
  }

  const rect = containerRef.value.getBoundingClientRect();
  const viewportTop = Math.max(0, -rect.top);
  const viewportBottom = Math.max(viewportTop, window.innerHeight - rect.top);

  if (
    shouldRetainMarkdownWindowRange(
      heightPrefixSums.value,
      {
        startIndex: mountedStartIndex.value,
        endIndex: mountedEndIndex.value
      },
      viewportTop,
      viewportBottom,
      virtualOverscan.value
    )
  ) {
    return;
  }

  const overscan = retainedOverscan.value;
  const nextRange = findMarkdownWindowRange(
    heightPrefixSums.value,
    Math.max(0, viewportTop - overscan.top),
    viewportBottom + overscan.bottom
  );

  if (
    nextRange.startIndex === mountedStartIndex.value
    && nextRange.endIndex === mountedEndIndex.value
  ) {
    return;
  }

  mountedStartIndex.value = nextRange.startIndex;
  mountedEndIndex.value = nextRange.endIndex;
}

/**
 * 把视口同步收敛到一帧里，避免滚动时每次事件都同步重算窗口。
 */
function scheduleViewportSync() {
  if (viewportRaf !== 0 || typeof window === 'undefined') {
    return;
  }

  viewportRaf = window.requestAnimationFrame(() => {
    syncViewportWindow();
  });
}

/**
 * 把收集到的一批真实高度一次性写回响应式状态，减少对象复制。
 */
function flushMeasuredHeights() {
  measuredHeightFlushRaf = 0;

  const entries = Object.entries(pendingMeasuredHeights);

  if (entries.length === 0) {
    return;
  }

  pendingMeasuredHeights = {};

  const nextHeights: Record<string, number> = {
    ...measuredHeights.value
  };
  let changed = false;

  for (const [blockId, height] of entries) {
    if (nextHeights[blockId] === height) {
      continue;
    }

    nextHeights[blockId] = height;
    changed = true;
  }

  if (!changed) {
    return;
  }

  measuredHeights.value = nextHeights;
  scheduleViewportSync();
}

/**
 * 把同一帧内的高度变化合并处理，避免 mounted block 成批出现时反复触发窗口重算。
 */
function scheduleMeasuredHeightFlush() {
  if (typeof window === 'undefined') {
    flushMeasuredHeights();
    return;
  }

  if (measuredHeightFlushRaf !== 0) {
    return;
  }

  measuredHeightFlushRaf = window.requestAnimationFrame(() => {
    flushMeasuredHeights();
  });
}

/**
 * 记录真实渲染高度，供后续修正 spacer 和窗口范围。
 */
function updateMeasuredHeight(blockId: string, height: number) {
  const normalizedHeight = Math.max(0, Math.ceil(height));

  if (
    measuredHeights.value[blockId] === normalizedHeight
    || pendingMeasuredHeights[blockId] === normalizedHeight
  ) {
    return;
  }

  pendingMeasuredHeights[blockId] = normalizedHeight;
  scheduleMeasuredHeightFlush();
}

watch(
  () => props.width,
  () => {
    cancelMeasuredHeightFlush();
    measuredHeights.value = {};
    scheduleViewportSync();
  }
);

watch(
  () => props.blocks.map((block) => block.id),
  (ids) => {
    cancelMeasuredHeightFlush();
    const nextHeights: Record<string, number> = {};

    for (const id of ids) {
      const height = measuredHeights.value[id];

      if (height !== undefined) {
        nextHeights[id] = height;
      }
    }

    measuredHeights.value = nextHeights;
    scheduleViewportSync();
  },
  {
    immediate: true
  }
);

watch(
  [shouldVirtualize, () => props.virtualizeMargin, () => props.blocks.length],
  () => {
    scheduleViewportSync();
  }
);

onMounted(() => {
  syncViewportWindow();

  observer = new ResizeObserver(() => {
    scheduleViewportSync();
  });

  if (containerRef.value) {
    observer.observe(containerRef.value);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', scheduleViewportSync, {
      passive: true
    });
    window.addEventListener('resize', scheduleViewportSync);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  cancelViewportSync();
  cancelMeasuredHeightFlush();

  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', scheduleViewportSync);
    window.removeEventListener('resize', scheduleViewportSync);
  }
});
</script>

<template>
  <div
    ref="containerRef"
    class="agentdown-run-surface-group-block-list"
    :data-virtualized="shouldVirtualize ? 'true' : 'false'"
    :data-mounted-blocks="mountedWindow.endIndex - mountedWindow.startIndex"
  >
    <template v-if="!shouldVirtualize">
      <RunSurfaceBlock
        v-for="(block, index) in blocks"
        :key="block.id"
        :block="block"
        :role="role"
        :runtime="runtime"
        :snapshot="snapshot"
        :width="width"
        :line-height="lineHeight"
        :font="font"
        :agui-components="aguiComponents"
        :builtin-components="builtinComponents"
        :renderers="renderers"
        :draft-placeholder="draftPlaceholder"
        :message-shells="messageShells"
        :approval-actions="approvalActions"
        :handoff-actions="handoffActions"
        :lazy-mount="lazyMount"
        :lazy-mount-margin="lazyMountMargin"
        :text-slab-chars="textSlabChars"
        :has-visible-content-before="hasVisibleContentBeforeFlags[index] ?? false"
      />
    </template>

    <div
      v-else
      class="agentdown-run-surface-group-block-list__virtualized"
    >
      <div
        v-if="topSpacerHeight > 0"
        class="agentdown-run-surface-group-block-list__spacer"
        :style="{ height: `${topSpacerHeight}px` }"
      />

      <template
        v-for="entry in mountedEntries"
        :key="entry.block.id"
      >
        <RunSurfaceMeasuredBlock
          v-if="entry.shouldMeasure"
          :block="entry.block"
          :role="role"
          :runtime="runtime"
          :snapshot="snapshot"
          :width="width"
          :line-height="lineHeight"
          :font="font"
          :agui-components="aguiComponents"
          :builtin-components="builtinComponents"
          :renderers="renderers"
          :draft-placeholder="draftPlaceholder"
          :message-shells="messageShells"
          :approval-actions="approvalActions"
          :handoff-actions="handoffActions"
          :lazy-mount="lazyMount"
          :lazy-mount-margin="lazyMountMargin"
          :text-slab-chars="textSlabChars"
          :has-visible-content-before="hasVisibleContentBeforeFlags[entry.index] ?? false"
          :gap-after="entry.gapAfter"
          @measured="updateMeasuredHeight(entry.block.id, $event)"
        />

        <div
          v-else
          class="agentdown-run-surface-group-block-list__slot"
          :style="entry.gapAfter ? { paddingBottom: `${entry.gapAfter}px` } : undefined"
        >
          <RunSurfaceBlock
            :block="entry.block"
            :role="role"
            :runtime="runtime"
            :snapshot="snapshot"
            :width="width"
            :line-height="lineHeight"
            :font="font"
            :agui-components="aguiComponents"
            :builtin-components="builtinComponents"
            :renderers="renderers"
            :draft-placeholder="draftPlaceholder"
            :message-shells="messageShells"
            :approval-actions="approvalActions"
            :handoff-actions="handoffActions"
            :lazy-mount="lazyMount"
            :lazy-mount-margin="lazyMountMargin"
            :text-slab-chars="textSlabChars"
            :has-visible-content-before="hasVisibleContentBeforeFlags[entry.index] ?? false"
          />
        </div>
      </template>

      <div
        v-if="bottomSpacerHeight > 0"
        class="agentdown-run-surface-group-block-list__spacer"
        :style="{ height: `${bottomSpacerHeight}px` }"
      />
    </div>
  </div>
</template>

<style scoped>
.agentdown-run-surface-group-block-list,
.agentdown-run-surface-group-block-list__virtualized,
.agentdown-run-surface-group-block-list__slot {
  min-width: 0;
}
</style>
