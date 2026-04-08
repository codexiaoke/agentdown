/**
 * 流式 markdown 按行拆分后的结构。
 */
interface StreamingMarkdownLine {
  content: string;
  start: number;
  end: number;
  hasNewline: boolean;
}

/**
 * 单个解析器消费到的边界结果。
 */
interface StreamingMarkdownParseResult {
  end: number;
  nextIndex: number;
}

/**
 * draft markdown 在界面中建议采用的展示模式。
 */
export type StreamingMarkdownDraftMode = 'text' | 'preview' | 'hidden';

/**
 * 当前 draft 尾部所属的 markdown 结构类型。
 */
export type StreamingMarkdownTailKind =
  | 'blank'
  | 'line'
  | 'paragraph'
  | 'blockquote'
  | 'list'
  | 'table'
  | 'fence'
  | 'math'
  | 'thought'
  | 'directive'
  | 'setext-heading'
  | 'html';

/**
 * 当前 draft 尾部更接近哪一种稳定化策略。
 */
export type StreamingMarkdownTailStability =
  | 'line-stable'
  | 'separator-stable'
  | 'candidate-stable'
  | 'close-stable';

/**
 * draft 尾部的结构化分析结果。
 */
export interface StreamingMarkdownTailInfo {
  /** 当前尾部推荐展示模式。 */
  mode: StreamingMarkdownDraftMode;
  /** 当前尾部推断出的结构类型。 */
  kind: StreamingMarkdownTailKind;
  /** 当前尾部采用的稳定化策略。 */
  stability: StreamingMarkdownTailStability;
  /** 是否已经跨越多行。 */
  multiline: boolean;
}

const AGUI_DIRECTIVE_RE = /^\s*:::\s*vue-component\s+[A-Za-z][\w-]*(?:\s+.*)?$/;
const AGENT_DIRECTIVE_RE = /^\s*:::\s*(approval|artifact|attachment|branch|handoff|timeline)(?:\s+.*)?$/;
const THOUGHT_OPEN_RE = /^\s*:::\s*thought\s*$/;
const THOUGHT_CLOSE_RE = /^\s*:::\s*$/;
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s|$)/;
const SETEXT_HEADING_RE = /^\s{0,3}(?:=+|-+)\s*$/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?/;
const ORDERED_LIST_RE = /^\s{0,3}\d{1,9}[.)]\s+/;
const UNORDERED_LIST_RE = /^\s{0,3}[-+*]\s+/;
const TABLE_DIVIDER_RE = /^\s*\|?(?:\s*:?-+:?\s*\|)+(?:\s*:?-+:?\s*)\|?\s*$/;
const BLOCK_HTML_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'details',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
]);
const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

/**
 * 把原始 markdown 字符串拆成带位置索引的行数组。
 */
function splitStreamingMarkdownLines(source: string): StreamingMarkdownLine[] {
  const lines: StreamingMarkdownLine[] = [];
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '\n') {
      continue;
    }

    lines.push({
      content: source.slice(start, index),
      start,
      end: index + 1,
      hasNewline: true
    });
    start = index + 1;
  }

  if (start < source.length) {
    lines.push({
      content: source.slice(start),
      start,
      end: source.length,
      hasNewline: false
    });
  }

  return lines;
}

/**
 * 判断一行是否为空白行。
 */
function isBlankLine(line: StreamingMarkdownLine): boolean {
  return line.content.trim().length === 0;
}

/**
 * 匹配 markdown 围栏代码块的起始 fence。
 */
function matchFence(line: string): { marker: '`' | '~'; length: number } | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})[^\n]*$/);

  if (!match) {
    return null;
  }

  const fence = match[1];

  if (!fence) {
    return null;
  }

  const marker = fence[0];

  if (marker !== '`' && marker !== '~') {
    return null;
  }

  return {
    marker,
    length: fence.length
  };
}

/**
 * 判断某一行是否为对应 fence 的结束行。
 */
function isFenceClose(line: string, marker: '`' | '~', length: number): boolean {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);

  if (!match) {
    return false;
  }

  const fence = match[1];

  if (!fence) {
    return false;
  }

  return fence[0] === marker && fence.length >= length;
}

/**
 * 判断一行是否为数学块分隔符。
 */
