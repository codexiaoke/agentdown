<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MarkdownBlockList from './MarkdownBlockList.vue';
import { parseMarkdown } from '../core/parseMarkdown';
import { createStreamingMarkdownTextBlock } from '../core/streamingInlineFragments';
import type {
  AguiComponentMap,
  MarkdownBlock,
  MarkdownBuiltinComponents,
  MarkdownTextBlock
} from '../core/types';
import type {
  AgentRuntime,
  RuntimeIntent,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock,
  SurfaceBlockStreamingDraftData
} from '../runtime/types';
import type {
  RunSurfaceDraftPlaceholder,
  RunSurfaceDraftPlaceholderContext,
  RunSurfaceDraftPlaceholderRegistration,
  RunSurfaceApprovalActionsOptions,
  RunSurfaceHandoffActionsOptions,
  RunSurfaceMessageShellContext,
  RunSurfaceMessageShellMap,
  RunSurfaceMessageShellRegistration,
  RunSurfaceRendererContext,
  RunSurfaceRendererMap,
  RunSurfaceRendererRegistration,
  RunSurfaceRole
} from '../surface/types';
import {
  hasHeavyMarkdownContent,
  splitMarkdownBlocksForRender
} from '../surface/renderUtils';
import {
  resolveSurfaceBlockStreamingDraftData
} from '../surface/draftMetadata';
import { provideRunSurfaceBlockContext } from '../surface/runSurfaceContext';

/**
 * `RunSurfaceBlock` 的组件输入参数。
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
}

const props = defineProps<Props>();

const blockRef = ref<HTMLElement | null>(null);
const shouldMountHeavyContent = ref(!props.lazyMount);

const MARKDOWN_KINDS = new Set<MarkdownBlock['kind']>([
  'text',
  'html',
  'code',
  'mermaid',
  'math',
  'thought',
  'agui',
  'artifact',
  'approval',
  'attachment',
  'branch',
  'handoff',
  'timeline'
]);

let visibilityObserver: IntersectionObserver | null = null;

/**
 * 把一个结构化 intent 上抛给 runtime。
 */
function emitIntent(intent: Omit<RuntimeIntent, 'id' | 'at'>) {
  return props.runtime.emitIntent(intent);
}

/**
 * 向当前 block 子树注入 RunSurface 上下文，
 * 让 approval 这类内置 markdown 组件也能读到运行态数据。
 */
provideRunSurfaceBlockContext({
  block: computed(() => props.block),
  role: computed(() => props.role),
  runtime: props.runtime,
  snapshot: computed(() => props.snapshot),
  approvalActions: computed(() => props.approvalActions),
  handoffActions: computed(() => props.handoffActions),
  emitIntent
});

/**
 * 读取当前 block 关联的 runtime node。
 */
const node = computed<RuntimeNode | undefined>(() => {
  if (!props.block.nodeId) {
    return undefined;
  }

  return props.snapshot.nodes.find((candidate) => candidate.id === props.block.nodeId);
});

/**
 * 解析当前 block 对应的自定义 renderer 注册。
 */
const rendererRegistration = computed<RunSurfaceRendererRegistration | null>(() => {
  const candidate = props.renderers[props.block.renderer];

  if (!candidate) {
    return null;
  }

  if (
    typeof candidate === 'object'
    && candidate !== null
    && Object.prototype.hasOwnProperty.call(candidate, 'component')
  ) {
    return candidate as RunSurfaceRendererRegistration;
  }

  return {
    component: candidate
  };
});

/**
 * 解析当前 surface 使用的 draft placeholder。
 */
const draftPlaceholderRegistration = computed<RunSurfaceDraftPlaceholderRegistration | null>(() => {
  const candidate = props.draftPlaceholder;

  if (!candidate) {
    return null;
  }

  if (
    typeof candidate === 'object'
    && candidate !== null
    && Object.prototype.hasOwnProperty.call(candidate, 'component')
  ) {
    return candidate as RunSurfaceDraftPlaceholderRegistration;
  }

  return {
    component: candidate
  };
});

/**
 * 解析当前 role 对应的消息 shell。
 */
const messageShellRegistration = computed<RunSurfaceMessageShellRegistration | null>(() => {
  const candidate = props.messageShells[props.role];

  if (!candidate) {
    return null;
  }

  if (
    typeof candidate === 'object'
    && candidate !== null
    && Object.prototype.hasOwnProperty.call(candidate, 'component')
  ) {
    return candidate as RunSurfaceMessageShellRegistration;
  }

  return {
    component: candidate
  };
});

/**
 * 生成自定义 renderer 需要的上下文对象。
 */
