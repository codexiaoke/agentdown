import type MarkdownIt from 'markdown-it';
import type { Component, ComputedRef, ShallowRef } from 'vue';

export type MarkdownHeadingTag =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6';

export interface MarkdownTextBlock {
  /** 当前 block 的稳定标识。 */
  id: string;
  /** block 类型，固定为 text。 */
  kind: 'text';
  /** 渲染时使用的文本标签。 */
  tag: MarkdownHeadingTag;
  /** 交给 pretext 布局的纯文本内容。 */
  text: string;
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

export type AguiNodeKind = 'run' | 'user' | 'leader' | 'agent' | 'tool' | 'system';

export type AguiNodeStatus = 'idle' | 'thinking' | 'assigned' | 'running' | 'waiting_tool' | 'done' | 'error';

export interface AgentNodeState {
  /** 节点唯一标识，通常和 markdown 中的 ref 对齐。 */
  id: string;
  /** 节点种类，如 run、agent、tool。 */
  kind: AguiNodeKind;
  /** 节点当前状态。 */
  status: AguiNodeStatus;
  /** 节点显示标题。 */
  title: string;
  /** 父节点 id，用于组织层级关系。 */
  parentId?: string;
  /** 节点当前说明文案。 */
  message?: string;
  /** 节点对应的工具名，仅 tool 类节点常用。 */
  toolName?: string;
  /** 节点开始时间戳。 */
  startedAt?: number;
  /** 节点结束时间戳。 */
  endedAt?: number;
  /** 子节点 id 列表。 */
  childrenIds: string[];
  /** 用户自定义附加信息。 */
  meta: Record<string, unknown>;
}

export type StatePatch<T extends object> = {
  [K in keyof T]?: T[K] | undefined;
};

export type AguiNodePatch = StatePatch<AgentNodeState>;

export interface AguiRuntimeEvent {
  /** 事件名，如 agent.started、tool.finished。 */
  type: string;
  /** 当前事件作用的节点 id。 */
  nodeId: string;
  /** 当前事件声明的父节点 id。 */
  parentId?: string;
  /** 当前事件声明的节点种类。 */
  kind?: AguiNodeKind;
  /** 当前事件携带的标题。 */
  title?: string;
  /** 当前事件携带的文案。 */
  message?: string;
  /** 当前事件关联的工具名。 */
  toolName?: string;
  /** 当前事件附加的自定义信息。 */
  meta?: Record<string, unknown>;
  /** 事件发生时间，未提供时由 runtime 自动补。 */
  at?: number;
}

export interface AguiRuntimeReducerContext {
  /** 当前进入 reducer 的原始事件。 */
  event: AguiRuntimeEvent;
  /** 标准化后的事件时间。 */
  at: number;
  /** 当前节点归约前的上一份状态。 */
  previousState: AgentNodeState | null;
  /** 内置规则先算出的默认 patch。 */
  defaultPatch: Readonly<AguiNodePatch>;
}

export interface AguiRuntimeReducerResult {
  /** 自定义补丁内容。 */
  patch?: AguiNodePatch;
  /** 是否完全替换内置默认 patch。 */
  replaceDefault?: boolean;
}

export type AguiRuntimeReducer =
  | ((context: AguiRuntimeReducerContext) => AguiNodePatch | AguiRuntimeReducerResult | null | void)
  | null;

export interface CreateAguiRuntimeOptions {
  /** 自定义事件归约器，用来扩展或覆盖默认状态映射。 */
  reducer?: AguiRuntimeReducer;
}

export interface AguiBinding<TState = unknown, TEvent = AguiRuntimeEvent> {
  /** 当前 binding 对应的节点 id。 */
  id: string;
  /** 当前节点的响应式状态引用。 */
  stateRef: Readonly<ShallowRef<TState | null>>;
  /** 当前节点的响应式子节点列表。 */
  childrenRef: Readonly<ComputedRef<TState[]>>;
  /** 当前节点的响应式事件流。 */
  eventsRef: Readonly<ShallowRef<TEvent[]>>;
}

export interface AguiRuntime {
  /** 获取某个节点的只读状态 ref。 */
  ref<TState = unknown>(id: string): Readonly<ShallowRef<TState | null>>;
  /** 获取某个节点的完整 binding。 */
  binding<TState = unknown, TEvent = AguiRuntimeEvent>(id: string): AguiBinding<TState, TEvent>;
  /** 直接覆盖某个节点的完整状态。 */
  set<TState>(id: string, value: TState): void;
  /** 以 patch 方式更新某个节点状态。 */
  patch<TState extends object>(id: string, patch: StatePatch<TState>): void;
  /** 推入一个事件，并触发内部归约。 */
  emit(event: AguiRuntimeEvent): void;
  /** 获取某个父节点下的响应式子节点列表。 */
  children<TState = unknown>(parentId: string): Readonly<ComputedRef<TState[]>>;
  /** 获取全局或某个节点下的响应式事件流。 */
  events(id?: string): Readonly<ShallowRef<AguiRuntimeEvent[]>>;
  /** 清空所有节点状态、关系和事件。 */
  reset(): void;
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
}
