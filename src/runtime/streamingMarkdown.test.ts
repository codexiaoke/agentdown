import { describe, expect, it } from 'vitest';
import {
  findStreamingMarkdownBoundary,
  resolveStreamingMarkdownTailInfo,
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

  it('keeps an unfinished html block entirely in draft even when a blank line appears', () => {
    expect(findStreamingMarkdownBoundary('<div>\n  <p>hello</p>\n\n## 下一节\n')).toBe(0);
  });

  it('commits a closed html block before leaving the following tail as draft', () => {
    expect(splitStreamingMarkdown('<section>\n天气说明\n</section>\n下一段草稿')).toEqual({
      committed: '<section>\n天气说明\n</section>\n',
      draft: '下一段草稿'
    });
  });

  it('returns structured tail info for fence, html and paragraph tails', () => {
    expect(resolveStreamingMarkdownTailInfo('```ts\nconst answer = 42')).toEqual({
      mode: 'preview',
      kind: 'fence',
      stability: 'close-stable',
      multiline: true
    });

    expect(resolveStreamingMarkdownTailInfo('<div>\n  still streaming')).toEqual({
      mode: 'preview',
      kind: 'html',
      stability: 'close-stable',
      multiline: true
    });

    expect(resolveStreamingMarkdownTailInfo('普通段落草稿')).toEqual({
      mode: 'text',
      kind: 'paragraph',
      stability: 'separator-stable',
      multiline: false
    });
  });
});