const rendererContext = computed<RunSurfaceRendererContext>(() => {
  const context: RunSurfaceRendererContext = {
    block: props.block,
    runtime: props.runtime,
    snapshot: props.snapshot,
    emitIntent
  };

  if (node.value) {
    context.node = node.value;
  }

  return context;
});

/**
 * 生成 renderer 最终收到的 props。
 */
const rendererProps = computed(() => {
  const registration = rendererRegistration.value;

  if (!registration) {
    return {};
  }

  if (typeof registration.props === 'function') {
    return registration.props(rendererContext.value);
  }

  if (registration.props) {
    return registration.props;
  }

  if (registration.mode === 'context') {
    return {
      ...rendererContext.value,
      ...(rendererContext.value.node ? { node: rendererContext.value.node } : {})
    };
  }

  const data = props.block.data;

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data;
  }

  return {};
});

/**
 * 生成 draft placeholder 需要的上下文。
 */
const draftPlaceholderContext = computed<RunSurfaceDraftPlaceholderContext>(() => ({
  block: props.block,
  role: props.role,
  runtime: props.runtime,
  snapshot: props.snapshot,
  emitIntent
}));

/**
 * 生成 draft placeholder 最终收到的 props。
 */
const draftPlaceholderProps = computed(() => {
  const registration = draftPlaceholderRegistration.value;

  if (!registration) {
    return {};
  }

  if (typeof registration.props === 'function') {
    return registration.props(draftPlaceholderContext.value);
  }

  return registration.props ?? {};
});

/**
 * 根据当前内容生成消息 shell props。
 */
function resolveMessageShellProps(kind: 'markdown' | 'draft') {
  const registration = messageShellRegistration.value;

  if (!registration) {
    return {};
  }

  const context: RunSurfaceMessageShellContext = {
    block: props.block,
    role: props.role,
    kind,
    runtime: props.runtime,
    snapshot: props.snapshot,
    emitIntent
  };

  const activeMarkdownBlock = kind === 'draft'
    ? (draftPreviewBlock.value ?? markdownBlock.value)
    : markdownBlock.value;

  if (activeMarkdownBlock) {
    context.markdownBlock = activeMarkdownBlock;
  }

  if (typeof registration.props === 'function') {
    return registration.props(context);
  }

  return registration.props ?? {};
}

const markdownMessageShellProps = computed(() => resolveMessageShellProps('markdown'));
const draftMessageShellProps = computed(() => resolveMessageShellProps('draft'));

/**
 * 把当前 block 还原成 markdown 语义 block。
 */
const markdownBlock = computed<MarkdownBlock | null>(() => {
  const data = props.block.data as Partial<MarkdownBlock> & { kind?: unknown };

  if (typeof data.kind === 'string' && MARKDOWN_KINDS.has(data.kind as MarkdownBlock['kind'])) {
    return data as MarkdownBlock;
  }

  if (props.block.renderer === 'text' && typeof props.block.content === 'string') {
    const textBlock: MarkdownTextBlock = {
      id: props.block.id,
      kind: 'text',
      tag: 'p',
      text: props.block.content
    };

    return textBlock;
  }

  return null;
});

/**
 * 判断当前 block 是否仍处于 draft-like 状态。
 */
const isDraftLike = computed(() => {
  return (
    props.block.state === 'draft'
    || props.block.renderer === 'markdown.draft'
    || props.block.renderer === 'text.draft'
    || props.block.renderer === 'markdown'
  );
});

/**
 * 为未知 block 生成兜底文本。
 */
const fallbackText = computed(() => {
  if (typeof props.block.content === 'string' && props.block.content.length > 0) {
    return props.block.content;
  }

  if (markdownBlock.value?.kind === 'text') {
    return markdownBlock.value.text;
  }

  if (
    typeof props.block.data === 'object'
    && props.block.data !== null
    && !Array.isArray(props.block.data)
    && Object.keys(props.block.data).length === 0
  ) {
    return '';
  }

  return JSON.stringify(props.block.data, null, 2);
});

/**
 * 读取当前 block 上由 assembler 写入的流式草稿元数据。
 */
const streamingDraftData = computed<SurfaceBlockStreamingDraftData>(() => {
  return resolveSurfaceBlockStreamingDraftData(props.block.data);
});

/**
 * 推断当前 draft 尾部应采用的显示模式。
 */
const draftMode = computed(() => {
  const mode = streamingDraftData.value.streamingDraftMode;

  if (mode === 'hidden' || mode === 'preview') {
    return mode;
  }

  return 'text';
});

