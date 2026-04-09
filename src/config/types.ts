/**
 * Agentdown 全局语义色板。
 */
export interface AgentdownThemeColorTokens {
  /** 默认正文颜色。 */
  text?: string;
  /** 次级说明文字颜色。 */
  muted?: string;
  /** 更弱一级的提示色。 */
  subtle?: string;
  /** 基础表面色。 */
  surface?: string;
  /** 浮层 / 卡片等抬升表面色。 */
  elevatedSurface?: string;
  /** 默认边框色。 */
  border?: string;
  /** 更轻的边框色。 */
  borderSoft?: string;
  /** 代码背景色。 */
  codeBg?: string;
  /** thought 容器背景色。 */
  thoughtBg?: string;
  /** thought 强调色。 */
  thoughtAccent?: string;
  /** thought 强调色的柔和版本。 */
  thoughtAccentSoft?: string;
  /** thought 标题默认颜色。 */
  thoughtTitle?: string;
  /** thought 标题静态弱色。 */
  thoughtTitleMuted?: string;
  /** AGUI 区域背景色。 */
  aguiBg?: string;
}

/**
 * Agentdown 全局布局 token。
 */
export interface AgentdownThemeLayoutTokens {
  /** 默认圆角。 */
  radius?: string;
  /** 默认阴影。 */
  shadow?: string;
}

/**
 * thought 组件可覆盖的细粒度主题 token。
 */
export interface AgentdownThoughtThemeTokens {
  /** 标题默认文字色。 */
  titleColor?: string;
  /** 标题完成态文字色。 */
  titleDoneColor?: string;
  /** 标题扫光基础灰。 */
  titleMutedColor?: string;
  /** 标题扫光高光色。 */
  titleHighlightColor?: string;
  /** 箭头默认颜色。 */
  chevronColor?: string;
  /** 箭头展开态颜色。 */
  chevronExpandedColor?: string;
  /** 正文基础颜色。 */
  bodyColor?: string;
  /** 正文强调颜色。 */
  bodyStrongColor?: string;
  /** 正文弱提示颜色。 */
  bodySubtleColor?: string;
  /** 正文链接颜色。 */
  bodyLinkColor?: string;
  /** 正文行内代码颜色。 */
  bodyCodeColor?: string;
  /** 左侧辅助线颜色。 */
  lineColor?: string;
}

/**
 * 默认工具调用行可覆盖的细粒度主题 token。
 */
export interface AgentdownToolThemeTokens {
  /** 工具名称颜色。 */
  titleColor?: string;
  /** 调用中状态背景色。 */
  pendingBackground?: string;
  /** 调用中状态文字色。 */
  pendingColor?: string;
  /** 调用成功状态背景色。 */
  successBackground?: string;
  /** 调用成功状态文字色。 */
  successColor?: string;
  /** 调用失败状态背景色。 */
  dangerBackground?: string;
  /** 调用失败状态文字色。 */
  dangerColor?: string;
}

/**
 * Agentdown 的主题 token 结构。
 */
export interface AgentdownThemeTokens {
  /** 全局语义色板。 */
  color?: AgentdownThemeColorTokens;
  /** 全局布局 token。 */
  layout?: AgentdownThemeLayoutTokens;
}

/**
 * Agentdown 各内置组件的局部主题 token。
 */
export interface AgentdownThemeComponentTokens {
  /** thought 组件主题。 */
  thought?: AgentdownThoughtThemeTokens;
  /** 默认 tool renderer 主题。 */
  tool?: AgentdownToolThemeTokens;
}

/**
 * Agentdown 主题对象。
 */
export interface AgentdownTheme {
  /** 全局语义 token。 */
  tokens?: AgentdownThemeTokens;
  /** 组件级局部 token。 */
  components?: AgentdownThemeComponentTokens;
  /** 直接注入的原始 CSS 变量。 */
  cssVars?: Record<`--agentdown-${string}`, string>;
}

/**
 * Agentdown 子树级 / 全局级配置对象。
 */
export interface AgentdownConfig {
  /** 当前作用域下启用的主题。 */
  theme?: AgentdownTheme;
}
