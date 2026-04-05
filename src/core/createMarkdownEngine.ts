import MarkdownIt from 'markdown-it';
import markdownItMath from 'markdown-it-math/no-default-renderer';
import katex from 'katex';
import { aguiPlugin } from './plugins/agui';
import { agentDirectivesPlugin } from './plugins/agentDirectives';
import { thoughtPlugin } from './plugins/thought';
import type { MarkdownEnginePlugin } from './types';

/**
 * 创建 markdown engine 时的底层选项。
 */
export interface MarkdownEngineOptions {
  /**
   * 是否允许原始 HTML 直接被 markdown-it 当作 HTML 解析。
   * 默认关闭；开启后仅适用于可信内容。
   */
  allowUnsafeHtml?: boolean;
}

/** 创建一份带内置扩展的 markdown-it 实例。 */
export function createMarkdownEngine(
  plugins: MarkdownEnginePlugin[] = [],
  options: MarkdownEngineOptions = {}
): MarkdownIt {
  const md = new MarkdownIt({
    html: options.allowUnsafeHtml ?? false,
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
  md.use(agentDirectivesPlugin);

  for (const plugin of plugins) {
    plugin(md);
  }

  return md;
}
