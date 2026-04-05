import { describe, expect, it } from 'vitest';
import {
  buildMarkdownHeightPrefixSums,
  findMarkdownWindowRange,
  getMarkdownWindowPixelBounds,
  parseMarkdownVirtualOverscan,
  shouldRetainMarkdownWindowRange
} from './markdownWindowing';

describe('markdownWindowing', () => {
  it('parses vertical overscan from rootMargin-like strings', () => {
    expect(parseMarkdownVirtualOverscan('1400px')).toEqual({
      top: 1400,
      bottom: 1400
    });

    expect(parseMarkdownVirtualOverscan('1200px 0px')).toEqual({
      top: 1200,
      bottom: 1200
    });

    expect(parseMarkdownVirtualOverscan('100px 0px 300px 0px')).toEqual({
      top: 100,
      bottom: 300
    });
  });

  it('builds cumulative prefix sums for block heights', () => {
    expect(buildMarkdownHeightPrefixSums([100, 200, 50])).toEqual([0, 100, 300, 350]);
  });

  it('finds the correct visible block range for a viewport window', () => {
    const prefixSums = buildMarkdownHeightPrefixSums([100, 200, 300, 120]);

    expect(findMarkdownWindowRange(prefixSums, 0, 150)).toEqual({
      startIndex: 0,
      endIndex: 2
    });

    expect(findMarkdownWindowRange(prefixSums, 320, 480)).toEqual({
      startIndex: 2,
      endIndex: 3
    });
  });

  it('clamps the visible range when the viewport is beyond total height', () => {
    const prefixSums = buildMarkdownHeightPrefixSums([80, 90, 100]);

    expect(findMarkdownWindowRange(prefixSums, 999, 1300)).toEqual({
      startIndex: 2,
      endIndex: 3
    });
  });

  it('derives pixel bounds from the current window range', () => {
    const prefixSums = buildMarkdownHeightPrefixSums([100, 200, 300, 120]);

    expect(
      getMarkdownWindowPixelBounds(prefixSums, {
        startIndex: 1,
        endIndex: 3
      })
    ).toEqual({
      top: 100,
      bottom: 600
    });
  });

  it('retains the mounted window while the viewport stays inside the inner safe band', () => {
    const prefixSums = buildMarkdownHeightPrefixSums([120, 120, 120, 120, 120, 120]);

    expect(
      shouldRetainMarkdownWindowRange(
        prefixSums,
        {
          startIndex: 0,
          endIndex: 6
        },
        160,
        320,
        {
          top: 120,
          bottom: 120
        }
      )
    ).toBe(true);

    expect(
      shouldRetainMarkdownWindowRange(
        prefixSums,
        {
          startIndex: 0,
          endIndex: 6
        },
        20,
        180,
        {
          top: 120,
          bottom: 120
        }
      )
    ).toBe(false);
  });
});
