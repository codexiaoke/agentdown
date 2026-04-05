<script setup lang="ts">
import MarkdownBlockRenderer from './MarkdownBlockRenderer.vue';
import { getMarkdownBlockGapAfter } from './markdownBlockSpacing';
import type { AguiComponentMap, MarkdownBlock, MarkdownBuiltinComponents } from '../core/types';

interface Props {
  blocks: MarkdownBlock[];
  width: number;
  lineHeight: number;
  font: string;
  aguiComponents: AguiComponentMap;
  builtinComponents: MarkdownBuiltinComponents;
}

defineProps<Props>();
</script>

<template>
  <div class="agentdown-block-list">
    <template
      v-for="(block, index) in blocks"
      :key="block.id"
    >
      <div
        class="agentdown-block-slot"
        :style="{
          paddingBottom: `${getMarkdownBlockGapAfter(block, blocks[index + 1])}px`
        }"
      >
        <MarkdownBlockRenderer
          :block="block"
          :width="width"
          :line-height="lineHeight"
          :font="font"
          :agui-components="aguiComponents"
          :builtin-components="builtinComponents"
        />
      </div>
    </template>
  </div>
</template>
