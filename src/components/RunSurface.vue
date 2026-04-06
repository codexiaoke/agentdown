<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { defaultMarkdownBuiltinComponents } from './defaultMarkdownComponents';
import { AGENTDOWN_DEFAULT_TEXT_FONT } from './pretextRichText';
import RunSurfaceAssistantShell from './RunSurfaceAssistantShell.vue';
import RunSurfaceBlock from './RunSurfaceBlock.vue';
import RunSurfaceMessageActions from './RunSurfaceMessageActions.vue';
import RunSurfaceToolRenderer from './RunSurfaceToolRenderer.vue';
import RunSurfaceUserBubble from './RunSurfaceUserBubble.vue';
import type {
  AguiComponentMap,
  MarkdownBlock,
  MarkdownBuiltinComponentOverrides
} from '../core/types';
import type { AgentRuntime, RuntimeSnapshot, SurfaceBlock } from '../runtime/types';
import { resolveBlockMessageScope } from '../runtime/chatSemantics';
import type {
  RunSurfaceDraftPlaceholder,
  RunSurfaceMessageActionsMap,
  RunSurfaceMessageShellContext,
  RunSurfaceMessageShellMap,
  RunSurfacePerformanceOptions,
  RunSurfaceRendererMap,
  RunSurfaceRole
} from '../surface/types';

/**
 * `RunSurface` 的组件输入参数。
 */
interface Props {
  runtime: AgentRuntime;
  slot?: string;
  lineHeight?: number;
  font?: string;
  emptyText?: string;
  performance?: RunSurfacePerformanceOptions;
  aguiComponents?: AguiComponentMap;
  builtinComponents?: MarkdownBuiltinComponentOverrides;
  renderers?: RunSurfaceRendererMap;
  draftPlaceholder?: RunSurfaceDraftPlaceholder;
  messageShells?: RunSurfaceMessageShellMap;
  messageActions?: RunSurfaceMessageActionsMap;
}

/**
 * surface 中按 role 和 messageId 聚合后的消息单元。
 */
interface SurfaceGroup {
  id: string;
  groupId: string | null;
  conversationId: string | null;
  turnId: string | null;
  messageId: string | null;
  role: RunSurfaceRole;
  blocks: SurfaceBlock[];
}

/**
 * `RunSurface` 内部使用的性能配置完整形态。
 */
interface ResolvedRunSurfacePerformance {
  groupWindow: number | false;
  groupWindowStep: number;
  lazyMount: boolean;
  lazyMountMargin: string;
  textSlabChars: number;
}

const props = withDefaults(defineProps<Props>(), {
  slot: 'main',
  lineHeight: 26,
  font: AGENTDOWN_DEFAULT_TEXT_FONT,
  emptyText: '等待新的运行输出...',
  performance: () => ({}),
  aguiComponents: () => ({}),
  builtinComponents: () => ({}),
  renderers: () => ({}),
  draftPlaceholder: false,
  messageShells: () => ({
    user: RunSurfaceUserBubble
  }),
  messageActions: () => ({})
});

const containerRef = ref<HTMLElement | null>(null);
const loadMoreRef = ref<HTMLElement | null>(null);
const width = ref(0);
const snapshot = shallowRef<RuntimeSnapshot>(props.runtime.snapshot());
const visibleGroupCount = ref(0);

const resolvedBuiltinComponents = computed(() => ({
  ...defaultMarkdownBuiltinComponents,
  ...props.builtinComponents
}));

const resolvedPerformance = computed<ResolvedRunSurfacePerformance>(() => {
  const configuredGroupWindow = props.performance?.groupWindow;

  return {
    groupWindow: configuredGroupWindow === false ? false : Math.max(24, configuredGroupWindow ?? 80),
    groupWindowStep: Math.max(12, props.performance?.groupWindowStep ?? 40),
    lazyMount: props.performance?.lazyMount ?? true,
    lazyMountMargin: props.performance?.lazyMountMargin ?? '720px 0px',
    textSlabChars: Math.max(640, props.performance?.textSlabChars ?? 1600)
  };
});

