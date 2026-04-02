import MarkdownIt from 'markdown-it';
import markdownItMath from 'markdown-it-math/no-default-renderer';
import katex from 'katex';
import { aguiPlugin } from './plugins/agui';
import { thoughtPlugin } from './plugins/thought';
import type { MarkdownEnginePlugin } from './types';

export function createMarkdownEngine(plugins: MarkdownEnginePlugin[] = []): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: true
  });

  md.use(markdownItMath, {
    inlineRenderer(src: string) {
      return katex.renderToString(src, {
        throwOnError: false,
        output: 'html'
      });
    },
    blockRenderer(src: string) {
      return katex.renderToString(src, {
        throwOnError: false,
        displayMode: true,
        output: 'html'
      });
    }
  });

  md.use(thoughtPlugin);
  md.use(aguiPlugin);

  for (const plugin of plugins) {
    plugin(md);
  }

  return md;
}
