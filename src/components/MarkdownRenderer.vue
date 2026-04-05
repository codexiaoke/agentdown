<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import MarkdownBlockList from './MarkdownBlockList.vue';
import MarkdownBlockRenderer from './MarkdownBlockRenderer.vue';
import MarkdownMeasuredBlock from './MarkdownMeasuredBlock.vue';
import { defaultMarkdownBuiltinComponents } from './defaultMarkdownComponents';
import { estimateMarkdownBlockHeight, shouldMeasureMarkdownBlockHeight } from './markdownBlockPerformance';
import { AGENTDOWN_DEFAULT_TEXT_FONT } from './pretextRichText';
import { getMarkdownBlockGapAfter } from './markdownBlockSpacing';
import {
  buildMarkdownHeightPrefixSums,
  findMarkdownWindowRange,
  parseMarkdownVirtualOverscan,
  shouldRetainMarkdownWindowRange
} from './markdownWindowing';
import { parseMarkdown } from '../core/parseMarkdown';
import { splitMarkdownBlocksForRender } from '../surface/renderUtils';
import type {
  AguiComponentMap,
  MarkdownBuiltinComponentOverrides,
  MarkdownEnginePlugin,
  MarkdownRendererPerformanceOptions,
  MarkdownRendererTelemetry
} from '../core/types';

interface Props {
  source: string;
  lineHeight?: number;
  font?: string;
  thoughtTitle?: string;
  allowUnsafeHtml?: boolean;
  aguiComponents?: AguiComponentMap;
  builtinComponents?: MarkdownBuiltinComponentOverrides;
  plugins?: MarkdownEnginePlugin[];
  performance?: MarkdownRendererPerformanceOptions;
}

/**
 * `MarkdownRenderer` 内部使用的性能配置完整形态。
 */
interface ResolvedMarkdownRendererPerformance {
  textSlabChars: number | false;
  virtualize: boolean;
  virtualizeMargin: string;
}

const props = withDefaults(defineProps<Props>(), {
  lineHeight: 26,
  font: AGENTDOWN_DEFAULT_TEXT_FONT,
  thoughtTitle: 'Thought Process',
  allowUnsafeHtml: false,
  aguiComponents: () => ({}),
  builtinComponents: () => ({}),
  plugins: () => [],
  performance: () => ({})
});
const emit = defineEmits<{
  telemetry: [snapshot: MarkdownRendererTelemetry];
}>();

const containerRef = ref<HTMLElement | null>(null);
const width = ref(0);
const mountedStartIndex = ref(0);
const mountedEndIndex = ref(0);
const measuredHeights = shallowRef<Record<string, number>>({});
const viewportSyncPasses = ref(0);
const windowRangeChangeCount = ref(0);

// source 变化时重新解析 block，但布局仍然依赖容器宽度单独计算。
const blocks = computed(() =>
  parseMarkdown(props.source, {
    plugins: props.plugins,
    thoughtTitle: props.thoughtTitle,
    aguiComponents: props.aguiComponents,
    allowUnsafeHtml: props.allowUnsafeHtml
  })
);
const resolvedPerformance = computed<ResolvedMarkdownRendererPerformance>(() => ({
  textSlabChars: props.performance?.textSlabChars === false
    ? false
    : Math.max(640, props.performance?.textSlabChars ?? 1600),
  virtualize: props.performance?.virtualize ?? false,
  virtualizeMargin: props.performance?.virtualizeMargin ?? '1200px 0px'
}));
const virtualOverscan = computed(() => parseMarkdownVirtualOverscan(resolvedPerformance.value.virtualizeMargin));
const retainedOverscan = computed(() => ({
  top: Math.max(virtualOverscan.value.top * 2, 1600),
  bottom: Math.max(virtualOverscan.value.bottom * 2, 1600)
}));
const renderableBlocks = computed(() => {
  if (resolvedPerformance.value.textSlabChars === false) {
    return blocks.value;
  }

  return splitMarkdownBlocksForRender(blocks.value, resolvedPerformance.value.textSlabChars);
});
const resolvedBuiltinComponents = computed(() => ({
  ...defaultMarkdownBuiltinComponents,
  ...props.builtinComponents
}));
const blockGaps = computed(() => {
  return renderableBlocks.value.map((block, index) => {
    return getMarkdownBlockGapAfter(block, renderableBlocks.value[index + 1]);
  });
});
const blockSlotHeights = computed(() => {
  return renderableBlocks.value.map((block, index) => {
    const contentHeight = measuredHeights.value[block.id]
      ?? estimateMarkdownBlockHeight(block, width.value, props.lineHeight, props.font);
    const gapAfter = blockGaps.value[index] ?? 0;

    return contentHeight + gapAfter;
  });
});
const heightPrefixSums = computed(() => buildMarkdownHeightPrefixSums(blockSlotHeights.value));
const totalVirtualHeight = computed(() => heightPrefixSums.value[heightPrefixSums.value.length - 1] ?? 0);
const mountedWindow = computed(() => {
  if (!resolvedPerformance.value.virtualize) {
    return {
      startIndex: 0,
      endIndex: renderableBlocks.value.length
    };
  }

  return {
    startIndex: mountedStartIndex.value,
    endIndex: mountedEndIndex.value
  };
});
const mountedEntries = computed(() => {
  return renderableBlocks.value
    .slice(mountedWindow.value.startIndex, mountedWindow.value.endIndex)
    .map((block, offset) => {
      const index = mountedWindow.value.startIndex + offset;

      return {
        block,
        index,
        gapAfter: blockGaps.value[index] ?? 0,
        shouldMeasure: shouldMeasureMarkdownBlockHeight(block)
      };
    });
});
const topSpacerHeight = computed(() => {
  return heightPrefixSums.value[mountedWindow.value.startIndex] ?? 0;
});
const bottomSpacerHeight = computed(() => {
  return Math.max(0, totalVirtualHeight.value - (heightPrefixSums.value[mountedWindow.value.endIndex] ?? 0));
});
const telemetrySnapshot = computed<MarkdownRendererTelemetry>(() => ({
  sourceLength: props.source.length,
  parsedBlockCount: blocks.value.length,
  renderableBlockCount: renderableBlocks.value.length,
  mountedBlockCount: mountedWindow.value.endIndex - mountedWindow.value.startIndex,
  mountedStartIndex: mountedWindow.value.startIndex,
  mountedEndIndex: mountedWindow.value.endIndex,
  measuredBlockCount: Object.keys(measuredHeights.value).length,
  virtualized: resolvedPerformance.value.virtualize,
  textSlabChars: resolvedPerformance.value.textSlabChars,
  width: width.value,
  totalVirtualHeight: totalVirtualHeight.value,
  topSpacerHeight: topSpacerHeight.value,
  bottomSpacerHeight: bottomSpacerHeight.value,
  viewportSyncPasses: viewportSyncPasses.value,
  windowRangeChangeCount: windowRangeChangeCount.value
}));

