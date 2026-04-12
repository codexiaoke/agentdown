import type { CSSProperties } from 'vue';
import type {
  AgentdownConfig,
  AgentdownTheme,
  AgentdownThemeComponentTokens,
  AgentdownThemeTokens
} from './types';

/**
 * 判断当前值是否是一个包含自有键的普通对象。
 */
function hasOwnKeys(value: object | undefined): boolean {
  return !!value && Object.keys(value).length > 0;
}

/**
 * 浅合并一层简单记录对象。
 */
function mergeFlatRecord<T extends object>(base?: T, override?: T): T | undefined {
  if (!base && !override) {
    return undefined;
  }

  return {
    ...(base ?? {}),
    ...(override ?? {})
  } as T;
}

/**
 * 合并 theme.tokens。
 */
function mergeAgentdownThemeTokens(
  base?: AgentdownThemeTokens,
  override?: AgentdownThemeTokens
): AgentdownThemeTokens | undefined {
  if (!base && !override) {
    return undefined;
  }

  const color = mergeFlatRecord(base?.color, override?.color);
  const layout = mergeFlatRecord(base?.layout, override?.layout);
  const merged: AgentdownThemeTokens = {};

  if (color) {
    merged.color = color;
  }

  if (layout) {
    merged.layout = layout;
  }

  return hasOwnKeys(merged) ? merged : undefined;
}

/**
 * 合并 theme.components。
 */
function mergeAgentdownThemeComponents(
  base?: AgentdownThemeComponentTokens,
  override?: AgentdownThemeComponentTokens
): AgentdownThemeComponentTokens | undefined {
  if (!base && !override) {
    return undefined;
  }

  const thought = mergeFlatRecord(base?.thought, override?.thought);
  const tool = mergeFlatRecord(base?.tool, override?.tool);
  const merged: AgentdownThemeComponentTokens = {};

  if (thought) {
    merged.thought = thought;
  }

  if (tool) {
    merged.tool = tool;
  }

  return hasOwnKeys(merged) ? merged : undefined;
}

/**
 * 定义一份带完整类型提示的 Agentdown theme。
 */
export function defineAgentdownTheme(theme: AgentdownTheme): AgentdownTheme {
  return theme;
}

/**
 * 深度合并两份 Agentdown theme。
 */
export function mergeAgentdownThemes(base?: AgentdownTheme, override?: AgentdownTheme): AgentdownTheme | undefined {
  if (!base && !override) {
    return undefined;
  }

  const tokens = mergeAgentdownThemeTokens(base?.tokens, override?.tokens);
  const components = mergeAgentdownThemeComponents(base?.components, override?.components);
  const cssVars = mergeFlatRecord(base?.cssVars, override?.cssVars);
  const merged: AgentdownTheme = {};

  if (tokens) {
    merged.tokens = tokens;
  }

  if (components) {
    merged.components = components;
  }

  if (cssVars) {
    merged.cssVars = cssVars as Record<`--agentdown-${string}`, string>;
  }

  return hasOwnKeys(merged) ? merged : undefined;
}

/**
 * 定义一份带完整类型提示的 Agentdown config。
 */
export function defineAgentdownConfig(config: AgentdownConfig): AgentdownConfig {
  return config;
}

/**
 * 把 theme token 映射成最终可挂到根节点上的 CSS 变量。
 */
export function resolveAgentdownThemeCssVars(theme?: AgentdownTheme): CSSProperties {
  if (!theme) {
    return {};
  }

  const cssVars: Record<string, string> = {};

  const assignVar = (name: `--agentdown-${string}`, value?: string) => {
    if (!value) {
      return;
    }

    cssVars[name] = value;
  };

  assignVar('--agentdown-text-color', theme.tokens?.color?.text);
  assignVar('--agentdown-muted-color', theme.tokens?.color?.muted);
  assignVar('--agentdown-subtle-color', theme.tokens?.color?.subtle);
  assignVar('--agentdown-surface', theme.tokens?.color?.surface);
  assignVar('--agentdown-elevated-surface', theme.tokens?.color?.elevatedSurface);
  assignVar('--agentdown-border-color', theme.tokens?.color?.border);
  assignVar('--agentdown-border-soft', theme.tokens?.color?.borderSoft);
  assignVar('--agentdown-code-bg', theme.tokens?.color?.codeBg);
  assignVar('--agentdown-thought-bg', theme.tokens?.color?.thoughtBg);
  assignVar('--agentdown-thought-accent', theme.tokens?.color?.thoughtAccent);
  assignVar('--agentdown-thought-accent-soft', theme.tokens?.color?.thoughtAccentSoft);
  assignVar('--agentdown-thought-title-color', theme.tokens?.color?.thoughtTitle);
  assignVar('--agentdown-thought-title-muted', theme.tokens?.color?.thoughtTitleMuted);
  assignVar('--agentdown-agui-bg', theme.tokens?.color?.aguiBg);
  assignVar('--agentdown-radius', theme.tokens?.layout?.radius);
  assignVar('--agentdown-shadow', theme.tokens?.layout?.shadow);

  assignVar('--agentdown-thought-title-color', theme.components?.thought?.titleColor);
  assignVar('--agentdown-thought-title-done-color', theme.components?.thought?.titleDoneColor);
  assignVar('--agentdown-thought-title-muted', theme.components?.thought?.titleMutedColor);
  assignVar('--agentdown-thought-title-highlight-color', theme.components?.thought?.titleHighlightColor);
  assignVar('--agentdown-thought-chevron-color', theme.components?.thought?.chevronColor);
  assignVar('--agentdown-thought-chevron-expanded-color', theme.components?.thought?.chevronExpandedColor);
  assignVar('--agentdown-thought-body-color', theme.components?.thought?.bodyColor);
  assignVar('--agentdown-thought-body-strong-color', theme.components?.thought?.bodyStrongColor);
  assignVar('--agentdown-thought-body-subtle-color', theme.components?.thought?.bodySubtleColor);
  assignVar('--agentdown-thought-body-link-color', theme.components?.thought?.bodyLinkColor);
  assignVar('--agentdown-thought-body-code-color', theme.components?.thought?.bodyCodeColor);
  assignVar('--agentdown-thought-line-color', theme.components?.thought?.lineColor);

  assignVar('--agentdown-tool-surface-bg', theme.components?.tool?.surfaceBackground);
  assignVar('--agentdown-tool-surface-border-color', theme.components?.tool?.surfaceBorderColor);
  assignVar('--agentdown-tool-surface-shadow', theme.components?.tool?.surfaceShadow);
  assignVar('--agentdown-tool-shimmer-color', theme.components?.tool?.shimmerColor);
  assignVar('--agentdown-tool-title-color', theme.components?.tool?.titleColor);
  assignVar('--agentdown-tool-status-pending-bg', theme.components?.tool?.pendingBackground);
  assignVar('--agentdown-tool-status-pending-color', theme.components?.tool?.pendingColor);
  assignVar('--agentdown-tool-status-success-bg', theme.components?.tool?.successBackground);
  assignVar('--agentdown-tool-status-success-color', theme.components?.tool?.successColor);
  assignVar('--agentdown-tool-status-danger-bg', theme.components?.tool?.dangerBackground);
  assignVar('--agentdown-tool-status-danger-color', theme.components?.tool?.dangerColor);

  return {
    ...cssVars,
    ...(theme.cssVars ?? {})
  } as CSSProperties;
}