function isMathBlockDelimiter(line: string): boolean {
  return line.trim() === '$$';
}

/**
 * 判断一行是否已经构成完整的单行数学块。
 */
function isSingleLineMathBlock(line: StreamingMarkdownLine): boolean {
  const trimmed = line.content.trim();
  return line.hasNewline && trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed !== '$$';
}

/**
 * 判断一行是否为完整的单行指令块。
 */
function isSingleLineDirective(line: StreamingMarkdownLine): boolean {
  return line.hasNewline && (AGUI_DIRECTIVE_RE.test(line.content) || AGENT_DIRECTIVE_RE.test(line.content));
}

/**
 * 判断一行是否为完整的标题或分割线。
 */
function isHeadingOrRule(line: StreamingMarkdownLine): boolean {
  return line.hasNewline && (HEADING_RE.test(line.content) || HR_RE.test(line.content));
}

/**
 * 判断一行是否为 setext heading 的下划线。
 */
function isSetextHeadingUnderline(line: string): boolean {
  return SETEXT_HEADING_RE.test(line);
}

/**
 * 判断一行是否为 blockquote。
 */
function isBlockquoteLine(line: string): boolean {
  return BLOCKQUOTE_RE.test(line);
}

/**
 * 判断一行是否为有序或无序列表项。
 */
function isListItemLine(line: string): boolean {
  return ORDERED_LIST_RE.test(line) || UNORDERED_LIST_RE.test(line);
}

/**
 * 粗略判断一行能否作为表格表头。
 */
function isTableHeader(line: string): boolean {
  return line.includes('|') && line.trim().length > 0;
}

/**
 * 判断一行是否为 markdown 表格分隔线。
 */
function isTableDivider(line: string): boolean {
  return TABLE_DIVIDER_RE.test(line);
}

/**
 * 判断一行是否仍属于表格内容。
 */
function isTableRow(line: string): boolean {
  return line.trim().length > 0 && line.includes('|');
}

/**
 * 判断一行是否只是表格分隔线的半截片段。
 */
function isTableDividerFragment(line: string): boolean {
  return /^[\s|:-]+$/.test(line) && line.trim().length > 0;
}

/**
 * 尝试从一行里读取 block HTML 的起始标签信息。
 */
function matchHtmlBlockStart(
  line: string
): {
  tagName: string;
  selfClosing: boolean;
  closesOnSameLine: boolean;
} | null {
  const trimmed = line.trim();

  if (
    trimmed.length === 0
    || trimmed.startsWith('</')
    || trimmed.startsWith('<!--')
    || !trimmed.startsWith('<')
  ) {
    return null;
  }

  const match = trimmed.match(/^<([A-Za-z][\w:-]*)(?=[\s/>])/);

  if (!match?.[1]) {
    return null;
  }

  const tagName = match[1].toLowerCase();

  if (!BLOCK_HTML_TAGS.has(tagName) && !VOID_HTML_TAGS.has(tagName)) {
    return null;
  }

  return {
    tagName,
    selfClosing: VOID_HTML_TAGS.has(tagName) || /\/>\s*$/.test(trimmed),
    closesOnSameLine: new RegExp(`</${tagName}\\s*>`, 'i').test(trimmed)
  };
}

/**
 * 统计一行里某个 HTML 开始标签出现的次数。
 */
function countHtmlOpenTags(line: string, tagName: string): number {
  const matches = line.match(new RegExp(`<${tagName}(?=[\\s>/])[^>]*>`, 'gi')) ?? [];
  let count = 0;

  for (const match of matches) {
    if (match.startsWith('</') || /\/>\s*$/.test(match) || VOID_HTML_TAGS.has(tagName)) {
      continue;
    }

    count += 1;
  }

  return count;
}

/**
 * 统计一行里某个 HTML 结束标签出现的次数。
 */
function countHtmlCloseTags(line: string, tagName: string): number {
  return (line.match(new RegExp(`</${tagName}\\s*>`, 'gi')) ?? []).length;
}

/**
 * 判断一行是否会强制开启一个新的 markdown 结构块。
 */
