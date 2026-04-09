import { createStreamingMarkdownTextBlock } from '../core/streamingInlineFragments';
import { estimateMarkdownBlockHeight, shouldMeasureMarkdownBlockHeight } from './markdownBlockPerformance';
import { resolveSurfaceBlockMarkdownBlock } from '../surface/renderUtils';
import type { SurfaceBlock } from '../runtime/types';

/**
 * surface message 内部每个 block 之间的默认垂直间距。
 * 这里和 `RunSurface.vue` 里的视觉间距保持一致，方便窗口化时准确估算总高度。
 */
export const RUN_SURFACE_BLOCK_GAP = 10;

/**
 * 判断某个 surface block 是否值得进入真实高度测量链。
 * 纯文本类 block 直接依赖估算值即可，复杂块则测量一次真实高度来修正 spacer。
 */
export function shouldMeasureSurfaceBlockHeight(block: SurfaceBlock): boolean {
  const markdownBlock = resolveSurfaceBlockMarkdownBlock(block);

  if (markdownBlock) {
    return shouldMeasureMarkdownBlockHeight(markdownBlock);
  }

  if (block.renderer === 'text.draft' || block.renderer === 'markdown.draft' || block.renderer === 'markdown') {
    return true;
  }

  if (block.type === 'tool' || block.renderer === 'tool' || block.renderer.startsWith('tool.')) {
    return true;
  }

  return block.renderer !== 'text';
}

/**
 * 估算 surface block 在当前宽度下的占位高度。
 * 这个估算主要用于组内窗口化，不追求像素绝对精确，但要尽量稳定。
 */
export function estimateSurfaceBlockHeight(
  block: SurfaceBlock,
  width: number,
  lineHeight: number,
  font: string
): number {
  const markdownBlock = resolveSurfaceBlockMarkdownBlock(block);

  if (markdownBlock) {
    return estimateMarkdownBlockHeight(markdownBlock, width, lineHeight, font);
  }

  if (
    (block.renderer === 'text.draft' || block.renderer === 'markdown.draft' || block.renderer === 'markdown')
    && typeof block.content === 'string'
    && block.content.trim().length > 0
  ) {
    return estimateMarkdownBlockHeight(
      createStreamingMarkdownTextBlock(block.content, `${block.id}:estimate`),
      width,
      lineHeight,
      font
    );
  }

  if (block.renderer === 'text.draft' || block.renderer === 'markdown.draft' || block.renderer === 'markdown') {
    return 72;
  }

  if (block.type === 'tool' || block.renderer === 'tool' || block.renderer.startsWith('tool.')) {
    return 132;
  }

  return 116;
}
