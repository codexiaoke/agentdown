/**
 * thought 头部允许的展示状态。
 */
export type ThoughtHeaderStatus = 'idle' | 'thinking' | 'done';

/**
 * 解析 thought 头部文案时所需的输入参数。
 */
export interface ResolveThoughtHeaderOptions {
  /** 原始标题文案。 */
  title?: string | undefined;
  /** 显式的思考状态。 */
  status?: ThoughtHeaderStatus | undefined;
  /** 后端直接给出的耗时文本。 */
  durationText?: string | undefined;
  /** 以毫秒为单位的思考耗时。 */
  durationMs?: number | undefined;
}

/**
 * thought 头部最终要交给组件渲染的视图模型。
 */
export interface ThoughtHeaderViewModel {
  /** 归一化后的标题文案。 */
  title: string;
  /** 当前头部是否应展示扫光动画。 */
  shimmering: boolean;
  /** 归一化后的状态。 */
  status: ThoughtHeaderStatus;
}

const DONE_TITLE_RE = /^(已思考|思考完成|已完成|completed|done)/i;
const THINKING_TITLE_RE = /^(思考中|正在思考|thinking)/i;
const DURATION_RE = /(?:用时|耗时)\s*([^\)）]+)/i;

/**
 * 清洗后端直接返回的耗时文本，避免重复带上“用时 / 耗时”前缀。
 */
export function normalizeThoughtDurationText(durationText?: string): string | null {
  const normalizedText = durationText?.trim();

  if (!normalizedText) {
    return null;
  }

  const matched = normalizedText.match(DURATION_RE);
  return matched?.[1]?.trim() || normalizedText;
}

/**
 * 将毫秒耗时格式化为更适合 thought 头部展示的中文文本。
 */
export function formatThoughtDuration(durationMs?: number): string | null {
  if (!Number.isFinite(durationMs) || durationMs === undefined || durationMs < 0) {
    return null;
  }

  if (durationMs < 1_000) {
    return '1 秒';
  }

  if (durationMs < 10_000) {
    const seconds = durationMs / 1_000;
    const rounded = Math.round(seconds * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded} 秒` : `${rounded.toFixed(1)} 秒`;
  }

  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1_000)} 秒`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);

  if (seconds === 0) {
    return `${minutes} 分钟`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}

/**
 * 从原始标题里提取“用时 / 耗时”这一类尾部信息。
 */
export function extractThoughtDurationText(title?: string): string | null {
  if (!title) {
    return null;
  }

  const matched = title.match(DURATION_RE);
  return matched?.[1]?.trim() || null;
}

/**
 * 根据显式状态和原始标题，归一化得到 thought 头部最终展示文案。
 */
export function resolveThoughtHeader(options: ResolveThoughtHeaderOptions): ThoughtHeaderViewModel {
  const normalizedTitle = options.title?.trim() || '';
  const isThinkingTitle = THINKING_TITLE_RE.test(normalizedTitle);
  const isDoneTitle = DONE_TITLE_RE.test(normalizedTitle);
  const durationText = normalizeThoughtDurationText(options.durationText)
    || formatThoughtDuration(options.durationMs)
    || extractThoughtDurationText(normalizedTitle)
    || null;

  if (
    options.status === 'done'
    || isDoneTitle
    || (durationText !== null && options.status !== 'thinking' && !isThinkingTitle)
  ) {
    return {
      title: durationText ? `已思考（用时 ${durationText}）` : '已思考',
      shimmering: false,
      status: 'done'
    };
  }

  if (options.status === 'thinking' || isThinkingTitle) {
    return {
      title: '正在思考',
      shimmering: true,
      status: 'thinking'
    };
  }

  if (!normalizedTitle) {
    return {
      title: '思考过程',
      shimmering: false,
      status: 'idle'
    };
  }

  return {
    title: normalizedTitle,
    shimmering: false,
    status: options.status ?? 'idle'
  };
}
