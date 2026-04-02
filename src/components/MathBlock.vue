<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';

interface Props {
  expression: string;
  displayMode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  displayMode: true
});

const html = computed(() =>
  katex.renderToString(props.expression, {
    throwOnError: false,
    displayMode: props.displayMode
  })
);
</script>

<template>
  <div
    class="agentdown-math-block"
    v-html="html"
  />
</template>
