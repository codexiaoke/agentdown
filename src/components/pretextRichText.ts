import {
  layoutNextLine,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments
} from '@chenglou/pretext';
import type { MarkdownHeadingTag, MarkdownInlineFragment } from '../core/types';

/**
 * pretext rich text 布局所需的块级排版参数。
 */
export interface PretextTypography {
  blockFont: string;
  lineHeight: number;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
}

/**
 * rich text item 在进入逐行布局前的预处理结果。
 */
export type PreparedPretextRichTextItem =
  | PreparedPretextRichTextTextItem
  | PreparedPretextRichTextBreakItem;

/**
 * 逐行布局时真正参与测量的文本片段。
 */
export interface PreparedPretextRichTextTextItem {
  kind: 'text';
  id: string;
  leadingGap: number;
  chromeWidth: number;
  prepared: PreparedTextWithSegments;
  fullText: string;
  fullWidth: number;
  endCursor: LayoutCursor;
  marks: Omit<MarkdownInlineFragment, 'id' | 'text'>;
}

/**
 * 显式换行占位 item。
 */
export interface PreparedPretextRichTextBreakItem {
  kind: 'break';
  id: string;
}

/**
 * 渲染阶段的一行结果。
 */
export interface PretextRichTextLine {
  fragments: PretextRichTextLineFragment[];
}

/**
 * 渲染阶段的单个行内片段。
 */
export interface PretextRichTextLineFragment extends Omit<MarkdownInlineFragment, 'id'> {
  id: string;
  leadingGap: number;
}

/**
 * 单行迭代时使用的起始 cursor。
 */
const LINE_START_CURSOR: LayoutCursor = {
  segmentIndex: 0,
  graphemeIndex: 0
};

/**
 * 用于测量整段单行宽度的极大宽度值。
 */
const UNBOUNDED_WIDTH = 100_000;

/**
 * 行内 code 额外占用的左右内边距与边框近似宽度。
 */
const INLINE_CODE_CHROME_WIDTH = 14;

/**
 * code 片段默认使用的字体族。
 */
const INLINE_CODE_FONT_FAMILY = '"SFMono-Regular", "JetBrains Mono", "Fira Code", "Menlo", monospace';

/**
 * 缓存不同字体下的折叠空格宽度，避免重复测量。
 */
const collapsedSpaceWidthCache = new Map<string, number>();

/**
 * 解析 `font` shorthand，提取出 pretext 布局需要的基础信息。
 */
function parseFontShorthand(font: string): PretextTypography {
  const matched = font.match(/^(.*?)(\d+(?:\.\d+)?)px(?:\/[^\s]+)?\s+(.+)$/);

  if (!matched) {
    return {
      blockFont: font,
      lineHeight: 26,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSizePx: 16,
      fontWeight: 400,
      fontStyle: 'normal'
    };
  }

  const prefix = matched[1]?.trim() ?? '';
  const sizePx = Number(matched[2] ?? '16');
  const fontFamily = matched[3] ?? '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const weightMatch = prefix.match(/\b([1-9]00)\b/);
  const fontWeight = weightMatch
    ? Number(weightMatch[1])
    : (/\bbold\b/i.test(prefix) ? 700 : 400);

  return {
    blockFont: font,
    lineHeight: 26,
    fontFamily,
    fontSizePx: Number.isFinite(sizePx) ? sizePx : 16,
    fontWeight,
    fontStyle: /\b(italic|oblique)\b/i.test(prefix) ? 'italic' : 'normal'
  };
}

/**
 * 用统一方式拼回 pretext 可消费的 font shorthand。
 */
function buildFontShorthand(
  fontFamily: string,
  fontSizePx: number,
  fontWeight: number,
  fontStyle: 'normal' | 'italic' = 'normal'
): string {
  return `${fontStyle === 'italic' ? 'italic ' : ''}${fontWeight} ${fontSizePx}px ${fontFamily}`;
}

/**
 * 根据 block tag 推导对应的排版参数，保证标题和正文不会共用同一套测量值。
 */
