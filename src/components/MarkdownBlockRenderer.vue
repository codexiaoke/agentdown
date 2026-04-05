<script setup lang="ts">
import MarkdownBlockList from './MarkdownBlockList.vue';
import type {
  AguiComponentMap,
  MarkdownBlock,
  MarkdownBuiltinComponents
} from '../core/types';

/**
 * `MarkdownBlockRenderer` 的输入参数。
 */
interface Props {
  block: MarkdownBlock;
  width: number;
  lineHeight: number;
  font: string;
  aguiComponents: AguiComponentMap;
  builtinComponents: MarkdownBuiltinComponents;
}

defineProps<Props>();
</script>

<template>
  <component
    :is="builtinComponents.text"
    v-if="block.kind === 'text'"
    :tag="block.tag"
    :text="block.text"
    :fragments="block.fragments"
    :width="width"
    :line-height="lineHeight"
    :font="font"
  />

  <component
    :is="builtinComponents.code"
    v-else-if="block.kind === 'code'"
    :code="block.code"
    :language="block.language"
  />

  <component
    :is="builtinComponents.mermaid"
    v-else-if="block.kind === 'mermaid'"
    :code="block.code"
  />

  <component
    :is="builtinComponents.math"
    v-else-if="block.kind === 'math'"
    :expression="block.expression"
    :display-mode="block.displayMode"
  />

  <component
    :is="builtinComponents.thought"
    v-else-if="block.kind === 'thought'"
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
    :is="builtinComponents.agui"
    v-else-if="block.kind === 'agui'"
    :name="block.name"
    :component-props="block.props"
    :components="aguiComponents"
    :min-height="block.minHeight"
  />

  <component
    :is="builtinComponents.artifact"
    v-else-if="block.kind === 'artifact'"
    :title="block.title"
    :message="block.message"
    :artifact-id="block.artifactId"
    :artifact-kind="block.artifactKind"
    :label="block.label"
    :href="block.href"
    :ref-id="block.refId"
  />

  <component
    :is="builtinComponents.approval"
    v-else-if="block.kind === 'approval'"
    :title="block.title"
    :message="block.message"
    :approval-id="block.approvalId"
    :status="block.status"
    :ref-id="block.refId"
  />

  <component
    :is="builtinComponents.timeline"
    v-else-if="block.kind === 'timeline'"
    :title="block.title"
    :limit="block.limit"
    :empty-text="block.emptyText"
    :ref-id="block.refId"
  />

  <component
    :is="builtinComponents.html"
    v-else
    :html="block.html"
  />
</template>
