import { describe, expect, it } from 'vitest';
import type { MarkdownThoughtBlock, MarkdownTextBlock } from '../core/types';
import {
  hasHeavyMarkdownContent,
  splitMarkdownBlocksForRender,
  splitTextBlockIntoSlabs
} from './renderUtils';

describe('renderUtils', () => {
  it('splits long paragraph text into smaller slabs', () => {
    const block: MarkdownTextBlock = {
      id: 'text:1',
      kind: 'text',
      tag: 'p',
      text: '第一句很长很长。 第二句也很长很长。 第三句继续延伸。'
    };

    const slabs = splitTextBlockIntoSlabs(block, 10);

    expect(slabs.length).toBeGreaterThan(1);
    expect(slabs.map((item) => item.id)).toEqual([
      'text:1:slab:0',
      'text:1:slab:1',
      'text:1:slab:2'
    ]);
  });

  it('preserves inline fragments when a text block is split into slabs', () => {
    const block: MarkdownTextBlock = {
      id: 'text:rich',
      kind: 'text',
      tag: 'p',
      text: '你好 世界 链接 代码',
      fragments: [
        {
          id: 'frag:0',
          text: '你好 '
        },
        {
          id: 'frag:1',
          text: '世界',
          strong: true
        },
        {
          id: 'frag:2',
          text: ' '
        },
        {
          id: 'frag:3',
          text: '链接',
          href: 'https://example.com'
        },
        {
          id: 'frag:4',
          text: ' '
        },
        {
          id: 'frag:5',
          text: '代码',
          code: true
        }
      ]
    };

    const slabs = splitTextBlockIntoSlabs(block, 5);

    expect(slabs.length).toBeGreaterThan(1);
    expect(slabs[0]?.fragments?.some((fragment) => fragment.strong)).toBe(true);
    expect(slabs.at(-1)?.fragments?.some((fragment) => fragment.code)).toBe(true);
    expect(slabs.flatMap((item) => item.fragments ?? []).some((fragment) => fragment.href === 'https://example.com')).toBe(true);
  });

  it('recursively slabizes thought children without changing non-text blocks', () => {
    const thought: MarkdownThoughtBlock = {
      id: 'thought:1',
      kind: 'thought',
      title: '思考过程',
      blocks: [
        {
          id: 'text:inside',
          kind: 'text',
          tag: 'p',
          text: '这一段会被拆开。 这一段继续延伸。'
        },
        {
          id: 'code:1',
          kind: 'code',
          code: 'console.log(1)',
          language: 'ts',
          meta: ''
        }
      ]
    };

    const [nextThought] = splitMarkdownBlocksForRender([thought], 8);

    expect(nextThought?.kind).toBe('thought');
    if (nextThought?.kind !== 'thought') {
      return;
    }

    expect(nextThought.blocks[0]?.kind).toBe('text');
    expect(nextThought.blocks.length).toBeGreaterThan(2);
    expect(nextThought.blocks.at(-1)?.kind).toBe('code');
  });

  it('detects heavy content only when a heavy block exists', () => {
    expect(hasHeavyMarkdownContent([
      {
        id: 'text:1',
        kind: 'text',
        tag: 'p',
        text: '普通段落'
      }
    ])).toBe(false);

    expect(hasHeavyMarkdownContent([
      {
        id: 'artifact:1',
        kind: 'artifact',
        title: '报告',
        artifactKind: 'report'
      }
    ])).toBe(true);
  });
});
