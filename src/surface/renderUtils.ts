import { sliceInlineFragments } from '../core/inlineFragments';
import type { MarkdownBlock, MarkdownTextBlock } from '../core/types';

/**
 * 长文本 slab 优先尝试命中的自然断点。
 */
const TEXT_SLAB_BREAK_TOKENS = [
  '\n',
  '。 ',
  '！ ',
  '？ ',
  '. ',
  '! ',
  '? ',
  '；',
  ';',
  '，',
  ',',
  ' '
] as const;

/**
 * 判断某类 markdown block 是否属于重型渲染单元。
 */
export function isHeavyMarkdownKind(kind: MarkdownBlock['kind']): boolean {
  return (
    kind === 'html'
    || kind === 'code'
    || kind === 'mermaid'
    || kind === 'math'
    || kind === 'thought'
    || kind === 'agui'
    || kind === 'artifact'
    || kind === 'approval'
    || kind === 'timeline'
  );
}

/**
 * 递归判断一组 markdown block 中是否包含重型内容。
 */
export function hasHeavyMarkdownContent(blocks: MarkdownBlock[]): boolean {
  return blocks.some((block) => {
    if (block.kind === 'thought') {
      return isHeavyMarkdownKind(block.kind) || hasHeavyMarkdownContent(block.blocks);
    }

    return isHeavyMarkdownKind(block.kind);
  });
}

/**
 * 为超长文本找到更自然的 slab 切分点。
 */
export function findTextSlabBoundary(text: string, start: number, maxChars: number): number {
  const maxEnd = Math.min(text.length, start + maxChars);

  if (maxEnd >= text.length) {
    return text.length;
  }

  const minimumPreferredBoundary = start + Math.floor(maxChars * 0.55);

  for (const token of TEXT_SLAB_BREAK_TOKENS) {
    const index = text.lastIndexOf(token, maxEnd);

    if (index >= minimumPreferredBoundary) {
      return index + token.length;
    }
  }

  return maxEnd;
}

/**
 * 把一个超长 text block 按较小 slab 分段渲染。
 */
export function splitTextBlockIntoSlabs(
  block: MarkdownTextBlock,
  maxChars: number
): MarkdownTextBlock[] {
  if (block.tag !== 'p' || block.text.length <= maxChars) {
    return [block];
  }

  const slabs: MarkdownTextBlock[] = [];
  let cursor = 0;
  let slabIndex = 0;

  while (cursor < block.text.length) {
    const nextBoundary = findTextSlabBoundary(block.text, cursor, maxChars);
    let trimmedStart = cursor;
    let trimmedEnd = nextBoundary;

    while (trimmedStart < trimmedEnd && /\s/.test(block.text[trimmedStart] ?? '')) {
      trimmedStart += 1;
    }

    while (trimmedEnd > trimmedStart && /\s/.test(block.text[trimmedEnd - 1] ?? '')) {
      trimmedEnd -= 1;
    }

    const nextText = block.text.slice(trimmedStart, trimmedEnd);

    if (nextText.length > 0) {
      const nextFragments = block.fragments
        ? sliceInlineFragments(block.fragments, trimmedStart, trimmedEnd)
        : undefined;

      slabs.push({
        ...block,
        id: `${block.id}:slab:${slabIndex}`,
        text: nextText,
        ...(nextFragments ? { fragments: nextFragments } : {})
      });
      slabIndex += 1;
    }

    cursor = nextBoundary;

    while (cursor < block.text.length && /\s/.test(block.text[cursor] ?? '')) {
      cursor += 1;
    }
  }

  return slabs.length > 0 ? slabs : [block];
}

/**
 * 递归地把 markdown block 列表切成更轻量的渲染 slab。
 */
export function splitMarkdownBlocksForRender(
  blocks: MarkdownBlock[],
  maxChars: number
): MarkdownBlock[] {
  const next: MarkdownBlock[] = [];

  for (const block of blocks) {
    if (block.kind === 'text') {
      next.push(...splitTextBlockIntoSlabs(block, maxChars));
      continue;
    }

    if (block.kind === 'thought') {
      next.push({
        ...block,
        blocks: splitMarkdownBlocksForRender(block.blocks, maxChars)
      });
      continue;
    }

    next.push(block);
  }

  return next;
}