export function resolvePretextTypography(
  tag: MarkdownHeadingTag,
  font: string,
  lineHeight: number
): PretextTypography {
  const parsed = parseFontShorthand(font);
  const scaleMap: Record<MarkdownHeadingTag, { factor: number; lineHeightFactor: number; weight?: number }> = {
    p: {
      factor: 1,
      lineHeightFactor: Math.max(1.2, lineHeight / Math.max(1, parsed.fontSizePx))
    },
    h1: { factor: 3.25, lineHeightFactor: 1.08, weight: 700 },
    h2: { factor: 2.25, lineHeightFactor: 1.17, weight: 700 },
    h3: { factor: 1.5, lineHeightFactor: 1.34, weight: 700 },
    h4: { factor: 1.25, lineHeightFactor: 1.4, weight: 700 },
    h5: { factor: 1.06, lineHeightFactor: 1.5, weight: 700 },
    h6: { factor: 0.92, lineHeightFactor: 1.6, weight: 700 }
  };
  const scale = scaleMap[tag];
  const fontSizePx = Math.max(14, Math.round(parsed.fontSizePx * scale.factor));
  const resolvedLineHeight = tag === 'p'
    ? lineHeight
    : Math.max(Math.round(fontSizePx * scale.lineHeightFactor), fontSizePx + 6);

  return {
    blockFont: tag === 'p'
      ? font
      : buildFontShorthand(
          parsed.fontFamily,
          fontSizePx,
          scale.weight ?? parsed.fontWeight,
          parsed.fontStyle
        ),
    lineHeight: resolvedLineHeight,
    fontFamily: parsed.fontFamily,
    fontSizePx,
    fontWeight: scale.weight ?? parsed.fontWeight,
    fontStyle: parsed.fontStyle
  };
}

/**
 * 测量一段 prepared text 在单行下的完整宽度。
 */
function measureSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let maxWidth = 0;

  walkLineRanges(prepared, UNBOUNDED_WIDTH, (line) => {
    if (line.width > maxWidth) {
      maxWidth = line.width;
    }
  });

  return maxWidth;
}

/**
 * 读取某个字体下“单个折叠空格”的近似宽度。
 */
function measureCollapsedSpaceWidth(font: string): number {
  const cached = collapsedSpaceWidthCache.get(font);

  if (cached !== undefined) {
    return cached;
  }

  const joinedWidth = measureSingleLineWidth(prepareWithSegments('A A', font));
  const compactWidth = measureSingleLineWidth(prepareWithSegments('AA', font));
  const collapsedWidth = Math.max(0, joinedWidth - compactWidth);

  collapsedSpaceWidthCache.set(font, collapsedWidth);
  return collapsedWidth;
}

/**
 * 根据 fragment 的展示语义推导它自己的测量字体与额外 chrome 宽度。
 */
function resolveFragmentMeasurementStyle(
  fragment: MarkdownInlineFragment,
  typography: PretextTypography
): {
  font: string;
  chromeWidth: number;
} {
  if (fragment.code) {
    return {
      font: buildFontShorthand(
        INLINE_CODE_FONT_FAMILY,
        Math.max(12, Math.round(typography.fontSizePx * 0.88)),
        600
      ),
      chromeWidth: INLINE_CODE_CHROME_WIDTH
    };
  }

  return {
    font: buildFontShorthand(
      typography.fontFamily,
      typography.fontSizePx,
      fragment.strong ? 700 : typography.fontWeight,
      fragment.em ? 'italic' : typography.fontStyle
    ),
    chromeWidth: 0
  };
}

/**
 * 判断两个 layout cursor 是否指向同一位置。
 */
function isSameCursor(left: LayoutCursor, right: LayoutCursor): boolean {
  return left.segmentIndex === right.segmentIndex && left.graphemeIndex === right.graphemeIndex;
}

/**
 * 把结构化 inline fragments 预处理成可供后续逐行布局的 item 列表。
 */
