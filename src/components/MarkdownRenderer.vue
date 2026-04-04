<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MarkdownBlockList from './MarkdownBlockList.vue';
import { defaultMarkdownBuiltinComponents } from './defaultMarkdownComponents';
import { parseMarkdown } from '../core/parseMarkdown';
import type {
  AguiComponentMap,
  MarkdownBuiltinComponentOverrides,
  MarkdownEnginePlugin
} from '../core/types';

interface Props {
  source: string;
  lineHeight?: number;
  font?: string;
  thoughtTitle?: string;
  aguiComponents?: AguiComponentMap;
  builtinComponents?: MarkdownBuiltinComponentOverrides;
  plugins?: MarkdownEnginePlugin[];
}

const props = withDefaults(defineProps<Props>(), {
  lineHeight: 26,
  font: '400 16px "Helvetica Neue"',
  thoughtTitle: 'Thought Process',
  aguiComponents: () => ({}),
  builtinComponents: () => ({}),
  plugins: () => []
});

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
const resolvedBuiltinComponents = computed(() => ({
  ...defaultMarkdownBuiltinComponents,
  ...props.builtinComponents
}));

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
    class="agentdown-root"
  >
    <MarkdownBlockList
      :blocks="blocks"
      :width="width"
      :line-height="lineHeight"
      :font="font"
      :agui-components="aguiComponents"
      :builtin-components="resolvedBuiltinComponents"
    />
  </div>
</template>
