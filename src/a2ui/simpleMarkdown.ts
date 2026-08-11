export interface A2UiSimpleMarkdownSegment {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
  deleted?: boolean;
}

const SIMPLE_MARKDOWN_PATTERN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;

/**
 * 解析 A2UI Text 允许的基础 Markdown，不生成 HTML，也不支持链接和图片。
 */
export function parseA2UiSimpleMarkdown(source: string): A2UiSimpleMarkdownSegment[] {
  const segments: A2UiSimpleMarkdownSegment[] = [];
  let cursor = 0;

  for (const match of source.matchAll(SIMPLE_MARKDOWN_PATTERN)) {
    const index = match.index ?? cursor;
    const token = match[0];

    if (index > cursor) {
      segments.push({ text: source.slice(cursor, index) });
    }

    if (token.startsWith('`')) {
      segments.push({ text: token.slice(1, -1), code: true });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      segments.push({ text: token.slice(2, -2), strong: true });
    } else if (token.startsWith('~~')) {
      segments.push({ text: token.slice(2, -2), deleted: true });
    } else {
      segments.push({ text: token.slice(1, -1), emphasis: true });
    }

    cursor = index + token.length;
  }

  if (cursor < source.length) {
    segments.push({ text: source.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text: source }];
}
