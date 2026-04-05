/**
 * 视口窗口化使用的上下 overscan 配置。
 */
export interface MarkdownVirtualOverscan {
  top: number;
  bottom: number;
}

/**
 * 当前应该真正渲染的 block 范围，`endIndex` 为排他上界。
 */
export interface MarkdownWindowRange {
  startIndex: number;
  endIndex: number;
}

/**
 * 当前窗口在整篇文档里的像素边界。
 */
export interface MarkdownWindowPixelBounds {
  top: number;
  bottom: number;
}

/**
 * 把 `rootMargin` 风格的字符串解析成窗口化真正关心的上下 overscan 像素。
 * 当前只支持 `px`，其他单位统一安全回退为 0。
 */
export function parseMarkdownVirtualOverscan(margin: string): MarkdownVirtualOverscan {
  const tokens = margin.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return {
      top: 0,
      bottom: 0
    };
  }

  const values = tokens.map(parseMarginTokenPx);

  switch (values.length) {
    case 1:
      return {
        top: values[0] ?? 0,
        bottom: values[0] ?? 0
      };

    case 2:
      return {
        top: values[0] ?? 0,
        bottom: values[0] ?? 0
      };

    case 3:
    default:
      return {
        top: values[0] ?? 0,
        bottom: values[2] ?? values[0] ?? 0
      };
  }
}

/**
 * 根据每个 block 的高度构建前缀和数组，方便后续用二分查找可视窗口。
 */
export function buildMarkdownHeightPrefixSums(heights: number[]): number[] {
  const prefixSums = [0];

  for (const height of heights) {
    const previous = prefixSums[prefixSums.length - 1] ?? 0;
    prefixSums.push(previous + Math.max(0, height));
  }

  return prefixSums;
}

/**
 * 根据当前视口范围，找到真正需要渲染的 block 窗口。
 */
export function findMarkdownWindowRange(
  prefixSums: number[],
  viewportTop: number,
  viewportBottom: number
): MarkdownWindowRange {
  const itemCount = Math.max(0, prefixSums.length - 1);

  if (itemCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0
    };
  }

  const safeTop = Math.max(0, viewportTop);
  const safeBottom = Math.max(safeTop, viewportBottom);
  const firstVisiblePrefixIndex = upperBound(prefixSums, safeTop);
  const startIndex = clampNumber(firstVisiblePrefixIndex - 1, 0, itemCount - 1);
  const firstNonVisibleStartIndex = lowerBound(prefixSums, safeBottom);
  const endIndex = clampNumber(
    Math.max(startIndex + 1, firstNonVisibleStartIndex),
    startIndex + 1,
    itemCount
  );

  return {
    startIndex,
    endIndex
  };
}

/**
 * 根据窗口范围返回其在整篇虚拟文档中的像素边界。
 */
export function getMarkdownWindowPixelBounds(
  prefixSums: number[],
  range: MarkdownWindowRange
): MarkdownWindowPixelBounds {
  const itemCount = Math.max(0, prefixSums.length - 1);

  if (itemCount === 0 || range.endIndex <= range.startIndex) {
    return {
      top: 0,
      bottom: 0
    };
  }

  const startIndex = clampNumber(range.startIndex, 0, itemCount - 1);
  const endIndex = clampNumber(range.endIndex, startIndex + 1, itemCount);

  return {
    top: prefixSums[startIndex] ?? 0,
    bottom: prefixSums[endIndex] ?? prefixSums[startIndex] ?? 0
  };
}

/**
 * 判断当前视口是否仍然处于已挂载窗口的“安全区”内。
 * 只要视口没有逼近窗口边缘，就继续复用当前挂载结果，避免滚动时频繁换窗。
 */
export function shouldRetainMarkdownWindowRange(
  prefixSums: number[],
  range: MarkdownWindowRange,
  viewportTop: number,
  viewportBottom: number,
  overscan: MarkdownVirtualOverscan
): boolean {
  const itemCount = Math.max(0, prefixSums.length - 1);

  if (itemCount === 0 || range.endIndex <= range.startIndex) {
    return false;
  }

  const safeTop = Math.max(0, viewportTop);
  const safeBottom = Math.max(safeTop, viewportBottom);
  const bounds = getMarkdownWindowPixelBounds(prefixSums, range);
  const retainTop = Math.min(bounds.bottom, bounds.top + Math.max(0, overscan.top));
  const retainBottom = Math.max(retainTop, bounds.bottom - Math.max(0, overscan.bottom));

  return safeTop >= retainTop && safeBottom <= retainBottom;
}

/**
 * 解析单个 margin token；仅允许 `px`，否则安全回退为 0。
 */
function parseMarginTokenPx(token: string): number {
  const matched = token.match(/^(-?\d+(?:\.\d+)?)px$/i);

  if (!matched) {
    return 0;
  }

  return Math.max(0, Number(matched[1] ?? '0'));
}

/**
 * 返回数组中第一个大于目标值的位置。
 */
function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const value = values[mid] ?? 0;

    if (value <= target) {
      low = mid + 1;
      continue;
    }

    high = mid;
  }

  return low;
}

/**
 * 返回数组中第一个大于等于目标值的位置。
 */
function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const value = values[mid] ?? 0;

    if (value < target) {
      low = mid + 1;
      continue;
    }

    high = mid;
  }

  return low;
}

/**
 * 把数字约束在给定区间内。
 */
function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
