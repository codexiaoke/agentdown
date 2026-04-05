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