export function preparePretextRichTextItems(
  fragments: MarkdownInlineFragment[],
  typography: PretextTypography
): PreparedPretextRichTextItem[] {
  const items: PreparedPretextRichTextItem[] = [];
  const collapsedSpaceWidth = measureCollapsedSpaceWidth(typography.blockFont);
  let pendingGap = 0;

  for (const fragment of fragments) {
    const parts = fragment.text.split('\n');

    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const part = parts[partIndex] ?? '';
      const carryGap = pendingGap;
      const hasLeadingWhitespace = /^\s/.test(part);
      const hasTrailingWhitespace = /\s$/.test(part);
      const trimmedText = part.trim();

      pendingGap = hasTrailingWhitespace ? collapsedSpaceWidth : 0;

      if (trimmedText.length > 0) {
        const measurementStyle = resolveFragmentMeasurementStyle(fragment, typography);
        const prepared = prepareWithSegments(trimmedText, measurementStyle.font);
        const wholeLine = layoutNextLine(prepared, LINE_START_CURSOR, UNBOUNDED_WIDTH);

        if (wholeLine) {
          items.push({
            kind: 'text',
            id: `${fragment.id}:part:${partIndex}`,
            leadingGap: carryGap > 0 || hasLeadingWhitespace ? collapsedSpaceWidth : 0,
            chromeWidth: measurementStyle.chromeWidth,
            prepared,
            fullText: wholeLine.text,
            fullWidth: wholeLine.width,
            endCursor: wholeLine.end,
            marks: {
              ...(fragment.strong ? { strong: true } : {}),
              ...(fragment.em ? { em: true } : {}),
              ...(fragment.del ? { del: true } : {}),
              ...(fragment.code ? { code: true } : {}),
              ...(fragment.href ? { href: fragment.href } : {})
            }
          });
        }
      }

      if (partIndex < parts.length - 1) {
        items.push({
          kind: 'break',
          id: `${fragment.id}:break:${partIndex}`
        });
        pendingGap = 0;
      }
    }
  }

  return items;
}

/**
 * 把预处理后的 rich text item 按给定宽度重新布局成可直接渲染的行结构。
 */
export function layoutPretextRichTextLines(
  items: PreparedPretextRichTextItem[],
  maxWidth: number
): PretextRichTextLine[] {
  const lines: PretextRichTextLine[] = [];
  const safeWidth = Math.max(1, maxWidth);
  let itemIndex = 0;
  let textCursor: LayoutCursor | null = null;

  while (itemIndex < items.length) {
    const lineFragments: PretextRichTextLineFragment[] = [];
    let remainingWidth = safeWidth;
    let lineWidth = 0;
    let consumedExplicitBreak = false;

    lineLoop:
    while (itemIndex < items.length) {
      const item = items[itemIndex];

      if (!item) {
        break;
      }

      if (item.kind === 'break') {
        itemIndex += 1;
        textCursor = null;
        consumedExplicitBreak = true;
        break;
      }

      const leadingGap = lineFragments.length === 0 ? 0 : item.leadingGap;
      const reservedWidth = leadingGap + item.chromeWidth;

      if (lineFragments.length > 0 && reservedWidth >= remainingWidth) {
        break;
      }

      if (textCursor === null) {
        const fullWidth = leadingGap + item.fullWidth + item.chromeWidth;

        if (fullWidth <= remainingWidth) {
          lineFragments.push({
            id: `${item.id}:full`,
            text: item.fullText,
            leadingGap,
            ...item.marks
          });
          lineWidth += fullWidth;
          remainingWidth = Math.max(0, safeWidth - lineWidth);
          itemIndex += 1;
          continue;
        }
      }

      const startCursor = textCursor ?? LINE_START_CURSOR;
      const line = layoutNextLine(
        item.prepared,
        startCursor,
        Math.max(1, remainingWidth - reservedWidth)
      );

      if (line === null || isSameCursor(startCursor, line.end)) {
        itemIndex += 1;
        textCursor = null;
        continue;
      }

      lineFragments.push({
        id: `${item.id}:slice:${line.start.segmentIndex}:${line.start.graphemeIndex}`,
        text: line.text,
        leadingGap,
        ...item.marks
      });
      lineWidth += leadingGap + line.width + item.chromeWidth;
      remainingWidth = Math.max(0, safeWidth - lineWidth);

      if (isSameCursor(line.end, item.endCursor)) {
        itemIndex += 1;
        textCursor = null;
        continue;
      }

      textCursor = line.end;
      break lineLoop;
    }

    if (lineFragments.length > 0) {
      lines.push({
        fragments: lineFragments
      });
      continue;
    }

    if (consumedExplicitBreak) {
      lines.push({
        fragments: []
      });
      continue;
    }

    break;
  }

  return lines;
}
