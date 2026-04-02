<script setup lang="ts">
import AguiComponentWrapper from './AguiComponentWrapper.vue';
import CodeBlock from './CodeBlock.vue';
import HtmlBlock from './HtmlBlock.vue';
import MathBlock from './MathBlock.vue';
import PretextTextBlock from './PretextTextBlock.vue';
import ThoughtBlock from './ThoughtBlock.vue';
import type { AguiComponentMap, MarkdownBlock } from '../core/types';

interface Props {
  blocks: MarkdownBlock[];
  width: number;
  lineHeight: number;
  font: string;
  aguiComponents: AguiComponentMap;
}

defineProps<Props>();
</script>

<template>
  <div class="vpm-block-list">
    <template
      v-for="block in blocks"
      :key="block.id"
    >
      <PretextTextBlock
        v-if="block.kind === 'text'"
        :tag="block.tag"
        :text="block.text"
        :width="width"
        :line-height="lineHeight"
        :font="font"
      />

      <CodeBlock
        v-else-if="block.kind === 'code'"
        :code="block.code"
        :language="block.language"
      />

      <MathBlock
        v-else-if="block.kind === 'math'"
        :expression="block.expression"
        :display-mode="block.displayMode"
      />

      <ThoughtBlock
        v-else-if="block.kind === 'thought'"
        :title="block.title"
      >
        <MarkdownBlockList
          :blocks="block.blocks"
          :width="width"
          :line-height="lineHeight"
          :font="font"
          :agui-components="aguiComponents"
        />
      </ThoughtBlock>

      <AguiComponentWrapper
        v-else-if="block.kind === 'agui'"
        :name="block.name"
        :component-props="block.props"
        :components="aguiComponents"
        :min-height="block.minHeight"
      />

      <HtmlBlock
        v-else
        :html="block.html"
      />
    </template>
  </div>
</template>
