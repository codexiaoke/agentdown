import container from 'markdown-it-container';
import type MarkdownIt from 'markdown-it';

export function thoughtPlugin(md: MarkdownIt): void {
  md.use(container, 'thought', {
    validate(params: string) {
      return params.trim() === 'thought';
    }
  });
}
