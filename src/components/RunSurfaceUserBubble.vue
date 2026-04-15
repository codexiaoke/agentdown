<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  kind?: 'markdown' | 'draft';
  blockKind?: string | null;
}>(), {
  kind: 'markdown',
  blockKind: null
});

const variant = computed(() => {
  if (props.kind === 'draft') {
    return 'bubble';
  }

  if (
    props.blockKind === 'artifact'
    || props.blockKind === 'approval'
    || props.blockKind === 'attachment'
    || props.blockKind === 'branch'
    || props.blockKind === 'handoff'
    || props.blockKind === 'agui'
    || props.blockKind === 'code'
    || props.blockKind === 'mermaid'
    || props.blockKind === 'math'
    || props.blockKind === 'timeline'
  ) {
    return 'bare';
  }

  return 'bubble';
});
</script>

<template>
  <div
    class="agentdown-run-surface-user-bubble"
    :data-variant="variant"
    :data-block-kind="blockKind ?? undefined"
  >
    <slot />
  </div>
</template>

<style scoped>
.agentdown-run-surface-user-bubble {
  display: block;
  max-width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

.agentdown-run-surface-user-bubble[data-variant='bubble'] {
  display: inline-block;
  max-width: min(100%, 560px);
  border-radius: 18px;
  padding: 12px 16px;
  background: #f3f4f6;
}

.agentdown-run-surface-user-bubble[data-variant='bare'] {
  width: 100%;
  max-width: 100%;
}

.agentdown-run-surface-user-bubble[data-variant='bare'][data-block-kind='attachment'],
.agentdown-run-surface-user-bubble[data-variant='bare'][data-block-kind='artifact'] {
  width: auto;
  max-width: 100%;
}

.agentdown-run-surface-user-bubble :deep(.agentdown-run-surface-markdown),
.agentdown-run-surface-user-bubble :deep(.agentdown-run-surface-draft) {
  display: block;
  min-width: 0;
}

.agentdown-run-surface-user-bubble :deep(.agentdown-block-list) {
  gap: 0.8rem;
}

.agentdown-run-surface-user-bubble[data-variant='bubble'] :deep(.agentdown-text-block) {
  width: auto !important;
  height: auto !important;
}

.agentdown-run-surface-user-bubble[data-variant='bubble'] :deep(.agentdown-text-line) {
  position: static !important;
  right: auto !important;
  top: auto !important;
  height: auto !important;
  color: inherit;
  font-weight: inherit;
}

.agentdown-run-surface-user-bubble :deep(.agentdown-text-block:last-child),
.agentdown-run-surface-user-bubble :deep(.agentdown-html-block :is(p, ul, ol, blockquote, pre, figure, hr):last-child) {
  margin-bottom: 0;
}
</style>
