import container from 'markdown-it-container';
import type MarkdownIt from 'markdown-it';

/** 注册 :::thought 容器语法。 */
export function thoughtPlugin(md: MarkdownIt): void {
  md.use(container, 'thought', {
    /** 只接受完全匹配的 thought 容器声明。 */
    validate(params: string) {
      return params.trim() === 'thought';
    }
  });
}
