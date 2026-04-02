<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MarkdownBlockList from './MarkdownBlockList.vue';
import { parseMarkdown } from '../core/parseMarkdown';
import type { AguiComponentMap, MarkdownEnginePlugin } from '../core/types';

interface Props {
  source: string;
  lineHeight?: number;
  font?: string;
  thoughtTitle?: string;
  aguiComponents?: AguiComponentMap;
  plugins?: MarkdownEnginePlugin[];
}

const props = withDefaults(defineProps<Props>(), {
  lineHeight: 26,
  font: '400 16px "Helvetica Neue"',
  thoughtTitle: 'Thought Process',
  aguiComponents: () => ({}),
  plugins: () => []
});

const containerRef = ref<HTMLElement | null>(null);
const width = ref(0);

const blocks = computed(() =>
  parseMarkdown(props.source, {
    plugins: props.plugins,
    thoughtTitle: props.thoughtTitle,
    aguiComponents: props.aguiComponents
  })
);

let observer: ResizeObserver | null = null;

function updateWidth() {
  width.value = containerRef.value?.clientWidth ?? 0;
}

watch(() => props.source, updateWidth);

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
  observer?.disconnect();
});
</script>

<template>
  <div
    ref="containerRef"
    class="vpm-root"
  >
    <MarkdownBlockList
      :blocks="blocks"
      :width="width"
      :line-height="lineHeight"
      :font="font"
      :agui-components="aguiComponents"
    />
  </div>
</template>
