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
    return 'draft';
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
    return 'panel';
  }

  return 'plain';
});
</script>

<template>
  <div
    class="agentdown-run-surface-assistant-shell"
    :data-variant="variant"
    :data-block-kind="blockKind ?? undefined"
  >
    <slot />
  </div>
</template>

<style scoped>
.agentdown-run-surface-assistant-shell {
  display: block;
  min-width: 0;
}

.agentdown-run-surface-assistant-shell[data-variant='plain'],
.agentdown-run-surface-assistant-shell[data-variant='draft'] {
  max-width: min(100%, 720px);
}

.agentdown-run-surface-assistant-shell[data-variant='panel'] {
  max-width: min(100%, 560px);
}

.agentdown-run-surface-assistant-shell[data-variant='panel'][data-block-kind='approval'] {
  max-width: min(100%, 680px);
}

.agentdown-run-surface-assistant-shell[data-variant='draft'] :deep(.agentdown-run-surface-draft) {
  color: #475569;
}
</style>