const resolvedDraftPlaceholder = computed<RunSurfaceDraftPlaceholder>(() => props.draftPlaceholder ?? false);

/**
 * 合并 surface 默认 renderer 与外部覆写。
 * `tool` 默认提供一个基础卡片，调用方仍然可以直接覆盖它。
 */
const resolvedRenderers = computed<RunSurfaceRendererMap>(() => ({
  tool: RunSurfaceToolRenderer,
  ...(props.renderers ?? {})
}));

/**
 * 为默认消息 shell 生成最小上下文 props。
 */
function createDefaultShellProps(context: RunSurfaceMessageShellContext) {
  return {
    kind: context.kind,
    blockKind: context.markdownBlock?.kind ?? null
  };
}

const resolvedMessageShells = computed<RunSurfaceMessageShellMap>(() => ({
  assistant: {
    component: RunSurfaceAssistantShell,
    props: createDefaultShellProps
  },
  user: {
    component: RunSurfaceUserBubble,
    props: createDefaultShellProps
  },
  ...(props.messageShells ?? {})
}));

const resolvedMessageActions = computed<RunSurfaceMessageActionsMap>(() => ({
  assistant: {
    enabled: true,
    showOnDraft: false,
    showWhileRunning: false
  },
  ...(props.messageActions ?? {})
}));

let unsubscribe: (() => void) | null = null;
let observer: ResizeObserver | null = null;
let loadMoreObserver: IntersectionObserver | null = null;

/**
 * 同步 RunSurface 容器宽度，供 markdown/text 布局使用。
 */
function updateWidth() {
  width.value = containerRef.value?.clientWidth ?? 0;
}

/**
 * 绑定 runtime，并在每次状态变化时刷新 snapshot。
 */
function bindRuntime(runtime: AgentRuntime) {
  unsubscribe?.();
  snapshot.value = runtime.snapshot();
  unsubscribe = runtime.subscribe(() => {
    snapshot.value = runtime.snapshot();
  });
}

watch(
  () => props.runtime,
  (runtime) => {
    bindRuntime(runtime);
  },
  {
    immediate: true
  }
);

onMounted(() => {
  updateWidth();

  observer = new ResizeObserver(() => {
    updateWidth();
  });

  if (containerRef.value) {
    observer.observe(containerRef.value);
  }
});

/**
 * 按 slot 过滤当前 surface 需要渲染的 block。
 */
const slotBlocks = computed(() => {
  return snapshot.value.blocks.filter((block) => block.slot === props.slot);
});

/**
 * 为 block -> node 查询建立临时索引。
 */
const nodesById = computed(() => {
  return new Map(snapshot.value.nodes.map((node) => [node.id, node]));
});

/**
 * 推断一个 block 应该归属到哪种聊天角色。
 */
function resolveBlockRole(block: SurfaceBlock): RunSurfaceRole {
  const blockRole = (block.data as { role?: unknown }).role;

  if (blockRole === 'user' || blockRole === 'assistant' || blockRole === 'system') {
    return blockRole;
  }

  const node = block.nodeId ? nodesById.value.get(block.nodeId) : undefined;

  if (node?.type === 'user') {
    return 'user';
  }

  if (node?.type === 'system') {
    return 'system';
  }

  return 'assistant';
}

/**
 * 按连续的 role + messageId 把 block 聚合成消息 group。
 *
 * 为了兼容旧数据，如果 block 还没显式写 `messageId`，
 * 这里会自动回退到 `groupId`。
 */
const groups = computed<SurfaceGroup[]>(() => {
  const next: SurfaceGroup[] = [];

  for (const block of slotBlocks.value) {
    const role = resolveBlockRole(block);
    const scope = resolveBlockMessageScope(block);
    const previous = next[next.length - 1];

    if (
      previous
      && scope.messageId
      && previous.messageId === scope.messageId
      && previous.role === role
    ) {
      previous.blocks.push(block);
      continue;
    }

    next.push({
      id: scope.messageId
        ? `${scope.messageId}:${next.length}`
        : scope.groupId
          ? `${scope.groupId}:${next.length}`
          : block.id,
      groupId: scope.groupId,
      conversationId: scope.conversationId,
      turnId: scope.turnId,
      messageId: scope.messageId,
      role,
      blocks: [block]
    });
  }

  return next;
});