/**
 * 对 draft markdown 生成可直接渲染的 block 列表。
 *
 * - `preview` 模式继续走完整 markdown 解析
 * - `text` 模式走容错的 inline draft 预览，这样 `**加粗` 这类流式内容也能尽早显示样式
 */
const draftPreviewBlocks = computed<MarkdownBlock[]>(() => {
  if (!isDraftLike.value || fallbackText.value.trim().length === 0) {
    return [];
  }

  if (draftMode.value === 'preview') {
    return parseMarkdown(fallbackText.value, {
      aguiComponents: props.aguiComponents
    });
  }

  if (draftMode.value === 'text') {
    return [
      createStreamingMarkdownTextBlock(
        fallbackText.value,
        `${props.block.id}:draft-text`
      )
    ];
  }

  return [];
});

/**
 * 读取 draft 预览中的首个 markdown block。
 */
const draftPreviewBlock = computed<MarkdownBlock | null>(() => {
  return draftPreviewBlocks.value[0] ?? null;
});

/**
 * 判断是否应该直接显示 draft 原文。
 */
const shouldRenderDraft = computed(() => {
  return (
    isDraftLike.value
    && draftMode.value !== 'hidden'
    && fallbackText.value.trim().length > 0
  );
});

/**
 * 判断是否应该显示解析后的 draft 内容。
 */
const shouldRenderDraftPreview = computed(() => {
  return (
    !rendererRegistration.value
    && isDraftLike.value
    && renderableDraftPreviewBlocks.value.length > 0
  );
});

/**
 * 判断是否应该显示空草稿占位。
 */
const shouldRenderDraftPlaceholder = computed(() => {
  return (
    !rendererRegistration.value
    && isDraftLike.value
    && !props.hasVisibleContentBefore
    && !shouldRenderDraftPreview.value
    && (fallbackText.value.trim().length === 0 || draftMode.value === 'hidden')
    && !!draftPlaceholderRegistration.value
  );
});

/**
 * 判断当前 block 是否应该完全隐藏。
 */
const shouldHideBlock = computed(() => {
  return (
    !rendererRegistration.value
    && isDraftLike.value
    && !shouldRenderDraft.value
    && !shouldRenderDraftPreview.value
    && !shouldRenderDraftPlaceholder.value
  );
});

/**
 * 当前 block 是否使用消息 shell 包裹。
 */
const shouldRenderMessageShell = computed(() => {
  return !!messageShellRegistration.value;
});

/**
 * 当前稳定 markdown 内容在渲染前的 slab 化结果。
 */
const renderableMarkdownBlocks = computed<MarkdownBlock[]>(() => {
  if (!markdownBlock.value) {
    return [];
  }

  return splitMarkdownBlocksForRender([markdownBlock.value], props.textSlabChars);
});

/**
 * draft markdown 预览在渲染前的 slab 化结果。
 */
const renderableDraftPreviewBlocks = computed<MarkdownBlock[]>(() => {
  return splitMarkdownBlocksForRender(draftPreviewBlocks.value, props.textSlabChars);
});

/**
 * 判断当前 block 是否属于重型内容。
 */
const isHeavyBlock = computed(() => {
  if (rendererRegistration.value) {
    return !['text', 'text.draft', 'markdown', 'markdown.draft'].includes(props.block.renderer);
  }

  if (renderableDraftPreviewBlocks.value.length > 0) {
    return hasHeavyMarkdownContent(renderableDraftPreviewBlocks.value);
  }

  if (renderableMarkdownBlocks.value.length > 0) {
    return hasHeavyMarkdownContent(renderableMarkdownBlocks.value);
  }

  return props.block.type === 'tool';
});

/**
 * 推断懒挂载占位的最小高度，尽量减少滚动时的布局跳动。
 */
const lazyPlaceholderMinHeight = computed(() => {
  if (draftPreviewBlock.value?.kind === 'agui') {
    return draftPreviewBlock.value.minHeight;
  }

  if (markdownBlock.value?.kind === 'agui') {
    return markdownBlock.value.minHeight;
  }

  const activeBlock = draftPreviewBlock.value ?? markdownBlock.value;

  if (activeBlock?.kind === 'mermaid') {
    return 220;
  }

  if (activeBlock?.kind === 'code' || activeBlock?.kind === 'html') {
    return 150;
  }

  if (
    activeBlock?.kind === 'artifact'
    || activeBlock?.kind === 'approval'
    || activeBlock?.kind === 'attachment'
    || activeBlock?.kind === 'branch'
    || activeBlock?.kind === 'handoff'
    || activeBlock?.kind === 'timeline'
    || activeBlock?.kind === 'thought'
  ) {
    return 112;
  }

  if (rendererRegistration.value || props.block.type === 'tool') {
    return 116;
  }

  return 72;
});

