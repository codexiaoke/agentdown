import type { MarkdownBlock, MarkdownHeadingTag } from '../core/types';

/**
 * 根据当前 block 与下一个 block 的组合，推断更自然的默认垂直节奏。
 */
export function getMarkdownBlockGapAfter(
  current: MarkdownBlock,
  next: MarkdownBlock | undefined
): number {
  if (!next) {
    return 0;
  }

  if (current.kind === 'text') {
    if (current.tag === 'h1') {
      return next.kind === 'text' && next.tag === 'h2' ? 10 : 18;
    }

    if (current.tag === 'h2') {
      return next.kind === 'text' && isHeadingTag(next.tag) ? 10 : 14;
    }

    if (isHeadingTag(current.tag)) {
      return next.kind === 'text' && current.tag === next.tag ? 8 : 12;
    }

    if (next.kind === 'text' && isHeadingTag(next.tag)) {
      return 18;
    }

    return 16;
  }

  if (current.kind === 'html') {
    return next.kind === 'text' && isHeadingBlock(next) ? 20 : 18;
  }

  if (
    current.kind === 'code'
    || current.kind === 'mermaid'
    || current.kind === 'math'
    || current.kind === 'agui'
    || current.kind === 'artifact'
    || current.kind === 'approval'
    || current.kind === 'timeline'
    || current.kind === 'thought'
  ) {
    return 22;
  }

  return 18;
}

/**
 * 统一判断一个 text tag 是否为标题。
 */
function isHeadingTag(tag: MarkdownHeadingTag): boolean {
  return tag !== 'p';
}

/**
 * 判断一个 markdown block 是否属于标题 text block。
 */
function isHeadingBlock(block: MarkdownBlock): block is Extract<MarkdownBlock, { kind: 'text' }> {
  return block.kind === 'text' && block.tag !== 'p';
}
