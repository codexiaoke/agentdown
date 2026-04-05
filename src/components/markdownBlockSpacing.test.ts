import { describe, expect, it } from 'vitest';
import { getMarkdownBlockGapAfter } from './markdownBlockSpacing';
import type { MarkdownBlock } from '../core/types';

describe('markdownBlockSpacing', () => {
  it('uses tighter spacing between consecutive heading blocks', () => {
    const current: MarkdownBlock = {
      id: 'h1',
      kind: 'text',
      tag: 'h1',
      text: 'Title'
    };
    const next: MarkdownBlock = {
      id: 'h2',
      kind: 'text',
      tag: 'h2',
      text: 'Subtitle'
    };

    expect(getMarkdownBlockGapAfter(current, next)).toBe(10);
  });

  it('uses larger spacing before a heading after a paragraph', () => {
    const current: MarkdownBlock = {
      id: 'p1',
      kind: 'text',
      tag: 'p',
      text: 'Paragraph'
    };
    const next: MarkdownBlock = {
      id: 'h2',
      kind: 'text',
      tag: 'h2',
      text: 'Section'
    };

    expect(getMarkdownBlockGapAfter(current, next)).toBe(18);
  });

  it('keeps heavy blocks more relaxed from following content', () => {
    const current: MarkdownBlock = {
      id: 'code',
      kind: 'code',
      code: 'console.log(1)',
      language: 'ts',
      meta: ''
    };
    const next: MarkdownBlock = {
      id: 'p2',
      kind: 'text',
      tag: 'p',
      text: 'Paragraph'
    };

    expect(getMarkdownBlockGapAfter(current, next)).toBe(22);
  });
});
