<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { defaultMarkdownBuiltinComponents } from './defaultMarkdownComponents';
import RunSurfaceAssistantShell from './RunSurfaceAssistantShell.vue';
import RunSurfaceBlock from './RunSurfaceBlock.vue';
import RunSurfaceUserBubble from './RunSurfaceUserBubble.vue';
import type {
  AguiComponentMap,
  MarkdownBlock,
  MarkdownBuiltinComponentOverrides
} from '../core/types';
import type { AgentRuntime, RuntimeSnapshot, SurfaceBlock } from '../runtime/types';
import type {
  RunSurfaceDraftPlaceholder,
  RunSurfaceMessageShellContext,
  RunSurfaceMessageShellMap,
  RunSurfaceRendererMap,
  RunSurfaceRole
} from '../surface/types';

interface Props {
  runtime: AgentRuntime;
  slot?: string;
  lineHeight?: number;
  font?: string;
  emptyText?: string;
  aguiComponents?: AguiComponentMap;
  builtinComponents?: MarkdownBuiltinComponentOverrides;
  renderers?: RunSurfaceRendererMap;
  draftPlaceholder?: RunSurfaceDraftPlaceholder;
  messageShells?: RunSurfaceMessageShellMap;
}

interface SurfaceGroup {
  id: string;
  groupId: string | null;
  role: RunSurfaceRole;
  blocks: SurfaceBlock[];
}

const props = withDefaults(defineProps<Props>(), {
  slot: 'main',
  lineHeight: 26,
  font: '400 16px "Helvetica Neue"',
  emptyText: '等待新的运行输出...',
  aguiComponents: () => ({}),
  builtinComponents: () => ({}),
  renderers: () => ({}),
  draftPlaceholder: false,
  messageShells: () => ({
    user: RunSurfaceUserBubble
  })
});

const containerRef = ref<HTMLElement | null>(null);
const width = ref(0);
const snapshot = shallowRef<RuntimeSnapshot>(props.runtime.snapshot());
const resolvedBuiltinComponents = computed(() => ({
  ...defaultMarkdownBuiltinComponents,
  ...props.builtinComponents
}));
const resolvedDraftPlaceholder = computed<RunSurfaceDraftPlaceholder>(() => props.draftPlaceholder ?? false);
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

let unsubscribe: (() => void) | null = null;
let observer: ResizeObserver | null = null;

function updateWidth() {
  width.value = containerRef.value?.clientWidth ?? 0;
}

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

onBeforeUnmount(() => {
  unsubscribe?.();
  observer?.disconnect();
});

const slotBlocks = computed(() => {
  return snapshot.value.blocks.filter((block) => block.slot === props.slot);
});

const nodesById = computed(() => {
  return new Map(snapshot.value.nodes.map((node) => [node.id, node]));
});

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

const groups = computed<SurfaceGroup[]>(() => {
  const next: SurfaceGroup[] = [];

  for (const block of slotBlocks.value) {
    const role = resolveBlockRole(block);
    const groupId = block.groupId ?? null;
    const previous = next[next.length - 1];

    if (previous && groupId && previous.groupId === groupId && previous.role === role) {
      previous.blocks.push(block);
      continue;
    }

    next.push({
      id: groupId ? `${groupId}:${next.length}` : block.id,
      groupId,
      role,
      blocks: [block]
    });
  }

  return next;
});

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
      <article
        v-for="group in groups"
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
            :renderers="renderers"
            :draft-placeholder="resolvedDraftPlaceholder"
            :message-shells="resolvedMessageShells"
            :has-visible-content-before="group.blocks.slice(0, index).some(hasBlockVisibleContent)"
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
