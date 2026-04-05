import { describe, expect, it } from 'vitest';
import {
  findStreamingMarkdownBoundary,
  resolveStreamingMarkdownDraftMode,
  splitStreamingMarkdown
} from './streamingMarkdown';

describe('streamingMarkdown', () => {
  it('commits a full setext heading before leaving the tail as draft', () => {
    expect(splitStreamingMarkdown('部署说明\n---\n最后一行草稿')).toEqual({
      committed: '部署说明\n---\n',
      draft: '最后一行草稿'
    });
  });

  it('keeps an unfinished table entirely in draft', () => {
    expect(findStreamingMarkdownBoundary('| 步骤 |\n| --- |\n| build |')).toBe(0);
  });

  it('marks blockquote and list tails as preview', () => {
    expect(resolveStreamingMarkdownDraftMode('> 正在生成引用')).toBe('preview');
    expect(resolveStreamingMarkdownDraftMode('- 正在生成列表')).toBe('preview');
  });

  it('marks a table header plus divider fragment as preview', () => {
    expect(resolveStreamingMarkdownDraftMode('| 步骤 |\n| --')).toBe('preview');
  });

  it('keeps a lone fence hidden until body content appears', () => {
    expect(resolveStreamingMarkdownDraftMode('```ts\n')).toBe('hidden');
    expect(resolveStreamingMarkdownDraftMode('```ts\nconst answer = 42')).toBe('preview');
  });
});
