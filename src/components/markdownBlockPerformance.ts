import { layout } from '@chenglou/pretext';
import { getCachedPreparedText } from './pretextCache';
import { layoutPretextRichTextLines, preparePretextRichTextItems, resolvePretextTypography } from './pretextRichText';
import type { MarkdownBlock, MarkdownTextBlock } from '../core/types';

/**
 * 判断某个 block 是否值得进入真实高度测量链。
 * 高度已经可预测的 block 直接依赖估算值，可以减少窗口化过程中的额外测量成本。
 */
export function shouldMeasureMarkdownBlockHeight(block: MarkdownBlock): boolean {
  switch (block.kind) {
    case 'html':
    case 'mermaid':
    case 'math':
    case 'thought':
    case 'agui':
      return true;

    default:
      return false;
  }
}

/**
 * 估算某个 markdown block 在当前宽度下的占位高度。
 * 这主要用于长文档窗口化时的 placeholder，优先追求稳定而不是绝对像素级精确。
 */
export function estimateMarkdownBlockHeight(
  block: MarkdownBlock,
  width: number,
  lineHeight: number,
  font: string
): number {
  switch (block.kind) {
    case 'text':
      return estimateTextBlockHeight(block, width, lineHeight, font);

    case 'code':
      return estimateCodeBlockHeight(block.code, lineHeight);

    case 'mermaid':
      return 240;

    case 'math':
      return 96;

    case 'thought':
      return Math.max(
        120,
        56 + block.blocks.reduce((total, child) => total + estimateMarkdownBlockHeight(child, width, lineHeight, font), 0)
      );

    case 'agui':
      return block.minHeight;

    case 'artifact':
    case 'error':
    case 'approval':
    case 'attachment':
    case 'branch':
    case 'handoff':
    case 'timeline':
      return 112;

    case 'html':
      return 160;

    default:
      return 96;
  }
}

/**
 * 估算 text block 的真实布局高度。
 * 纯文本路径直接复用 pretext 的高度计算，rich inline 路径复用当前组件的逐行布局器。
 */
function estimateTextBlockHeight(
  block: MarkdownTextBlock,
  width: number,
  lineHeight: number,
  font: string
): number {
  const typography = resolvePretextTypography(block.tag, font, lineHeight);

  if (width <= 0) {
    return typography.lineHeight;
  }

  if (block.fragments && block.fragments.length > 0) {
    const items = preparePretextRichTextItems(block.fragments, typography);
    const lines = layoutPretextRichTextLines(items, width);
    return Math.max(lines.length, 1) * typography.lineHeight;
  }

  const prepared = getCachedPreparedText(block.text, typography.blockFont, 'pre-wrap');
  return Math.max(layout(prepared, width, typography.lineHeight).height, typography.lineHeight);
}

/**
 * 估算代码块高度，避免初次进入视口前完全塌陷。
 */
function estimateCodeBlockHeight(code: string, lineHeight: number): number {
  const lineCount = Math.max(1, code.split('\n').length);
  return Math.max(88, 48 + lineCount * Math.max(20, Math.round(lineHeight * 0.9)));
}
