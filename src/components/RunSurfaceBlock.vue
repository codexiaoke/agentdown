<script setup lang="ts">
import { computed } from 'vue';
import MarkdownBlockList from './MarkdownBlockList.vue';
import { parseMarkdown } from '../core/parseMarkdown';
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
  SurfaceBlock
} from '../runtime/types';
import type {
  RunSurfaceDraftPlaceholder,
  RunSurfaceDraftPlaceholderContext,
  RunSurfaceDraftPlaceholderRegistration,
  RunSurfaceMessageShellContext,
  RunSurfaceMessageShellMap,
  RunSurfaceMessageShellRegistration,
  RunSurfaceRendererContext,
  RunSurfaceRendererMap,
  RunSurfaceRendererRegistration,
  RunSurfaceRole
} from '../surface/types';

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
  hasVisibleContentBefore: boolean;
}

const props = defineProps<Props>();

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
  'timeline'
]);

const node = computed<RuntimeNode | undefined>(() => {
  if (!props.block.nodeId) {
    return undefined;
  }

  return props.snapshot.nodes.find((candidate) => candidate.id === props.block.nodeId);
});

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

const draftPlaceholderContext = computed<RunSurfaceDraftPlaceholderContext>(() => ({
  block: props.block,
  role: props.role,
  runtime: props.runtime,
  snapshot: props.snapshot,
  emitIntent
}));

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

const isDraftLike = computed(() => {
  return (
    props.block.state === 'draft'
    || props.block.renderer === 'markdown.draft'
    || props.block.renderer === 'text.draft'
    || props.block.renderer === 'markdown'
  );
});

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

const draftMode = computed(() => {
  const mode = (props.block.data as { streamingDraftMode?: unknown }).streamingDraftMode;
  if (mode === 'hidden' || mode === 'preview') {
    return mode;
  }

  return 'text';
});

const draftPreviewBlocks = computed<MarkdownBlock[]>(() => {
  if (!isDraftLike.value || draftMode.value !== 'preview' || fallbackText.value.trim().length === 0) {
    return [];
  }

  return parseMarkdown(fallbackText.value, {
    aguiComponents: props.aguiComponents
  });
});

const draftPreviewBlock = computed<MarkdownBlock | null>(() => {
  return draftPreviewBlocks.value[0] ?? null;
});

const shouldRenderDraft = computed(() => {
  return (
    isDraftLike.value
    && draftMode.value !== 'hidden'
    && fallbackText.value.trim().length > 0
  );
});

const shouldRenderDraftPreview = computed(() => {
  return (
    !rendererRegistration.value
    && isDraftLike.value
    && draftMode.value === 'preview'
    && draftPreviewBlocks.value.length > 0
  );
});

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

const shouldHideBlock = computed(() => {
  return (
    !rendererRegistration.value
    && isDraftLike.value
    && !shouldRenderDraft.value
    && !shouldRenderDraftPreview.value
    && !shouldRenderDraftPlaceholder.value
  );
});

const shouldRenderMessageShell = computed(() => {
  return !!messageShellRegistration.value;
});

function emitIntent(intent: Omit<RuntimeIntent, 'id' | 'at'>) {
  return props.runtime.emitIntent(intent);
}
</script>

<template>
  <div
    class="agentdown-run-surface-block"
    :data-renderer="block.renderer"
    :data-state="block.state"
  >
    <component
      :is="rendererRegistration.component"
      v-if="rendererRegistration"
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
        >
          <MarkdownBlockList
            :blocks="draftPreviewBlocks"
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
    >
      <MarkdownBlockList
        :blocks="draftPreviewBlocks"
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
    >
      <p class="agentdown-run-surface-draft-text">
        {{ fallbackText }}
      </p>
    </div>

    <div
      v-else-if="markdownBlock && shouldRenderMessageShell && messageShellRegistration"
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
            :blocks="[markdownBlock]"
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
      v-else-if="markdownBlock"
      class="agentdown-run-surface-markdown"
      :data-role="role"
    >
      <MarkdownBlockList
        :blocks="[markdownBlock]"
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