let observer: ResizeObserver | null = null;
let viewportRaf = 0;
let measuredHeightFlushRaf = 0;
let pendingMeasuredHeights: Record<string, number> = {};

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

function updateWidth() {
  width.value = containerRef.value?.clientWidth ?? 0;
}

/**
 * 根据容器与窗口的相对位置，同步 markdown 列表当前可视窗口。
 */
function syncViewportWindow() {
  viewportRaf = 0;

  if (!resolvedPerformance.value.virtualize || !containerRef.value || typeof window === 'undefined') {
    mountedStartIndex.value = 0;
    mountedEndIndex.value = renderableBlocks.value.length;
    return;
  }

  viewportSyncPasses.value += 1;

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
  windowRangeChangeCount.value += 1;
}

/**
 * 把视口同步收敛到一帧里，避免滚动时过度计算。
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
 * 把同一帧内收集到的高度变化合并写入，避免每个 block 都触发一次响应式对象复制。
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
 * 把高度写入收敛到一帧里，减少 mounted block 批量测量时的同步抖动。
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
 * 记录真实渲染高度，供窗口化后续修正 spacer 与范围计算。
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

watch(() => props.source, () => {
  cancelMeasuredHeightFlush();
  updateWidth();
  scheduleViewportSync();
});

watch(
  () => width.value,
  () => {
    cancelMeasuredHeightFlush();
    measuredHeights.value = {};
    scheduleViewportSync();
  }
);

watch(
  () => renderableBlocks.value.map((block) => block.id),
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
  [() => resolvedPerformance.value.virtualize, () => resolvedPerformance.value.virtualizeMargin],
  () => {
    scheduleViewportSync();
  }
);

watch(
  telemetrySnapshot,
  (snapshot) => {
    emit('telemetry', snapshot);
  },
  {
    immediate: true
  }
);

onMounted(() => {
  updateWidth();
  syncViewportWindow();

  // pretext 布局依赖宽度，所以这里直接监听容器尺寸变化。
  observer = new ResizeObserver(() => {
    updateWidth();
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
    class="agentdown-root"
    :data-agentdown-renderable-blocks="telemetrySnapshot.renderableBlockCount"
    :data-agentdown-mounted-blocks="telemetrySnapshot.mountedBlockCount"
    :data-agentdown-window-start="telemetrySnapshot.mountedStartIndex"
    :data-agentdown-window-end="telemetrySnapshot.mountedEndIndex"
  >
    <MarkdownBlockList
      v-if="!resolvedPerformance.virtualize"
      :blocks="renderableBlocks"
      :width="width"
      :line-height="lineHeight"
      :font="font"
      :agui-components="aguiComponents"
      :builtin-components="resolvedBuiltinComponents"
    />

    <div
      v-else
      class="agentdown-block-list agentdown-block-list--virtualized"
    >
      <div
        v-if="topSpacerHeight > 0"
        class="agentdown-virtual-spacer"
        :style="{ height: `${topSpacerHeight}px` }"
      />

      <template
        v-for="entry in mountedEntries"
        :key="entry.block.id"
      >
        <MarkdownMeasuredBlock
          v-if="entry.shouldMeasure"
          :block="entry.block"
          :gap-after="entry.gapAfter"
          :width="width"
          :line-height="lineHeight"
          :font="font"
          :agui-components="aguiComponents"
          :builtin-components="resolvedBuiltinComponents"
          @measured="updateMeasuredHeight(entry.block.id, $event)"
        />

        <div
          v-else
          class="agentdown-block-slot"
          :style="entry.gapAfter ? { paddingBottom: `${entry.gapAfter}px` } : undefined"
        >
          <MarkdownBlockRenderer
            :block="entry.block"
            :width="width"
            :line-height="lineHeight"
            :font="font"
            :agui-components="aguiComponents"
            :builtin-components="resolvedBuiltinComponents"
          />
        </div>
      </template>

      <div
        v-if="bottomSpacerHeight > 0"
        class="agentdown-virtual-spacer"
        :style="{ height: `${bottomSpacerHeight}px` }"
      />
    </div>
  </div>
</template>
