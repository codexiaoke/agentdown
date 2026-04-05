import { describe, expect, it } from 'vitest';
import {
  createStreamingMarkdownTextBlock,
  parseStreamingInlineFragments
} from './streamingInlineFragments';

describe('parseStreamingInlineFragments', () => {
  it('activates strong formatting immediately after the opening marker arrives', () => {
    const fragments = parseStreamingInlineFragments('根据查询结果，**天气状况： 阴天');

    expect(fragments.map((fragment) => fragment.text).join('')).toBe('根据查询结果，天气状况： 阴天');
    expect(fragments.some((fragment) => fragment.strong && fragment.text.includes('天气状况'))).toBe(true);
  });

  it('keeps ordinary single asterisks as plain text to avoid false positives', () => {
    const fragments = parseStreamingInlineFragments('2 * 3 = 6');

    expect(fragments.map((fragment) => fragment.text).join('')).toBe('2 * 3 = 6');
    expect(fragments.some((fragment) => fragment.strong || fragment.del || fragment.code)).toBe(false);
  });
});

describe('createStreamingMarkdownTextBlock', () => {
  it('creates a text block with pretext-friendly fragments for draft rendering', () => {
    const block = createStreamingMarkdownTextBlock('温度： **13.3°C', 'draft:text');

    expect(block.kind).toBe('text');
    expect(block.text).toBe('温度： 13.3°C');
    expect(block.fragments?.some((fragment) => fragment.strong && fragment.text.includes('13.3°C'))).toBe(true);
  });
});
