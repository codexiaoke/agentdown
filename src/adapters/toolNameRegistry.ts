import type { Component } from 'vue';
import type {
  RunSurfaceRendererMap,
  RunSurfaceRendererRegistration
} from '../surface/types';

/**
 * 基于工具名匹配 renderer 时支持的字符串匹配模式。
 */
export type ToolNameMatchMode = 'exact' | 'includes';

/**
 * 单条工具名匹配规则可使用的匹配值。
 *
 * - 字符串：按 `mode` 做精确匹配或包含匹配
 * - 正则：直接执行 `test()`
 */
export type ToolNameMatcher = string | RegExp;

/**
 * 单个 renderer 对应的一条工具名定义。
 */
export interface ToolNameComponentDefinition {
  /** 能命中这个 renderer 的工具名集合。 */
  match: ToolNameMatcher | ToolNameMatcher[];
  /** 字符串匹配时使用的模式，默认 `exact`。 */
  mode?: ToolNameMatchMode;
  /** 命中后注册到 `surface.renderers` 的 Vue 组件。 */
  component?: Component;
  /** 如果需要更复杂的 props / mode，可以直接传完整 renderer registration。 */
  registration?: Component | RunSurfaceRendererRegistration;
}

/**
 * 一组“renderer key -> 工具名匹配规则”的映射表。
 */
export type ToolNameComponentMap = Record<string, ToolNameComponentDefinition>;

/**
 * 创建工具名注册器时可选的共享配置。
 */
export interface ToolNameRegistrySharedOptions {
  /** 没有任何规则命中时返回的默认 renderer。 */
  fallback?: string;
  /** 自定义工具名归一化规则，默认做 trim + lower-case。 */
  normalizeName?: (name: string) => string;
}

/**
 * 通用工具名注册器的完整配置。
 */
export interface ToolNameRegistryOptions<TContext> extends ToolNameRegistrySharedOptions {
  /** 一组 renderer 定义。 */
  definitions: ToolNameComponentMap;
  /** 如何从当前 adapter context 里取出工具名。 */
  resolveName: (context: TContext) => string | undefined;
}

/**
 * 工具名注册器最终产出的两部分结果。
 */
export interface ToolNameRegistryResult<TContext> {
  /** 直接给 protocolOptions.toolRenderer 使用的解析函数。 */
  toolRenderer: (context: TContext) => string;
  /** 直接给 surface.renderers 合并使用的组件映射。 */
  renderers: RunSurfaceRendererMap;
}

/**
 * 默认的工具名归一化规则。
 */
function defaultNormalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 把单值或数组统一规范成数组，方便后续遍历。
 */
function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * 判断单个 matcher 是否命中了当前工具名。
 */
function matchesToolName(
  toolName: string,
  matcher: ToolNameMatcher,
  mode: ToolNameMatchMode,
  normalizeName: (name: string) => string
): boolean {
  if (matcher instanceof RegExp) {
    matcher.lastIndex = 0;
    return matcher.test(toolName);
  }

  const normalizedMatcher = normalizeName(matcher);

  return mode === 'includes'
    ? toolName.includes(normalizedMatcher)
    : toolName === normalizedMatcher;
}

/**
 * 从定义表中提取 surface renderers，方便用户只维护一份工具配置。
 */
function collectToolRenderers(definitions: ToolNameComponentMap): RunSurfaceRendererMap {
  const renderers: RunSurfaceRendererMap = {};

  for (const [renderer, definition] of Object.entries(definitions)) {
    if (definition.registration) {
      renderers[renderer] = definition.registration;
      continue;
    }

    if (definition.component) {
      renderers[renderer] = definition.component;
    }
  }

  return renderers;
}

/**
 * 创建一个通用的“按工具名选择 renderer”的注册器。
 *
 * 这个 helper 的目标是把下面两段重复代码收敛成一份配置：
 * - `protocolOptions.toolRenderer`
 * - `surface.renderers`
 */
export function createToolNameRegistry<TContext>(
  options: ToolNameRegistryOptions<TContext>
): ToolNameRegistryResult<TContext> {
  const normalizeName = options.normalizeName ?? defaultNormalizeName;
  const fallback = options.fallback ?? 'tool';
  const definitions = Object.entries(options.definitions).map(([renderer, definition]) => ({
    renderer,
    definition
  }));
  const renderers = collectToolRenderers(options.definitions);

  return {
    toolRenderer(context: TContext) {
      const resolvedName = options.resolveName(context);

      if (!resolvedName) {
        return fallback;
      }

      const normalizedToolName = normalizeName(resolvedName);

      for (const entry of definitions) {
        const matchers = toArray(entry.definition.match);
        const mode = entry.definition.mode ?? 'exact';

        if (matchers.some((matcher) => matchesToolName(normalizedToolName, matcher, mode, normalizeName))) {
          return entry.renderer;
        }
      }

      return fallback;
    },
    renderers
  };
}
