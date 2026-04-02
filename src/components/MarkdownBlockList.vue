<script setup lang="ts">
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
      v-for="block in blocks"
      :key="block.id"
    >
      <component
        v-if="block.kind === 'text'"
        :is="builtinComponents.text"
        :tag="block.tag"
        :text="block.text"
        :width="width"
        :line-height="lineHeight"
        :font="font"
      />

      <component
        v-else-if="block.kind === 'code'"
        :is="builtinComponents.code"
        :code="block.code"
        :language="block.language"
      />

      <component
        v-else-if="block.kind === 'mermaid'"
        :is="builtinComponents.mermaid"
        :code="block.code"
      />

      <component
        v-else-if="block.kind === 'math'"
        :is="builtinComponents.math"
        :expression="block.expression"
        :display-mode="block.displayMode"
      />

      <component
        v-else-if="block.kind === 'thought'"
        :is="builtinComponents.thought"
        :title="block.title"
      >
        <MarkdownBlockList
          :blocks="block.blocks"
          :width="width"
          :line-height="lineHeight"
          :font="font"
          :agui-components="aguiComponents"
          :builtin-components="builtinComponents"
        />
      </component>

      <component
        v-else-if="block.kind === 'agui'"
        :is="builtinComponents.agui"
        :name="block.name"
        :component-props="block.props"
        :components="aguiComponents"
        :min-height="block.minHeight"
      />

      <component
        v-else
        :is="builtinComponents.html"
        :html="block.html"
      />
    </template>
  </div>
</template>
