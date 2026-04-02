<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import MarkdownBlockList from './MarkdownBlockList.vue';
import { AGUI_RUNTIME_KEY } from '../core/aguiRuntime';
import { parseMarkdown } from '../core/parseMarkdown';
import type { AguiComponentMap, AguiRuntime, MarkdownEnginePlugin } from '../core/types';

interface Props {
  source: string;
  lineHeight?: number;
  font?: string;
  thoughtTitle?: string;
  aguiComponents?: AguiComponentMap;
  aguiRuntime?: AguiRuntime | null;
  plugins?: MarkdownEnginePlugin[];
}

const props = withDefaults(defineProps<Props>(), {
  lineHeight: 26,
  font: '400 16px "Helvetica Neue"',
  thoughtTitle: 'Thought Process',
  aguiComponents: () => ({}),
  aguiRuntime: null,
  plugins: () => []
});

provide(AGUI_RUNTIME_KEY, props.aguiRuntime);

const containerRef = ref<HTMLElement | null>(null);
const width = ref(0);

// source 变化时重新解析 block，但布局仍然依赖容器宽度单独计算。
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

  // pretext 布局依赖宽度，所以这里直接监听容器尺寸变化。
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