/**
 * 当前 block 是否应该启用接近视口后再挂载。
 */
const shouldLazyMount = computed(() => {
  return props.lazyMount && isHeavyBlock.value;
});

/**
 * 当前 block 是否仍处于懒挂载占位状态。
 */
const shouldDelayMount = computed(() => {
  return shouldLazyMount.value && !shouldMountHeavyContent.value;
});

/**
 * 读取当前 draft 对应的结构类型，方便 devtools 和样式层判断。
 */
const draftKind = computed(() => {
  if (!isDraftLike.value) {
    return undefined;
  }

  return streamingDraftData.value.streamingDraftKind;
});

/**
 * 读取当前 draft 对应的稳定化策略。
 */
const draftStability = computed(() => {
  if (!isDraftLike.value) {
    return undefined;
  }

  return streamingDraftData.value.streamingDraftStability;
});

/**
 * 把当前 draft 是否跨多行收敛成 DOM 友好的字符串属性。
 */
const draftMultiline = computed(() => {
  if (!isDraftLike.value || typeof streamingDraftData.value.streamingDraftMultiline !== 'boolean') {
    return undefined;
  }

  return String(streamingDraftData.value.streamingDraftMultiline);
});

/**
 * 只在 draft-like block 上暴露调试与样式可读的数据属性。
 */
const draftModeAttribute = computed(() => {
  if (!isDraftLike.value) {
    return undefined;
  }

  return draftMode.value;
});

/**
 * 断开当前 block 的可见性观察器。
 */
function disconnectVisibilityObserver() {
  visibilityObserver?.disconnect();
  visibilityObserver = null;
}

/**
 * 根据当前配置同步懒挂载观察器。
 */
async function syncVisibilityObserver() {
  disconnectVisibilityObserver();

  if (!shouldLazyMount.value || typeof IntersectionObserver !== 'function') {
    shouldMountHeavyContent.value = true;
    return;
  }

  shouldMountHeavyContent.value = false;
  await nextTick();
  const element = blockRef.value;

  if (!element) {
    return;
  }

  visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        shouldMountHeavyContent.value = true;
        disconnectVisibilityObserver();
      }
    },
    {
      root: null,
      rootMargin: props.lazyMountMargin,
      threshold: 0.01
    }
  );

  visibilityObserver.observe(element);
}

watch(
  [shouldLazyMount, () => props.lazyMountMargin],
  () => {
    syncVisibilityObserver().catch(() => {
      shouldMountHeavyContent.value = true;
      disconnectVisibilityObserver();
    });
  },
  {
    immediate: true,
    flush: 'post'
  }
);

onMounted(() => {
  syncVisibilityObserver().catch(() => {
    shouldMountHeavyContent.value = true;
    disconnectVisibilityObserver();
  });
});

onBeforeUnmount(() => {
  disconnectVisibilityObserver();
});
</script>

