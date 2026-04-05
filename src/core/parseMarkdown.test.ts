import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parseMarkdown';

describe('parseMarkdown', () => {
  it('keeps common inline markdown inside text blocks as structured fragments', () => {
    const [block] = parseMarkdown('这是一段 **加粗**、*强调*、~~删除线~~、[链接](https://example.com) 和 `代码`。');

    expect(block?.kind).toBe('text');
    if (block?.kind !== 'text') {
      return;
    }

    expect(block.text).toContain('加粗');
    expect(block.fragments?.some((fragment) => fragment.strong)).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.em)).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.del)).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.href === 'https://example.com')).toBe(true);
    expect(block.fragments?.some((fragment) => fragment.code)).toBe(true);
  });

  it('falls back to html block when inline content includes unsupported image tokens', () => {
    const [block] = parseMarkdown('这一段里有图片 ![alt](https://example.com/demo.png)');

    expect(block?.kind).toBe('html');
  });
});
