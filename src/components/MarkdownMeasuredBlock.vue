<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MarkdownBlockRenderer from './MarkdownBlockRenderer.vue';
import type {
  AguiComponentMap,
  MarkdownBlock,
  MarkdownBuiltinComponents
} from '../core/types';

/**
 * `MarkdownMeasuredBlock` 的输入参数。
 */
interface Props {
  block: MarkdownBlock;
  width: number;
  lineHeight: number;
  font: string;
  gapAfter?: number;
  aguiComponents: AguiComponentMap;
  builtinComponents: MarkdownBuiltinComponents;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  measured: [height: number];
}>();

const rootRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

/**
 * 判断当前 block 是否可能在挂载后继续发生高度变化。
 * 只有这类动态 block 才值得持续挂载 `ResizeObserver`。
 */
function shouldObserveBlockHeight(block: MarkdownBlock): boolean {
  switch (block.kind) {
    case 'mermaid':
    case 'html':
    case 'thought':
    case 'agui':
      return true;

    default:
      return false;
  }
}

/**
 * 断开当前 block 的高度观察器。
 */
function disconnectResizeObserver(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
}

/**
 * 把当前真实渲染高度回传给外层窗口化列表。
 */
function emitMeasuredHeight(): void {
  emit('measured', Math.max(0, contentRef.value?.offsetHeight ?? rootRef.value?.offsetHeight ?? 0));
}

/**
 * 在 block 内容稳定后刷新一次高度，并保持后续变化可观测。
 */
async function syncMeasurement(): Promise<void> {
  disconnectResizeObserver();

  await nextTick();
  emitMeasuredHeight();

  if (
    !rootRef.value
    || typeof ResizeObserver !== 'function'
    || !shouldObserveBlockHeight(props.block)
  ) {
    return;
  }

  resizeObserver = new ResizeObserver(() => {
    emitMeasuredHeight();
  });
  resizeObserver.observe(rootRef.value);
}

watch(
  [() => props.width, () => props.lineHeight, () => props.font, () => props.block.id],
  async () => {
    await syncMeasurement();
  }
);

onMounted(async () => {
  await syncMeasurement();
});

onBeforeUnmount(() => {
  disconnectResizeObserver();
});
</script>

<template>
  <div
    ref="rootRef"
    class="agentdown-measured-block"
    :style="props.gapAfter ? { paddingBottom: `${props.gapAfter}px` } : undefined"
  >
    <div ref="contentRef">
      <MarkdownBlockRenderer
        :block="block"
        :width="width"
        :line-height="lineHeight"
        :font="font"
        :agui-components="aguiComponents"
        :builtin-components="builtinComponents"
      />
    </div>
  </div>
</template>