watch(
  [() => groups.value.length, resolvedPerformance],
  ([nextLength, performance]) => {
    if (performance.groupWindow === false) {
      visibleGroupCount.value = nextLength;
      return;
    }

    const groupWindow = performance.groupWindow;
    const minimumVisibleGroupCount = Math.min(nextLength, groupWindow);

    if (visibleGroupCount.value === 0) {
      visibleGroupCount.value = minimumVisibleGroupCount;
      return;
    }

    if (visibleGroupCount.value < minimumVisibleGroupCount) {
      visibleGroupCount.value = minimumVisibleGroupCount;
      return;
    }

    if (visibleGroupCount.value > nextLength) {
      visibleGroupCount.value = nextLength;
    }
  },
  {
    immediate: true
  }
);

/**
 * 当前还有多少更早的 group 没有真正挂载到页面上。
 */
const hiddenGroupCount = computed(() => {
  if (resolvedPerformance.value.groupWindow === false) {
    return 0;
  }

  return Math.max(0, groups.value.length - visibleGroupCount.value);
});

/**
 * 当前实际参与渲染的 group 列表。
 */
const visibleGroups = computed<SurfaceGroup[]>(() => {
  if (hiddenGroupCount.value <= 0) {
    return groups.value;
  }

  return groups.value.slice(groups.value.length - visibleGroupCount.value);
});

/**
 * 向前展开更多历史 group，减少一次性全量挂载的开销。
 */
function revealPreviousGroups() {
  if (hiddenGroupCount.value <= 0) {
    return;
  }

  visibleGroupCount.value = Math.min(
    groups.value.length,
    visibleGroupCount.value + resolvedPerformance.value.groupWindowStep
  );
}

/**
 * 断开“加载更早消息”观察器。
 */
function disconnectLoadMoreObserver() {
  loadMoreObserver?.disconnect();
  loadMoreObserver = null;
}

/**
 * 当顶部哨兵进入视口时，自动继续展开更早的消息。
 */
async function syncLoadMoreObserver() {
  disconnectLoadMoreObserver();

  if (hiddenGroupCount.value <= 0 || typeof IntersectionObserver !== 'function') {
    return;
  }

  await nextTick();
  const element = loadMoreRef.value;

  if (!element) {
    return;
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        revealPreviousGroups();
      }
    },
    {
      root: null,
      rootMargin: '320px 0px 0px 0px',
      threshold: 0
    }
  );

  loadMoreObserver.observe(element);
}

watch(
  hiddenGroupCount,
  () => {
    syncLoadMoreObserver().catch(() => {
      disconnectLoadMoreObserver();
    });
  },
  {
    immediate: true,
    flush: 'post'
  }
);

/**
 * 判断 markdown block 是否已经有足够的可见内容。
 */
function hasMarkdownBlockVisibleContent(block: MarkdownBlock): boolean {
  switch (block.kind) {
    case 'text':
      return block.text.trim().length > 0;
    case 'html':
      return block.html.trim().length > 0;
    case 'code':
    case 'mermaid':
      return true;
    case 'math':
      return block.expression.trim().length > 0;
    case 'thought':
      return block.blocks.length > 0 || block.title.trim().length > 0;
    case 'agui':
    case 'artifact':
    case 'approval':
    case 'timeline':
      return true;
    default:
      return false;
  }
}

/**
 * 判断一个 surface block 是否已经包含肉眼可见的内容。
 */