function isHardBlockStart(line: StreamingMarkdownLine): boolean {
  return (
    !!matchFence(line.content)
    || THOUGHT_OPEN_RE.test(line.content)
    || isMathBlockDelimiter(line.content)
    || !!matchHtmlBlockStart(line.content)
    || isBlockquoteLine(line.content)
    || isListItemLine(line.content)
    || AGUI_DIRECTIVE_RE.test(line.content)
    || AGENT_DIRECTIVE_RE.test(line.content)
    || HEADING_RE.test(line.content)
    || HR_RE.test(line.content)
  );
}

/**
 * 判断当前行是否属于“必须等闭合后再稳定”的结构起点。
 */
function isCloseStableStart(line: StreamingMarkdownLine): boolean {
  return (
    !!matchFence(line.content)
    || THOUGHT_OPEN_RE.test(line.content)
    || isMathBlockDelimiter(line.content)
    || !!matchHtmlBlockStart(line.content)
    || AGUI_DIRECTIVE_RE.test(line.content)
    || AGENT_DIRECTIVE_RE.test(line.content)
  );
}

/**
 * 判断某一行是否可以和下一行的 setext underline 组成标题。
 */
function canPairWithSetextUnderline(line: StreamingMarkdownLine): boolean {
  return (
    line.content.trim().length > 0
    && !isBlockquoteLine(line.content)
    && !isListItemLine(line.content)
    && !isTableRow(line.content)
    && !HEADING_RE.test(line.content)
    && !HR_RE.test(line.content)
    && !AGUI_DIRECTIVE_RE.test(line.content)
    && !AGENT_DIRECTIVE_RE.test(line.content)
    && !THOUGHT_OPEN_RE.test(line.content)
    && !isMathBlockDelimiter(line.content)
    && !matchHtmlBlockStart(line.content)
    && !matchFence(line.content)
  );
}

/**
 * 消费连续的空白行。
 */
function consumeBlankLines(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const firstLine = lines[index];

  if (!firstLine || !isBlankLine(firstLine) || !firstLine.hasNewline) {
    return null;
  }

  let nextIndex = index;
  let end = firstLine.end;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex];

    if (!line || !isBlankLine(line) || !line.hasNewline) {
      break;
    }

    end = line.end;
    nextIndex += 1;
  }

  return {
    end,
    nextIndex
  };
}

/**
 * 消费一整个围栏代码块。
 */
function consumeFenceBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const openingLine = lines[index];
  const openingFence = openingLine ? matchFence(openingLine.content) : null;

  if (!openingFence || !openingLine?.hasNewline) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      break;
    }

    if (isFenceClose(line.content, openingFence.marker, openingFence.length)) {
      if (!line.hasNewline) {
        return null;
      }

      return {
        end: line.end,
        nextIndex: cursor + 1
      };
    }
  }

  return null;
}

/**
 * 消费一个完整 thought 指令块，支持嵌套。
 */
function consumeThoughtBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const openingLine = lines[index];

  if (!openingLine || !THOUGHT_OPEN_RE.test(openingLine.content) || !openingLine.hasNewline) {
    return null;
  }

  let depth = 1;

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      break;
    }

    if (THOUGHT_OPEN_RE.test(line.content)) {
      depth += 1;
      continue;
    }

    if (!THOUGHT_CLOSE_RE.test(line.content)) {
      continue;
    }

    depth -= 1;

    if (depth === 0) {
      if (!line.hasNewline) {
        return null;
      }

      return {
        end: line.end,
        nextIndex: cursor + 1
      };
    }
  }

  return null;
}

/**
 * 消费一个完整数学块。
 */
function consumeMathBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const line = lines[index];

  if (!line) {
    return null;
  }

  if (isSingleLineMathBlock(line)) {
    return {
      end: line.end,
      nextIndex: index + 1
    };
  }

  if (!isMathBlockDelimiter(line.content) || !line.hasNewline) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const currentLine = lines[cursor];

    if (!currentLine) {
      break;
    }

    if (!isMathBlockDelimiter(currentLine.content)) {
      continue;
    }

    if (!currentLine.hasNewline) {
      return null;
    }

    return {
      end: currentLine.end,
      nextIndex: cursor + 1
    };
  }

  return null;
}

/**
 * 消费一个结构完整的 block HTML。
 */
function consumeHtmlBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const line = lines[index];
  const opening = line ? matchHtmlBlockStart(line.content) : null;

  if (!line || !opening) {
    return null;
  }

  if (opening.selfClosing || opening.closesOnSameLine) {
    return {
      end: line.end,
      nextIndex: index + 1
    };
  }

  if (!line.hasNewline) {
    return null;
  }

  let depth = countHtmlOpenTags(line.content, opening.tagName) - countHtmlCloseTags(line.content, opening.tagName);

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const currentLine = lines[cursor];

    if (!currentLine) {
      break;
    }

    depth += countHtmlOpenTags(currentLine.content, opening.tagName);
    depth -= countHtmlCloseTags(currentLine.content, opening.tagName);

    if (depth <= 0) {
      return {
        end: currentLine.end,
        nextIndex: cursor + 1
      };
    }
  }

  return null;
}

/**
 * 消费一个完整的 setext heading。
 */
function consumeSetextHeading(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const titleLine = lines[index];
  const underlineLine = lines[index + 1];

  if (
    !titleLine
    || !underlineLine
    || !titleLine.hasNewline
    || !underlineLine.hasNewline
    || !canPairWithSetextUnderline(titleLine)
    || !isSetextHeadingUnderline(underlineLine.content)
  ) {
    return null;
  }

  return {
    end: underlineLine.end,
    nextIndex: index + 2
  };
}

/**
 * 消费一行即可闭合的结构块。
 */
function consumeSingleLineBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const line = lines[index];

  if (!line) {
    return null;
  }

  if (!isSingleLineDirective(line) && !isHeadingOrRule(line)) {
    return null;
  }

  return {
    end: line.end,
    nextIndex: index + 1
  };
}

/**
 * 消费一个结构完整的 markdown 表格。
 */
function consumeTableBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const header = lines[index];
  const divider = lines[index + 1];

  if (
    !header
    || !divider
    || !header.hasNewline
    || !divider.hasNewline
    || !isTableHeader(header.content)
    || !isTableDivider(divider.content)
  ) {
    return null;
  }

  let lastRowIndex = index + 1;
  let cursor = index + 2;

  while (cursor < lines.length) {
    const line = lines[cursor];

    if (!line || !isTableRow(line.content)) {
      break;
    }

    lastRowIndex = cursor;
    cursor += 1;
  }

  if (cursor >= lines.length) {
    return null;
  }

  const lastRow = lines[lastRowIndex];

  if (!lastRow?.hasNewline) {
    return null;
  }

  return {
    end: lastRow.end,
    nextIndex: cursor
  };
}

/**
 * 消费普通段落或未被其他结构命中的通用块。
 */
function consumeGenericBlock(lines: StreamingMarkdownLine[], index: number): StreamingMarkdownParseResult | null {
  const firstLine = lines[index];

  if (!firstLine || isCloseStableStart(firstLine)) {
    return null;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      break;
    }

    if (isSetextHeadingUnderline(line.content) && canPairWithSetextUnderline(lines[cursor - 1]!)) {
      continue;
    }

    if (isBlankLine(line)) {
      if (!line.hasNewline) {
        return null;
      }

      return {
        end: line.end,
        nextIndex: cursor + 1
      };
    }

    if (isHardBlockStart(line)) {
      const previousLine = lines[cursor - 1];

      if (!previousLine?.hasNewline) {
        return null;
      }

      return {
        end: previousLine.end,
        nextIndex: cursor
      };
    }
  }

  return null;
}

/**
 * 找出当前流式 markdown 中已经结构完整、可安全渲染的边界。
 */
export function findStreamingMarkdownBoundary(source: string): number {
  if (source.length === 0) {
    return 0;
  }

  const lines = splitStreamingMarkdownLines(source);
  let index = 0;
  let boundary = 0;

  while (index < lines.length) {
    const result =
      consumeBlankLines(lines, index)
      ?? consumeFenceBlock(lines, index)
      ?? consumeThoughtBlock(lines, index)
      ?? consumeMathBlock(lines, index)
      ?? consumeHtmlBlock(lines, index)
      ?? consumeSetextHeading(lines, index)
      ?? consumeSingleLineBlock(lines, index)
      ?? consumeTableBlock(lines, index)
      ?? consumeGenericBlock(lines, index);

    if (!result) {
      break;
    }

    boundary = result.end;
    index = result.nextIndex;
  }

  return boundary;
}

