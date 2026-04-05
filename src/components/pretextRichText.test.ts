import { describe, expect, it } from 'vitest';
import {
  layoutPretextRichTextLines
} from './pretextRichText';
import type {
  PreparedPretextRichTextItem,
  PreparedPretextRichTextTextItem
} from './pretextRichText';
import type { LayoutCursor } from '@chenglou/pretext';

/**
 * 为测试创建一个不会真正走 pretext 测量的 text item。
 */
function createTextItem(
  id: string,
  text: string,
  fullWidth: number,
  leadingGap = 0,
  marks: PreparedPretextRichTextTextItem['marks'] = {}
): PreparedPretextRichTextItem {
  const endCursor: LayoutCursor = {
    segmentIndex: 0,
    graphemeIndex: text.length
  };

  return {
    kind: 'text',
    id,
    leadingGap,
    chromeWidth: 0,
    prepared: {} as never,
    fullText: text,
    fullWidth,
    endCursor,
    marks
  };
}

describe('pretextRichText', () => {
  it('wraps a trailing fragment onto the next line instead of dropping it', () => {
    const items: PreparedPretextRichTextItem[] = [
      createTextItem('label', '天气概况：', 96, 0, {
        strong: true
      }),
      createTextItem('value', '局部多云', 56, 8)
    ];
    const lines = layoutPretextRichTextLines(items, 100);

    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]?.fragments.some((fragment) => fragment.text.includes('天气概况'))).toBe(true);
    expect(lines[1]?.fragments.some((fragment) => fragment.text.includes('局部多云'))).toBe(true);
  });
});
