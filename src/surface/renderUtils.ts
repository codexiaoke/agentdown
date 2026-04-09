import { sliceInlineFragments } from '../core/inlineFragments';
import type { MarkdownBlock, MarkdownTextBlock } from '../core/types';
import type { SurfaceBlock } from '../runtime/types';

const SURFACE_MARKDOWN_KINDS = new Set<MarkdownBlock['kind']>([
  'text',
  'html',
  'code',
  'mermaid',
  'math',
  'thought',
  'agui',
  'artifact',
  'error',
  'approval',
  'attachment',
  'branch',
  'handoff',
  'timeline'
]);

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
    || kind === 'error'
    || kind === 'approval'
    || kind === 'attachment'
    || kind === 'branch'
    || kind === 'handoff'
    || kind === 'timeline'
  );
}

/**
 * 尝试把一个 surface block 还原成结构化 markdown block。
 * 这让 surface 层也能复用 markdown 侧的性能估算和可见性判断逻辑。
 */
export function resolveSurfaceBlockMarkdownBlock(block: SurfaceBlock): MarkdownBlock | null {
  const data = block.data as Partial<MarkdownBlock> & { kind?: unknown };

  if (typeof data.kind === 'string' && SURFACE_MARKDOWN_KINDS.has(data.kind as MarkdownBlock['kind'])) {
    return data as MarkdownBlock;
  }

  if (block.renderer === 'text' && typeof block.content === 'string') {
    return {
      id: block.id,
      kind: 'text',
      tag: 'p',
      text: block.content
    };
  }

  return null;
}

/**
 * 判断一个 surface block 是否已经有肉眼可见的内容。
 * 这个结果既用于 draft placeholder，也用于消息级窗口化前的首屏显示策略。
 */
export function hasSurfaceBlockVisibleContent(block: SurfaceBlock): boolean {
  if (typeof block.content === 'string' && block.content.trim().length > 0) {
    return true;
  }

  const markdownBlock = resolveSurfaceBlockMarkdownBlock(block);

  if (markdownBlock) {
    switch (markdownBlock.kind) {
      case 'text':
        return markdownBlock.text.trim().length > 0;
      case 'html':
        return markdownBlock.html.trim().length > 0;
      case 'code':
      case 'mermaid':
        return true;
      case 'math':
        return markdownBlock.expression.trim().length > 0;
      case 'thought':
        return markdownBlock.blocks.length > 0 || markdownBlock.title.trim().length > 0;
      case 'agui':
      case 'artifact':
      case 'error':
      case 'approval':
      case 'attachment':
      case 'branch':
      case 'handoff':
      case 'timeline':
        return true;
      default:
        return false;
    }
  }

  if (block.renderer === 'markdown.draft' || block.renderer === 'text.draft' || block.renderer === 'markdown') {
    return false;
  }

  if (typeof block.data !== 'object' || block.data === null) {
    return block.data !== undefined;
  }

  return Object.keys(block.data).length > 0;
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