<template>
  <div
    ref="blockRef"
    class="agentdown-run-surface-block"
    :data-block-id="block.id"
    :data-renderer="block.renderer"
    :data-state="block.state"
    :data-draft-mode="draftModeAttribute"
    :data-draft-kind="draftKind"
    :data-draft-stability="draftStability"
    :data-draft-multiline="draftMultiline"
  >
    <div
      v-if="shouldDelayMount"
      class="agentdown-run-surface-lazy-placeholder"
      :data-role="role"
      :style="{ minHeight: `${lazyPlaceholderMinHeight}px` }"
    />

    <component
      :is="rendererRegistration.component"
      v-else-if="rendererRegistration"
      v-bind="rendererProps"
    />

    <component
      :is="draftPlaceholderRegistration.component"
      v-else-if="shouldRenderDraftPlaceholder && draftPlaceholderRegistration"
      v-bind="draftPlaceholderProps"
    />

    <div
      v-else-if="shouldRenderDraftPreview && shouldRenderMessageShell && messageShellRegistration"
      class="agentdown-run-surface-shell"
      :data-role="role"
    >
      <component
        :is="messageShellRegistration.component"
        v-bind="draftMessageShellProps"
      >
        <div
          class="agentdown-run-surface-markdown"
          :data-role="role"
          data-preview="true"
          :data-draft-mode="draftModeAttribute"
          :data-draft-kind="draftKind"
          :data-draft-stability="draftStability"
          :data-draft-multiline="draftMultiline"
        >
          <MarkdownBlockList
            :blocks="renderableDraftPreviewBlocks"
            :width="width"
            :line-height="lineHeight"
            :font="font"
            :agui-components="aguiComponents"
            :builtin-components="builtinComponents"
          />
        </div>
      </component>
    </div>

    <div
      v-else-if="shouldRenderDraftPreview"
      class="agentdown-run-surface-markdown"
      :data-role="role"
      data-preview="true"
      :data-draft-mode="draftModeAttribute"
      :data-draft-kind="draftKind"
      :data-draft-stability="draftStability"
      :data-draft-multiline="draftMultiline"
    >
      <MarkdownBlockList
        :blocks="renderableDraftPreviewBlocks"
        :width="width"
        :line-height="lineHeight"
        :font="font"
        :agui-components="aguiComponents"
        :builtin-components="builtinComponents"
      />
    </div>

    <div
      v-else-if="shouldRenderDraft && shouldRenderMessageShell && messageShellRegistration"
      class="agentdown-run-surface-shell"
      :data-role="role"
    >
      <component
        :is="messageShellRegistration.component"
        v-bind="draftMessageShellProps"
      >
        <div
          class="agentdown-run-surface-draft"
          :data-role="role"
          :data-draft-mode="draftModeAttribute"
          :data-draft-kind="draftKind"
          :data-draft-stability="draftStability"
          :data-draft-multiline="draftMultiline"
        >
          <p class="agentdown-run-surface-draft-text">
            {{ fallbackText }}
          </p>
        </div>
      </component>
    </div>

    <div
      v-else-if="shouldRenderDraft"
      class="agentdown-run-surface-draft"
      :data-role="role"
      :data-draft-mode="draftModeAttribute"
      :data-draft-kind="draftKind"
      :data-draft-stability="draftStability"
      :data-draft-multiline="draftMultiline"
    >
      <p class="agentdown-run-surface-draft-text">
        {{ fallbackText }}
      </p>
    </div>

    <div
      v-else-if="renderableMarkdownBlocks.length > 0 && shouldRenderMessageShell && messageShellRegistration"
      class="agentdown-run-surface-shell"
      :data-role="role"
    >
      <component
        :is="messageShellRegistration.component"
        v-bind="markdownMessageShellProps"
      >
        <div
          class="agentdown-run-surface-markdown"
          :data-role="role"
        >
          <MarkdownBlockList
            :blocks="renderableMarkdownBlocks"
            :width="width"
            :line-height="lineHeight"
            :font="font"
            :agui-components="aguiComponents"
            :builtin-components="builtinComponents"
          />
        </div>
      </component>
    </div>

    <div
      v-else-if="renderableMarkdownBlocks.length > 0"
      class="agentdown-run-surface-markdown"
      :data-role="role"
    >
      <MarkdownBlockList
        :blocks="renderableMarkdownBlocks"
        :width="width"
        :line-height="lineHeight"
        :font="font"
        :agui-components="aguiComponents"
        :builtin-components="builtinComponents"
      />
    </div>

    <div
      v-else-if="!shouldHideBlock"
      class="agentdown-run-surface-unknown"
      :data-role="role"
    >
      <pre class="agentdown-run-surface-fallback">{{ fallbackText }}</pre>
    </div>
  </div>
</template>

<style scoped>
.agentdown-run-surface-block {
  min-width: 0;
}

.agentdown-run-surface-markdown,
.agentdown-run-surface-draft,
.agentdown-run-surface-unknown,
.agentdown-run-surface-shell {
  min-width: 0;
}

.agentdown-run-surface-markdown {
  color: #0f172a;
}

.agentdown-run-surface-draft {
  color: #334155;
}

.agentdown-run-surface-draft[data-role='assistant'] {
  color: #475569;
}

.agentdown-run-surface-markdown[data-role='system'],
.agentdown-run-surface-draft[data-role='system'] {
  color: #64748b;
}

.agentdown-run-surface-lazy-placeholder {
  width: 100%;
  border-radius: 16px;
  background:
    linear-gradient(90deg, rgba(248, 250, 252, 0.9), rgba(241, 245, 249, 0.95), rgba(248, 250, 252, 0.9));
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.agentdown-run-surface-unknown {
  border-left: 2px solid rgba(148, 163, 184, 0.28);
  padding-left: 12px;
}

.agentdown-run-surface-draft-text,
.agentdown-run-surface-fallback {
  margin: 0;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
}

.agentdown-run-surface-draft-text {
  line-height: 1.8;
}

.agentdown-run-surface-fallback {
  font-size: 12px;
  line-height: 1.7;
}
</style>
