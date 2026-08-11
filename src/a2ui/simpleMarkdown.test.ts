import { describe, expect, it } from 'vitest';
import { parseA2UiSimpleMarkdown } from './simpleMarkdown';

describe('parseA2UiSimpleMarkdown', () => {
  it('parses supported inline emphasis without producing HTML', () => {
    expect(parseA2UiSimpleMarkdown('普通 **加粗**、*强调*、`代码` 和 ~~删除~~')).toEqual([
      { text: '普通 ' },
      { text: '加粗', strong: true },
      { text: '、' },
      { text: '强调', emphasis: true },
      { text: '、' },
      { text: '代码', code: true },
      { text: ' 和 ' },
      { text: '删除', deleted: true }
    ]);
  });

  it('keeps links and HTML as inert text', () => {
    expect(parseA2UiSimpleMarkdown('[链接](javascript:alert(1)) <script>bad()</script>')).toEqual([
      { text: '[链接](javascript:alert(1)) <script>bad()</script>' }
    ]);
  });
});
