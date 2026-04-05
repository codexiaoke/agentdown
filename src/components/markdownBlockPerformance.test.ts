import { describe, expect, it } from 'vitest';
import { shouldMeasureMarkdownBlockHeight } from './markdownBlockPerformance';
import type { MarkdownBlock } from '../core/types';

/**
 * 构造最小 text block，供测量策略测试复用。
 */
function createTextBlock(): MarkdownBlock {
  return {
    id: 'text:1',
    kind: 'text',
    tag: 'p',
    text: 'hello'
  };
}

describe('markdownBlockPerformance', () => {
  it('skips exact measurement for blocks with predictable height', () => {
    expect(shouldMeasureMarkdownBlockHeight(createTextBlock())).toBe(false);
    expect(
      shouldMeasureMarkdownBlockHeight({
        id: 'code:1',
        kind: 'code',
        code: 'console.log("hi")',
        language: 'ts',
        meta: ''
      })
    ).toBe(false);
    expect(
      shouldMeasureMarkdownBlockHeight({
        id: 'artifact:1',
        kind: 'artifact',
        title: 'artifact',
        artifactKind: 'file'
      })
    ).toBe(false);
  });

  it('keeps exact measurement for blocks whose rendered height is harder to predict', () => {
    expect(
      shouldMeasureMarkdownBlockHeight({
        id: 'html:1',
        kind: 'html',
        html: '<table><tr><td>hello</td></tr></table>'
      })
    ).toBe(true);
    expect(
      shouldMeasureMarkdownBlockHeight({
        id: 'thought:1',
        kind: 'thought',
        title: 'thought',
        blocks: [createTextBlock()]
      })
    ).toBe(true);
    expect(
      shouldMeasureMarkdownBlockHeight({
        id: 'agui:1',
        kind: 'agui',
        name: 'Demo',
        props: {},
        minHeight: 120
      })
    ).toBe(true);
  });
});
