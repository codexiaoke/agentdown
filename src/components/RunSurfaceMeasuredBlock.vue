<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import RunSurfaceBlock from './RunSurfaceBlock.vue';

/**
 * `RunSurfaceMeasuredBlock` 的输入参数。
 * 它负责把真实渲染出来的消息 block 包一层，并把高度回传给窗口化列表。
 */
interface Props {
  block: SurfaceBlock;
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
  hasVisibleContentBefore: boolean;
  gapAfter?: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  measured: [height: number];
}>();

const rootRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

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
 * 在 block 内容稳定后刷新一次高度，并监听后续高度变化。
 */
async function syncMeasurement(): Promise<void> {
  disconnectResizeObserver();

  await nextTick();
  emitMeasuredHeight();

  if (!rootRef.value || typeof ResizeObserver !== 'function') {
    return;
  }

  resizeObserver = new ResizeObserver(() => {
    emitMeasuredHeight();
  });
  resizeObserver.observe(rootRef.value);
}

watch(
  [
    () => props.width,
    () => props.lineHeight,
    () => props.font,
    () => props.block.id,
    () => props.block.updatedAt,
    () => props.block.state,
    () => props.block.renderer
  ],
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
    class="agentdown-run-surface-measured-block"
    :style="props.gapAfter ? { paddingBottom: `${props.gapAfter}px` } : undefined"
  >
    <div ref="contentRef">
      <RunSurfaceBlock
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
        :has-visible-content-before="hasVisibleContentBefore"
      />
    </div>
  </div>
</template>
