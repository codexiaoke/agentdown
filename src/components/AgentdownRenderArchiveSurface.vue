<script setup lang="ts">
import { computed } from 'vue';
import type { AgentRuntime } from '../runtime/types';
import RunSurface from './RunSurface.vue';
import { useAgentdownRenderArchive } from '../composables/useAgentdownRenderArchive';
import type { AgentdownRecordsAdapter } from '../persisted/adapter';
import type { BuiltinAgentdownRenderArchive, BuiltinAgentdownRenderRecord } from '../persisted/builtin';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../persisted/types';

defineOptions({
  inheritAttrs: false
});

interface Props {
  input:
    | string
    | AgentdownRenderArchive
    | Record<string, unknown>
    | readonly AgentdownRenderRecord[]
    | null
    | undefined;
  adapter?: AgentdownRecordsAdapter | undefined;
  runtime?: AgentRuntime | undefined;
  resetOnChange?: boolean | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  resetOnChange: true
});

const state = useAgentdownRenderArchive<
  BuiltinAgentdownRenderRecord | AgentdownRenderRecord,
  BuiltinAgentdownRenderArchive | AgentdownRenderArchive
>({
  input: computed(() => props.input),
  adapter: computed(() => props.adapter),
  ...(props.runtime
    ? {
        runtime: props.runtime
      }
    : {}),
  resetOnChange: props.resetOnChange
});
</script>

<template>
  <RunSurface
    :runtime="state.runtime"
    v-bind="$attrs"
  />
</template>
