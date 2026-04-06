import type {
  MarkdownRenderMode,
  MarkdownRendererPerformanceOptions
} from '../core/types';

/**
 * `MarkdownRenderer` 内部实际执行时使用的完整性能配置。
 */
export interface ResolvedMarkdownRendererPerformance {
  /** 当前采用的推荐渲染模式。 */
  mode: MarkdownRenderMode;
  /** 单个 text block 的 slab 拆分阈值。 */
  textSlabChars: number | false;
  /** 是否启用视口窗口化。 */
  virtualize: boolean;
  /** 窗口化的 rootMargin 配置。 */
  virtualizeMargin: string;
}

const TYPING_MODE_DEFAULTS = {
  textSlabChars: 1600,
  virtualize: false,
  virtualizeMargin: '1200px 0px'
} as const;

const WINDOW_MODE_DEFAULTS = {
  textSlabChars: 1200,
  virtualize: true,
  virtualizeMargin: '1400px 0px'
} as const;

/**
 * 解析当前更适合使用的 renderer 模式。
 *
 * 为了兼容旧配置：
 * - 如果用户显式传了 `mode`，优先使用它
 * - 否则当 `virtualize === true` 时，自动推断为 `window`
 * - 其他情况默认走 `typing`
 */
export function resolveMarkdownRenderMode(
  performance: MarkdownRendererPerformanceOptions | undefined
): MarkdownRenderMode {
  if (performance?.mode) {
    return performance.mode;
  }

  if (performance?.virtualize === true) {
    return 'window';
  }

  return 'typing';
}

/**
 * 把对外暴露的性能配置收敛成 renderer 内部真正使用的完整形态。
 */
export function resolveMarkdownRendererPerformance(
  performance: MarkdownRendererPerformanceOptions | undefined
): ResolvedMarkdownRendererPerformance {
  const mode = resolveMarkdownRenderMode(performance);
  const defaults = mode === 'window'
    ? WINDOW_MODE_DEFAULTS
    : TYPING_MODE_DEFAULTS;

  return {
    mode,
    textSlabChars: performance?.textSlabChars === false
      ? false
      : Math.max(640, performance?.textSlabChars ?? defaults.textSlabChars),
    virtualize: performance?.virtualize ?? defaults.virtualize,
    virtualizeMargin: performance?.virtualizeMargin ?? defaults.virtualizeMargin
  };
}
