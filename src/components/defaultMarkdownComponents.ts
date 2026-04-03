import ApprovalBlock from './ApprovalBlock.vue';
import ArtifactBlock from './ArtifactBlock.vue';
import AguiComponentWrapper from './AguiComponentWrapper.vue';
import CodeBlock from './CodeBlock.vue';
import HtmlBlock from './HtmlBlock.vue';
import MathBlock from './MathBlock.vue';
import MermaidBlock from './MermaidBlock.vue';
import PretextTextBlock from './PretextTextBlock.vue';
import ThoughtBlock from './ThoughtBlock.vue';
import TimelineBlock from './TimelineBlock.vue';
import type { MarkdownBuiltinComponents } from '../core/types';

/** MarkdownRenderer 默认使用的块级渲染组件集合。 */
export const defaultMarkdownBuiltinComponents: MarkdownBuiltinComponents = {
  text: PretextTextBlock,
  code: CodeBlock,
  mermaid: MermaidBlock,
  math: MathBlock,
  thought: ThoughtBlock,
  html: HtmlBlock,
  agui: AguiComponentWrapper,
  artifact: ArtifactBlock,
  approval: ApprovalBlock,
  timeline: TimelineBlock
};
