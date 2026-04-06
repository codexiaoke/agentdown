import type {
  SurfaceBlockStreamingDraftData
} from '../runtime/types';
import type {
  StreamingMarkdownDraftMode,
  StreamingMarkdownTailKind,
  StreamingMarkdownTailStability
} from '../runtime/streamingMarkdown';

const STREAMING_DRAFT_MODES = new Set<StreamingMarkdownDraftMode>([
  'text',
  'preview',
  'hidden'
]);

const STREAMING_DRAFT_KINDS = new Set<StreamingMarkdownTailKind>([
  'blank',
  'line',
  'paragraph',
  'blockquote',
  'list',
  'table',
  'fence',
  'math',
  'thought',
  'directive',
  'setext-heading',
  'html'
]);

const STREAMING_DRAFT_STABILITIES = new Set<StreamingMarkdownTailStability>([
  'line-stable',
  'separator-stable',
  'candidate-stable',
  'close-stable'
]);

/**
 * 判断一个未知值是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 把 block.data 里可能存在的流式草稿元数据收敛成稳定结构。
 *
 * 这里会丢弃未知值，避免 surface 层把脏数据直接透传到 DOM。
 */
export function resolveSurfaceBlockStreamingDraftData(
  data: unknown
): SurfaceBlockStreamingDraftData {
  if (!isRecord(data)) {
    return {};
  }

  const result: SurfaceBlockStreamingDraftData = {};

  if (
    typeof data.streamingDraftMode === 'string'
    && STREAMING_DRAFT_MODES.has(data.streamingDraftMode as StreamingMarkdownDraftMode)
  ) {
    result.streamingDraftMode = data.streamingDraftMode as StreamingMarkdownDraftMode;
  }

  if (
    typeof data.streamingDraftKind === 'string'
    && STREAMING_DRAFT_KINDS.has(data.streamingDraftKind as StreamingMarkdownTailKind)
  ) {
    result.streamingDraftKind = data.streamingDraftKind as StreamingMarkdownTailKind;
  }

  if (
    typeof data.streamingDraftStability === 'string'
    && STREAMING_DRAFT_STABILITIES.has(data.streamingDraftStability as StreamingMarkdownTailStability)
  ) {
    result.streamingDraftStability = data.streamingDraftStability as StreamingMarkdownTailStability;
  }

  if (typeof data.streamingDraftMultiline === 'boolean') {
    result.streamingDraftMultiline = data.streamingDraftMultiline;
  }

  return result;
}
