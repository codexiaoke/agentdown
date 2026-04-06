import type MarkdownIt from 'markdown-it';
import type { Component } from 'vue';

export type MarkdownHeadingTag =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6';

/**
 * `MarkdownRenderer` 面向不同页面形态的推荐渲染模式。
 *
 * - `typing`：偏聊天 / 生成过程展示，默认更保守地关闭窗口化
 * - `window`：偏长文阅读 / 性能优先，默认启用窗口化与更积极的 slab
 */
export type MarkdownRenderMode = 'typing' | 'window';

export interface MarkdownInlineFragment {
  /** 当前 inline 片段的稳定标识。 */
  id: string;
  /** 该片段对应的原始文本。 */
  text: string;
  /** 是否带粗体语义。 */
  strong?: boolean;
  /** 是否带斜体语义。 */
  em?: boolean;
  /** 是否带删除线语义。 */
  del?: boolean;
  /** 是否为 inline code 片段。 */
  code?: boolean;
  /** 如果当前片段是链接，则记录 href。 */
  href?: string;
}

export interface MarkdownTextBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 text。 */
  kind: 'text';
  /** 渲染时使用的文本标签。 */
  tag: MarkdownHeadingTag;
  /** 交给 pretext 布局的纯文本内容。 */
  text: string;
  /** 富 inline 文本的结构化片段；为空时表示纯文本。 */
  fragments?: MarkdownInlineFragment[];
}

export interface MarkdownHtmlBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 html。 */
  kind: 'html';
  /** 回退到 HTML 渲染时的字符串结果。 */
  html: string;
}

export interface MarkdownCodeBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 code。 */
  kind: 'code';
  /** 原始代码内容。 */
  code: string;
  /** 代码语言标签。 */
  language: string;
  /** fence 后附带的完整 meta 信息。 */
  meta: string;
}

export interface MarkdownMermaidBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 mermaid。 */
  kind: 'mermaid';
  /** Mermaid 图表源码。 */
  code: string;
  /** fence 后附带的完整 meta 信息。 */
  meta: string;
}

export interface MarkdownThoughtBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 thought。 */
  kind: 'thought';
  /** 折叠面板标题。 */
  title: string;
  /** thought 内部递归解析后的子 block。 */
  blocks: MarkdownBlock[];
}

export interface MarkdownMathBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 math。 */
  kind: 'math';
  /** KaTeX 要渲染的表达式。 */
  expression: string;
  /** 是否按块级公式显示。 */
  displayMode: boolean;
}

export interface MarkdownAguiBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 agui。 */
  kind: 'agui';
  /** 要注入的组件名。 */
  name: string;
  /** 从 markdown 指令里解析出的组件 props。 */
  props: Record<string, unknown>;
  /** 组件占位时的最小高度。 */
  minHeight: number;
}

export type MarkdownArtifactKind = 'file' | 'diff' | 'report' | 'image' | 'json' | 'table';

export type MarkdownApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

export interface MarkdownArtifactBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 artifact。 */
  kind: 'artifact';
  /** 绑定的 runtime ref。 */
  refId?: string;
  /** 卡片标题。 */
  title: string;
  /** 说明文案。 */
  message?: string;
  /** 产物唯一标识。 */
  artifactId?: string;
  /** 产物种类。 */
  artifactKind: MarkdownArtifactKind;
  /** 产物标签。 */
  label?: string;
  /** 产物链接。 */
  href?: string;
}

export interface MarkdownApprovalBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 approval。 */
  kind: 'approval';
  /** 绑定的 runtime ref。 */
  refId?: string;
  /** 卡片标题。 */
  title: string;
  /** 说明文案。 */
  message?: string;
  /** 审批项唯一标识。 */
  approvalId?: string;
  /** 当前审批状态。 */
  status?: MarkdownApprovalStatus;
}

export interface MarkdownTimelineBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 timeline。 */
  kind: 'timeline';
  /** 绑定的 runtime ref；为空时读取全局事件流。 */
  refId?: string;
  /** 时间线标题。 */
  title: string;
  /** 最多展示多少条事件。 */
  limit: number;
  /** 没有事件时显示的文案。 */
  emptyText?: string;
}

export type MarkdownBlock =
  | MarkdownTextBlock
  | MarkdownHtmlBlock
  | MarkdownCodeBlock
  | MarkdownMermaidBlock
  | MarkdownThoughtBlock
  | MarkdownMathBlock
  | MarkdownAguiBlock
  | MarkdownArtifactBlock
  | MarkdownApprovalBlock
  | MarkdownTimelineBlock;

