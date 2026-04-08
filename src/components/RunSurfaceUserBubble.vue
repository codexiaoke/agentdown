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
  >
    <slot />
  </div>
</template>

<style scoped>
.agentdown-run-surface-user-bubble {
  display: block;
  min-width: 0;
}

.agentdown-run-surface-user-bubble[data-variant='bubble'] {
  display: inline-block;
  max-width: min(100%, 560px);
  border-radius: 20px;
  padding: 12px 16px;
  background: linear-gradient(180deg, #f4f8ff, #e8f1ff);
  box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.42);
}

.agentdown-run-surface-user-bubble[data-variant='bare'] {
  max-width: min(100%, 560px);
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
}

.agentdown-run-surface-user-bubble :deep(.agentdown-text-block:last-child),
.agentdown-run-surface-user-bubble :deep(.agentdown-html-block :is(p, ul, ol, blockquote, pre, figure, hr):last-child) {
  margin-bottom: 0;
}
</style>
