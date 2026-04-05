<script setup lang="ts">
import { computed } from 'vue';
import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import {
  layoutPretextRichTextLines,
  preparePretextRichTextItems,
  resolvePretextTypography
} from './pretextRichText';
import type { MarkdownHeadingTag, MarkdownInlineFragment } from '../core/types';

/**
 * `PretextTextBlock` 的输入参数。
 */
interface Props {
  tag: MarkdownHeadingTag;
  text: string;
  fragments?: MarkdownInlineFragment[];
  width: number;
  lineHeight: number;
  font: string;
}

const props = defineProps<Props>();

/**
 * 当前 block 对应的排版参数。
 */
const typography = computed(() => resolvePretextTypography(props.tag, props.font, props.lineHeight));

/**
 * 判断当前 block 是否需要进入 rich inline 布局链。
 */
const hasRichFragments = computed(() => {
  return Array.isArray(props.fragments) && props.fragments.length > 0;
});

/**
 * 纯文本模式下的一次性 pretext 预处理结果。
 */
const prepared = computed(() => {
  if (hasRichFragments.value || !props.text.trim()) {
    return null;
  }

  return prepareWithSegments(props.text, typography.value.blockFont, {
    whiteSpace: 'pre-wrap'
  });
});

/**
 * 纯文本模式下的逐行布局结果。
 */
const lines = computed(() => {
  if (!prepared.value || props.width <= 0) {
    return [];
  }

  return layoutWithLines(prepared.value, props.width, typography.value.lineHeight).lines;
});

/**
 * rich inline 模式下的一次性 fragment 预处理结果。
 */
const preparedRichItems = computed(() => {
  if (!hasRichFragments.value) {
    return [];
  }

  return preparePretextRichTextItems(props.fragments ?? [], typography.value);
});

/**
 * rich inline 模式下的逐行布局结果。
 */
const richLines = computed(() => {
  if (!hasRichFragments.value || props.width <= 0) {
    return [];
  }

  return layoutPretextRichTextLines(preparedRichItems.value, props.width);
});

/**
 * 当前 block 的总行数。
 */
const lineCount = computed(() => {
  return hasRichFragments.value ? richLines.value.length : lines.value.length;
});

/**
 * block 根节点的样式，负责同步 pretext 所依赖的真实字体与高度。
 */
const blockStyle = computed(() => {
  return {
    ...(lineCount.value > 0
      ? { height: `${lineCount.value * typography.value.lineHeight}px` }
      : {}),
    font: typography.value.blockFont,
    lineHeight: `${typography.value.lineHeight}px`
  };
});

/**
 * 为较小层级标题补一个更轻的视觉 tone。
 */
const blockTone = computed(() => {
  return props.tag === 'h6' ? 'subtle' : 'default';
});
</script>

<template>
  <component
    :is="tag"
    class="agentdown-text-block"
    :data-tag="tag"
    :data-tone="blockTone"
    :style="blockStyle"
  >
    <template v-if="hasRichFragments && richLines.length > 0">
      <span
        v-for="(line, index) in richLines"
        :key="`${tag}-${index}`"
        class="agentdown-text-line agentdown-text-line--rich"
        :class="{
          'agentdown-text-line--empty': line.fragments.length === 0
        }"
        :style="{
          top: `${index * typography.lineHeight}px`,
          height: `${typography.lineHeight}px`
        }"
      >
        <component
          :is="fragment.href ? 'a' : 'span'"
          v-for="fragment in line.fragments"
          :key="fragment.id"
          class="agentdown-text-fragment"
          :class="{
            'agentdown-text-fragment--strong': fragment.strong,
            'agentdown-text-fragment--em': fragment.em,
            'agentdown-text-fragment--del': fragment.del,
            'agentdown-text-fragment--code': fragment.code,
            'agentdown-text-fragment--link': !!fragment.href
          }"
          :href="fragment.href"
          :target="fragment.href ? '_blank' : undefined"
          :rel="fragment.href ? 'noreferrer noopener' : undefined"
          :style="fragment.leadingGap > 0 ? { marginLeft: `${fragment.leadingGap}px` } : undefined"
        >
          {{ fragment.text }}
        </component>
      </span>
    </template>

    <template v-else-if="lines.length > 0">
      <span
        v-for="(line, index) in lines"
        :key="`${tag}-${index}-${line.text}`"
        class="agentdown-text-line"
        :style="{
          top: `${index * typography.lineHeight}px`,
          height: `${typography.lineHeight}px`
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
