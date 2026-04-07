import type { Component } from 'vue';
import type {
  AguiComponentMap,
  MarkdownApprovalStatus,
  MarkdownBlock,
  MarkdownBuiltinComponentOverrides
} from '../core/types';
import type {
  AgentRuntime,
  RuntimeIntent,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';
import type { RuntimeTranscriptMessage } from '../runtime/replay';

/**
 * RunSurface 中一条消息当前所属的角色。
 */
export type RunSurfaceRole = 'assistant' | 'user' | 'system';

/**
 * RunSurface 的性能相关配置。
 */
export interface RunSurfacePerformanceOptions {
  /**
   * 组级窗口化一次最多默认渲染多少个 group。
   * 传 `false` 可关闭窗口化。
   */
  groupWindow?: number | false;
  /**
   * 每次向前展开更多消息时增加多少个 group。
   */
  groupWindowStep?: number;
  /**
   * 是否对重型 block 启用接近视口后再挂载。
   */
  lazyMount?: boolean;
  /**
   * 懒挂载观察的 rootMargin。
   */
  lazyMountMargin?: string;
  /**
   * 单个 text block 超过该长度后按 slab 分段渲染。
   */
  textSlabChars?: number;
}

/**
 * 自定义 block renderer 在渲染时会拿到的完整上下文。
 *
 * 适合需要：
 * - 读取当前 block / node
 * - 访问整个 runtime 快照
 * - 主动发出 intent
 *
 * 的复杂业务组件。
 */
export interface RunSurfaceRendererContext<
  TBlockData extends Record<string, unknown> = Record<string, unknown>,
  TNodeData extends Record<string, unknown> = Record<string, unknown>
> {
  /** 当前正在渲染的 surface block。 */
  block: SurfaceBlock<TBlockData>;
  /** 当前 block 关联的 runtime node。 */
  node?: RuntimeNode<TNodeData>;
  /** 当前运行时实例。 */
  runtime: AgentRuntime;
  /** 当前 runtime 的完整快照。 */
  snapshot: RuntimeSnapshot;
  /** 向 runtime 主动发出一条结构化 intent。 */
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

/**
 * 以 props 模式渲染 renderer 时，组件实际收到的 props 结构。
 */
export type RunSurfaceRendererProps<
  TBlockData extends Record<string, unknown> = Record<string, unknown>,
  TNodeData extends Record<string, unknown> = Record<string, unknown>
> = RunSurfaceRendererContext<TBlockData, TNodeData>;

/**
 * RunSurface 自定义 renderer 的两种接线模式。
 *
 * - `props`: 把上下文直接作为组件 props 传入
 * - `context`: 由内部包装层按约定注入
 */
export type RunSurfaceRendererMode = 'props' | 'context';

/**
 * 单个自定义 renderer 的完整注册结构。
 */
export interface RunSurfaceRendererRegistration {
  /** 实际负责渲染的 Vue 组件。 */
  component: Component;
  /** 当前 renderer 使用哪种上下文传递模式。 */
  mode?: RunSurfaceRendererMode;
  /** 额外附加给组件的静态或动态 props。 */
  props?: Record<string, unknown> | ((context: RunSurfaceRendererContext) => Record<string, unknown>);
}

/**
 * surface 可用的 renderer 注册表。
 *
 * key 是 block.renderer，value 可以是：
 * - 直接传一个组件
 * - 传完整 registration 控制 mode / props
 */
export type RunSurfaceRendererMap = Record<string, Component | RunSurfaceRendererRegistration>;

/**
 * draft 占位组件在渲染时可拿到的上下文。
 */
export interface RunSurfaceDraftPlaceholderContext {
  /** 当前仍处于 draft 状态的 block。 */
  block: SurfaceBlock;
  /** 当前消息所属角色。 */
  role: RunSurfaceRole;
  /** 当前运行时实例。 */
  runtime: AgentRuntime;
  /** 当前 runtime 的完整快照。 */
  snapshot: RuntimeSnapshot;
  /** 向 runtime 主动发出一条结构化 intent。 */
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

/**
 * draft 占位组件的完整注册结构。
 */
export interface RunSurfaceDraftPlaceholderRegistration {
  /** 实际负责渲染 draft 占位的 Vue 组件。 */
  component: Component;
  /** 额外附加给占位组件的静态或动态 props。 */
  props?:
    | Record<string, unknown>
    | ((context: RunSurfaceDraftPlaceholderContext) => Record<string, unknown>);
}

/**
 * RunSurface 中 draft block 使用的占位渲染配置。
 *
 * 传 `false` 表示完全关闭默认 draft 占位。
 */
export type RunSurfaceDraftPlaceholder = Component | RunSurfaceDraftPlaceholderRegistration | false;

/**
 * 消息 shell 在渲染时可拿到的上下文。
 *
 * shell 常用来统一：
 * - assistant / user / system 外观
 * - markdown 与 draft 消息容器
 * - 气泡、头像、内边距等消息级 UI
 */
export interface RunSurfaceMessageShellContext {
  /** 当前消息对应的 surface block。 */
  block: SurfaceBlock;
  /** 当前消息所属角色。 */
  role: RunSurfaceRole;
  /** 当前 shell 包裹的是稳定 markdown 还是 draft 内容。 */
  kind: 'markdown' | 'draft';
  /** 当前 block 成功解析出的 markdown block。 */
  markdownBlock?: MarkdownBlock;
  /** 当前运行时实例。 */
  runtime: AgentRuntime;
  /** 当前 runtime 的完整快照。 */
  snapshot: RuntimeSnapshot;
  /** 向 runtime 主动发出一条结构化 intent。 */
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

/**
 * 单个消息 shell 的完整注册结构。
 */
export interface RunSurfaceMessageShellRegistration {
  /** 实际负责包裹消息内容的 Vue 组件。 */
  component: Component;
  /** 额外附加给 shell 组件的静态或动态 props。 */
  props?:
    | Record<string, unknown>
    | ((context: RunSurfaceMessageShellContext) => Record<string, unknown>);
}

/**
 * 单个角色对应的消息 shell 配置。
 *
 * 传 `false` 表示该角色不使用额外 shell 包裹。
 */
export type RunSurfaceMessageShell = Component | RunSurfaceMessageShellRegistration | false;

/**
 * 多角色消息 shell 配置表。
 */
export type RunSurfaceMessageShellMap = Partial<Record<RunSurfaceRole, RunSurfaceMessageShell>>;

/**
 * 内置消息操作栏支持的动作 key。
 */
export type RunSurfaceBuiltinMessageActionKey =
  | 'copy'
  | 'regenerate'
  | 'retry'
  | 'resume'
  | 'interrupt'
  | 'like'
  | 'dislike'
  | 'share';

/**
 * 消息操作栏在点击动作时可拿到的完整上下文。
 */
export interface RunSurfaceMessageActionContext {
  /** 当前消息所属角色。 */
  role: RunSurfaceRole;
  /** 当前消息对应的全部 block。 */
  blocks: SurfaceBlock[];
  /** 当前消息所属的 conversation / session id。 */
  conversationId?: string | null;
  /** 当前消息所属的 turn id。 */
  turnId?: string | null;
  /** 当前消息自身的 message id。 */
  messageId?: string | null;
  /** 兼容旧协议时的 group id。 */
  groupId?: string | null;
  /** 当前消息的 transcript 聚合结果。 */
  message?: RuntimeTranscriptMessage;
  /** 当前运行时实例。 */
  runtime: AgentRuntime;
  /** 当前 runtime 的完整快照。 */
  snapshot: RuntimeSnapshot;
  /** 向 runtime 主动发出一条结构化 intent。 */
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

/**
 * 单个消息操作按钮的完整定义结构。
 */
export interface RunSurfaceMessageActionDefinition {
  /** 当前动作的稳定 key。 */
  key: string;
  /** 当前动作的可读标签。 */
  label?: string;
  /** 当前动作按钮的提示文案。 */
  title?: string;
  /** 自定义图标组件；不传时内置动作会使用默认图标。 */
  icon?: Component;
  /** 是否显示当前动作。 */
  visible?: boolean | ((context: RunSurfaceMessageActionContext) => boolean);
  /** 是否禁用当前动作。 */
  disabled?: boolean | ((context: RunSurfaceMessageActionContext) => boolean);
  /** 当前动作点击后的处理函数。 */
  onClick?: (context: RunSurfaceMessageActionContext) => void | Promise<void>;
}

/**
 * 内置消息动作的外部行为处理器签名。
 */
export type RunSurfaceBuiltinMessageActionHandler = (
  context: RunSurfaceMessageActionContext
) => void | Promise<void>;

/**
 * 消息操作栏中单个条目的声明方式。
 *
 * 可以直接传：
 * - 内置动作 key，例如 `copy`
 * - 完整动作定义对象
 */
export type RunSurfaceMessageActionItem =
  | RunSurfaceBuiltinMessageActionKey
  | RunSurfaceMessageActionDefinition;

/**
 * 单个角色对应的消息操作栏配置。
 */
export interface RunSurfaceMessageActionsRoleOptions {
  /** 是否启用当前角色的消息操作栏。 */
  enabled?: boolean;
  /** draft 流式阶段是否也显示操作栏。默认只在稳定消息后显示。 */
  showOnDraft?: boolean;
  /** 关联 node 仍在运行时是否也显示操作栏。默认只在消息真正结束后显示。 */
  showWhileRunning?: boolean;
  /** 覆写内置动作的实际业务行为，例如把“重新生成”接到真实请求。 */
  builtinHandlers?: Partial<Record<
    RunSurfaceBuiltinMessageActionKey,
    RunSurfaceBuiltinMessageActionHandler
  >>;
  /** 当前角色要显示的动作列表。 */
  actions?: RunSurfaceMessageActionItem[];
}

/**
 * 多角色消息操作栏配置表。
 *
 * 传 `false` 表示该角色完全关闭消息操作栏。
 */
export type RunSurfaceMessageActionsMap = Partial<Record<
  RunSurfaceRole,
  RunSurfaceMessageActionsRoleOptions | false
>>;

/**
 * 内置 approval 动作支持的稳定 key。
 */
export type RunSurfaceBuiltinApprovalActionKey =
  | 'approve'
  | 'reject'
  | 'changes_requested'
  | 'submit'
  | 'retry'
  | 'resume'
  | 'interrupt';

/**
 * approval 卡片在点击动作时可拿到的完整上下文。
 */
export interface RunSurfaceApprovalActionContext {
  /** 当前卡片标题。 */
  title: string;
  /** 当前卡片说明文案。 */
  message?: string;
  /** 当前审批项唯一标识。 */
  approvalId?: string;
  /** 当前审批状态。 */
  status: MarkdownApprovalStatus;
  /** 当前 runtime ref。 */
  refId?: string;
  /** 当前 approval 对应的 surface block。 */
  block: SurfaceBlock;
  /** 当前卡片所在消息角色。 */
  role: RunSurfaceRole;
  /** 当前运行时实例。 */
  runtime: AgentRuntime;
  /** 当前 runtime 的完整快照。 */
  snapshot: RuntimeSnapshot;
  /** 向 runtime 主动发出一条结构化 intent。 */
  emitIntent: (intent: Omit<RuntimeIntent, 'id' | 'at'>) => RuntimeIntent;
}

/**
 * 单个 approval 动作按钮的完整定义结构。
 */
export interface RunSurfaceApprovalActionDefinition {
  /** 当前动作的稳定 key。 */
  key: string;
  /** 当前动作的可读标签。 */
  label?: string;
  /** 当前动作按钮的提示文案。 */
  title?: string;
  /** 自定义图标组件；不传时默认使用文本按钮。 */
  icon?: Component;
  /** 是否显示当前动作。 */
  visible?: boolean | ((context: RunSurfaceApprovalActionContext) => boolean);
  /** 是否禁用当前动作。 */
  disabled?: boolean | ((context: RunSurfaceApprovalActionContext) => boolean);
  /** 当前动作点击后的处理函数。 */
  onClick?: (context: RunSurfaceApprovalActionContext) => void | Promise<void>;
}

/**
 * approval 内置动作的业务处理器签名。
 */
export type RunSurfaceBuiltinApprovalActionHandler = (
  context: RunSurfaceApprovalActionContext
) => void | Promise<void>;

/**
 * approval 动作条目的声明方式。
 */
export type RunSurfaceApprovalActionItem =
  | RunSurfaceBuiltinApprovalActionKey
  | RunSurfaceApprovalActionDefinition;

/**
 * approval 卡片动作区域的完整配置。
 */
export interface RunSurfaceApprovalActionsOptions {
  /** 是否启用当前 approval 动作区域。 */
  enabled?: boolean;
  /** 覆写内置 approval 动作的业务行为。 */
  builtinHandlers?: Partial<Record<
    RunSurfaceBuiltinApprovalActionKey,
    RunSurfaceBuiltinApprovalActionHandler
  >>;
  /** 当前 approval 卡片要展示的动作列表。 */
  actions?: RunSurfaceApprovalActionItem[];
}

/**
 * RunSurface 的完整渲染配置。
 *
 * 这一层决定的是“runtime 最终怎么显示”，包括：
 * - 默认渲染 slot
 * - 文本排版参数
 * - markdown / agui / renderer 覆盖
 * - draft 占位
 * - 不同角色的消息 shell
 */
export interface RunSurfaceOptions {
  /** 默认读取哪个 slot 的 block，默认是 `main`。 */
  slot?: string;
  /** 文本类 block 的默认行高。 */
  lineHeight?: number;
  /** 文本类 block 的默认字体声明。 */
  font?: string;
  /** 当前 slot 没有任何内容时显示的占位文案。 */
  emptyText?: string;
  /** 与窗口化、懒挂载、文本分段相关的性能配置。 */
  performance?: RunSurfacePerformanceOptions;
  /** markdown 中内嵌 `agui` 组件时可用的组件注册表。 */
  aguiComponents?: AguiComponentMap;
  /** 内置 markdown block renderer 的覆写表。 */
  builtinComponents?: MarkdownBuiltinComponentOverrides;
  /** runtime block.renderer 到 Vue 组件的映射表。 */
  renderers?: RunSurfaceRendererMap;
  /** draft block 在未稳定前显示的占位组件。 */
  draftPlaceholder?: RunSurfaceDraftPlaceholder;
  /** assistant / user / system 三类消息的外层 shell 配置。 */
  messageShells?: RunSurfaceMessageShellMap;
  /** assistant / user / system 三类消息末尾的操作栏配置。 */
  messageActions?: RunSurfaceMessageActionsMap;
  /** approval 卡片对应的动作区域配置。 */
  approvalActions?: RunSurfaceApprovalActionsOptions | false;
}
