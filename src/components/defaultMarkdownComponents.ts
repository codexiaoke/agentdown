import AguiComponentWrapper from './AguiComponentWrapper.vue';
import CodeBlock from './CodeBlock.vue';
import HtmlBlock from './HtmlBlock.vue';
import MathBlock from './MathBlock.vue';
import PretextTextBlock from './PretextTextBlock.vue';
import ThoughtBlock from './ThoughtBlock.vue';
import type { MarkdownBuiltinComponents } from '../core/types';

/** MarkdownRenderer 默认使用的块级渲染组件集合。 */
export const defaultMarkdownBuiltinComponents: MarkdownBuiltinComponents = {
  text: PretextTextBlock,
  code: CodeBlock,
  math: MathBlock,
  thought: ThoughtBlock,
  html: HtmlBlock,
  agui: AguiComponentWrapper
};