export interface MarkdownBuiltinComponents {
  /** 负责渲染 pretext 文本块和标题的组件。 */
  text: Component;
  /** 负责渲染 fenced code block 的组件。 */
  code: Component;
  /** 负责渲染 Mermaid 图表块的组件。 */
  mermaid: Component;
  /** 负责渲染公式块的组件。 */
  math: Component;
  /** 负责渲染 thought 容器的组件。 */
  thought: Component;
  /** 负责渲染 HTML 回退块的组件。 */
  html: Component;
  /** 负责包裹 AGUI 注入节点的组件。 */
  agui: Component;
  /** 负责渲染 artifact 卡片的组件。 */
  artifact: Component;
  /** 负责渲染 approval 卡片的组件。 */
  approval: Component;
  /** 负责渲染 timeline 卡片的组件。 */
  timeline: Component;
}

/** 允许调用方按需覆盖默认 markdown 渲染组件。 */
export type MarkdownBuiltinComponentOverrides = Partial<MarkdownBuiltinComponents>;

/**
 * MarkdownRenderer 的性能相关配置。
 */
export interface MarkdownRendererPerformanceOptions {
  /**
   * 显式指定 renderer 采用哪一种推荐模式。
   *
   * - `typing` 更适合聊天、生成过程和较短内容
   * - `window` 更适合长文档和性能优先场景
   *
   * 如果不传，Agentdown 会尽量根据现有性能参数做向后兼容推断。
   */
  mode?: MarkdownRenderMode;
  /**
   * 单个 text block 超过该长度后按 slab 分段渲染。
   * 传 `false` 可关闭 slab 拆分。
   */
  textSlabChars?: number | false;
  /**
   * 是否对长文档 block 启用视口窗口化。
   */
  virtualize?: boolean;
  /**
   * 视口窗口化观察器使用的 rootMargin。
   */
  virtualizeMargin?: string;
}

/**
 * `MarkdownRenderer` 对外暴露的轻量性能遥测快照。
 */
export interface MarkdownRendererTelemetry {
  /** 当前 renderer 正在使用的推荐模式。 */
  renderMode: MarkdownRenderMode;
  /** 当前 markdown 源文本长度。 */
  sourceLength: number;
  /** 解析后的原始 block 总数。 */
  parsedBlockCount: number;
  /** 进入实际渲染链后的 block 总数。 */
  renderableBlockCount: number;
  /** 当前已经挂载到 DOM 中的 block 数量。 */
  mountedBlockCount: number;
  /** 当前挂载窗口起始索引。 */
  mountedStartIndex: number;
  /** 当前挂载窗口结束索引。 */
  mountedEndIndex: number;
  /** 已拿到真实高度测量结果的 block 数量。 */
  measuredBlockCount: number;
  /** 当前是否启用了窗口化。 */
  virtualized: boolean;
  /** 当前 text slab 配置。 */
  textSlabChars: number | false;
  /** 当前 renderer 宽度。 */
  width: number;
  /** 估算后的整篇虚拟总高度。 */
  totalVirtualHeight: number;
  /** 顶部 spacer 的当前高度。 */
  topSpacerHeight: number;
  /** 底部 spacer 的当前高度。 */
  bottomSpacerHeight: number;
  /** 当前视口同步执行次数。 */
  viewportSyncPasses: number;
  /** 当前窗口范围真正变化的次数。 */
  windowRangeChangeCount: number;
}

export interface AguiComponentRegistration {
  /** 实际要渲染的 Vue 组件。 */
  component: Component;
  /** 组件在 markdown 中的建议最小高度。 */
  minHeight?: number;
}

export type AguiComponentMap = Record<string, Component | AguiComponentRegistration>;

export type MarkdownEnginePlugin = (md: MarkdownIt) => void;

export interface ParseMarkdownOptions {
  /** 额外注入到 markdown-it 的插件。 */
  plugins?: MarkdownEnginePlugin[];
  /** thought 容器默认标题。 */
  thoughtTitle?: string;
  /** 可供 AGUI 指令解析的组件映射表。 */
  aguiComponents?: AguiComponentMap;
  /**
   * 是否允许原始 HTML 直接进入 markdown 渲染链。
   * 默认关闭；开启后只应用于可信内容，否则会有注入风险。
   */
  allowUnsafeHtml?: boolean;
}
