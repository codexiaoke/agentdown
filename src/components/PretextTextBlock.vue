<script setup lang="ts">
import { computed } from 'vue';
import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import type { MarkdownHeadingTag } from '../core/types';

interface Props {
  tag: MarkdownHeadingTag;
  text: string;
  width: number;
  lineHeight: number;
  font: string;
}

const props = defineProps<Props>();

const prepared = computed(() => {
  if (!props.text.trim()) {
    return null;
  }

  // prepare 是相对昂贵的一次性预处理，后续宽度变化只需要重新 layout。
  return prepareWithSegments(props.text, props.font, {
    whiteSpace: 'pre-wrap'
  });
});

const lines = computed(() => {
  if (!prepared.value || props.width <= 0) {
    return [];
  }

  // 这里直接拿到每一行的文本结果，方便首版继续走 DOM 渲染。
  return layoutWithLines(prepared.value, props.width, props.lineHeight).lines;
});

const blockStyle = computed(() => {
  if (lines.value.length === 0) {
    return {};
  }

  return {
    height: `${lines.value.length * props.lineHeight}px`
  };
});

const textStyle = computed(() => ({
  font: props.font,
  lineHeight: `${props.lineHeight}px`
}));
</script>

<template>
  <component
    :is="tag"
    class="vpm-text-block"
    :style="[blockStyle, textStyle]"
  >
    <template v-if="lines.length > 0">
      <span
        v-for="(line, index) in lines"
        :key="`${tag}-${index}-${line.text}`"
        class="vpm-text-line"
        :style="{
          top: `${index * lineHeight}px`,
          height: `${lineHeight}px`
        }"
      >
        {{ line.text }}
      </span>
    </template>

    <template v-else>
      {{ text }}
    </template>
  </component>
</template>