function hasBlockVisibleContent(block: SurfaceBlock): boolean {
  if (typeof block.content === 'string' && block.content.trim().length > 0) {
    return true;
  }

  const data = block.data as Partial<MarkdownBlock> & { kind?: unknown };

  if (typeof data.kind === 'string') {
    return hasMarkdownBlockVisibleContent(data as MarkdownBlock);
  }

  if (block.renderer === 'markdown.draft' || block.renderer === 'text.draft' || block.renderer === 'markdown') {
    return false;
  }

  if (typeof block.data !== 'object' || block.data === null) {
    return block.data !== undefined;
  }

  return Object.keys(block.data).length > 0;
}

onBeforeUnmount(() => {
  unsubscribe?.();
  observer?.disconnect();
  disconnectLoadMoreObserver();
});
</script>

<template>
  <section
    ref="containerRef"
    class="agentdown-run-surface"
  >
    <p
      v-if="groups.length === 0"
      class="agentdown-run-surface-empty"
    >
      {{ emptyText }}
    </p>

    <div
      v-else
      class="agentdown-run-surface-list"
    >
      <div
        v-if="hiddenGroupCount > 0"
        ref="loadMoreRef"
        class="agentdown-run-surface-load-more"
      >
        <button
          type="button"
          class="agentdown-run-surface-load-more-button"
          @click="revealPreviousGroups"
        >
          显示更早消息 {{ hiddenGroupCount }}
        </button>
      </div>

      <article
        v-for="group in visibleGroups"
        :key="group.id"
        class="agentdown-run-surface-group"
        :data-role="group.role"
      >
        <div class="agentdown-run-surface-group-stack">
          <RunSurfaceBlock
            v-for="(block, index) in group.blocks"
            :key="block.id"
            :block="block"
            :role="group.role"
            :runtime="runtime"
            :snapshot="snapshot"
            :width="width"
            :line-height="lineHeight"
            :font="font"
            :agui-components="aguiComponents"
            :builtin-components="resolvedBuiltinComponents"
            :renderers="resolvedRenderers"
            :draft-placeholder="resolvedDraftPlaceholder"
            :message-shells="resolvedMessageShells"
            :lazy-mount="resolvedPerformance.lazyMount"
            :lazy-mount-margin="resolvedPerformance.lazyMountMargin"
            :text-slab-chars="resolvedPerformance.textSlabChars"
            :has-visible-content-before="group.blocks.slice(0, index).some(hasBlockVisibleContent)"
          />

          <RunSurfaceMessageActions
            :role="group.role"
            :blocks="group.blocks"
            :conversation-id="group.conversationId"
            :turn-id="group.turnId"
            :message-id="group.messageId"
            :group-id="group.groupId"
            :runtime="runtime"
            :snapshot="snapshot"
            :options="resolvedMessageActions[group.role]"
          />
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.agentdown-run-surface {
  width: 100%;
}

.agentdown-run-surface-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.agentdown-run-surface-load-more {
  display: flex;
  justify-content: center;
}

.agentdown-run-surface-load-more-button {
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  padding: 0.5rem 0.9rem;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: 0.82rem;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.agentdown-run-surface-load-more-button:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
}

.agentdown-run-surface-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(100%, 780px);
}

.agentdown-run-surface-group[data-role='assistant'] {
  align-self: flex-start;
  width: min(100%, 780px);
}

.agentdown-run-surface-group[data-role='user'] {
  align-self: flex-end;
  width: min(100%, 78%);
}

.agentdown-run-surface-group[data-role='system'] {
  align-self: center;
  width: min(100%, 680px);
}

.agentdown-run-surface-group-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.agentdown-run-surface-group[data-role='assistant'] .agentdown-run-surface-group-stack {
  align-items: flex-start;
}

.agentdown-run-surface-group[data-role='user'] .agentdown-run-surface-group-stack {
  align-items: flex-end;
}

.agentdown-run-surface-group[data-role='system'] .agentdown-run-surface-group-stack {
  align-items: center;
}

.agentdown-run-surface-empty {
  margin: 0;
  padding: 8px 2px;
  color: #64748b;
  line-height: 1.75;
  font-size: 14px;
}
</style>
