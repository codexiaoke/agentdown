import MarkdownIt from 'markdown-it';
import markdownItMath from 'markdown-it-math/no-default-renderer';
import katex from 'katex';
import { aguiPlugin } from './plugins/agui';
import { thoughtPlugin } from './plugins/thought';
import type { MarkdownEnginePlugin } from './types';

/** 创建一份带内置扩展的 markdown-it 实例。 */
export function createMarkdownEngine(plugins: MarkdownEnginePlugin[] = []): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: true
  });

  // 首版先把公式直接转成可渲染 HTML，后面如果要做精细布局再单独拆 token。
  md.use(markdownItMath, {
    /** 统一处理行内公式输出。 */
    inlineRenderer(src: string) {
      return katex.renderToString(src, {
        throwOnError: false,
        output: 'html'
      });
    },
    /** 统一处理块级公式输出。 */
    blockRenderer(src: string) {
      return katex.renderToString(src, {
        throwOnError: false,
        displayMode: true,
        output: 'html'
      });
    }
  });

  // 内置扩展优先注册，外部插件可以在这个基础上继续扩展。
  md.use(thoughtPlugin);
  md.use(aguiPlugin);

  for (const plugin of plugins) {
    plugin(md);
  }

  return md;
}