/**
 * 把流式 markdown 拆成已提交部分和 draft 部分。
 */
export function splitStreamingMarkdown(source: string): {
  committed: string;
  draft: string;
} {
  const boundary = findStreamingMarkdownBoundary(source);

  return {
    committed: source.slice(0, boundary),
    draft: source.slice(boundary)
  };
}

/**
 * 生成一份标准化的 draft 尾部分析信息。
 */
function createStreamingMarkdownTailInfo(
  mode: StreamingMarkdownDraftMode,
  kind: StreamingMarkdownTailKind,
  stability: StreamingMarkdownTailStability,
  multiline: boolean
): StreamingMarkdownTailInfo {
  return {
    mode,
    kind,
    stability,
    multiline
  };
}

/**
 * 读取当前 draft 尾部的结构化信息。
 */
export function resolveStreamingMarkdownTailInfo(source: string): StreamingMarkdownTailInfo {
  if (source.trim().length === 0) {
    return createStreamingMarkdownTailInfo('hidden', 'blank', 'separator-stable', source.includes('\n'));
  }

  const lines = splitStreamingMarkdownLines(source);
  const firstMeaningfulLine = lines.find((line) => line.content.trim().length > 0);

  if (!firstMeaningfulLine) {
    return createStreamingMarkdownTailInfo('hidden', 'blank', 'separator-stable', source.includes('\n'));
  }

  const firstMeaningfulIndex = lines.indexOf(firstMeaningfulLine);
  const secondMeaningfulLine = lines
    .slice(firstMeaningfulIndex + 1)
    .find((line) => line.content.trim().length > 0);
  const multiline = lines.length > 1;

  if (matchFence(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo(
      secondMeaningfulLine ? 'preview' : 'hidden',
      'fence',
      'close-stable',
      multiline
    );
  }

  if (THOUGHT_OPEN_RE.test(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo(
      secondMeaningfulLine ? 'preview' : 'hidden',
      'thought',
      'close-stable',
      multiline
    );
  }

  if (isMathBlockDelimiter(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo(
      secondMeaningfulLine ? 'preview' : 'hidden',
      'math',
      'close-stable',
      multiline
    );
  }

  if (
    AGUI_DIRECTIVE_RE.test(firstMeaningfulLine.content)
    || AGENT_DIRECTIVE_RE.test(firstMeaningfulLine.content)
  ) {
    return createStreamingMarkdownTailInfo('hidden', 'directive', 'close-stable', multiline);
  }

  if (matchHtmlBlockStart(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo(
      secondMeaningfulLine ? 'preview' : 'hidden',
      'html',
      'close-stable',
      multiline
    );
  }

  if (
    firstMeaningfulLine.content.trim().startsWith('|')
    || (
      isTableHeader(firstMeaningfulLine.content)
      && (
        secondMeaningfulLine
        && (
          isTableDivider(secondMeaningfulLine.content)
          || isTableDividerFragment(secondMeaningfulLine.content)
        )
      )
    )
  ) {
    return createStreamingMarkdownTailInfo(
      secondMeaningfulLine ? 'preview' : 'hidden',
      'table',
      'candidate-stable',
      multiline
    );
  }

  if (isBlockquoteLine(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo('preview', 'blockquote', 'separator-stable', multiline);
  }

  if (isListItemLine(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo('preview', 'list', 'separator-stable', multiline);
  }

  if (
    secondMeaningfulLine
    && isSetextHeadingUnderline(secondMeaningfulLine.content)
    && canPairWithSetextUnderline(firstMeaningfulLine)
  ) {
    return createStreamingMarkdownTailInfo('preview', 'setext-heading', 'candidate-stable', multiline);
  }

  if (HEADING_RE.test(firstMeaningfulLine.content) || HR_RE.test(firstMeaningfulLine.content)) {
    return createStreamingMarkdownTailInfo('text', 'line', 'line-stable', multiline);
  }

  return createStreamingMarkdownTailInfo('text', 'paragraph', 'separator-stable', multiline);
}

/**
 * 推断 draft 尾部更适合如何显示。
 */
export function resolveStreamingMarkdownDraftMode(source: string): StreamingMarkdownDraftMode {
  return resolveStreamingMarkdownTailInfo(source).mode;
}
