import type { AgentdownPresetOptions } from '../../runtime/definePreset';
import type {
  ProtocolContext,
  RuntimeData,
  RuntimeProtocol,
  StreamAssembler
} from '../../runtime/types';

/**
 * LangChain / LangGraph 工具事件里常见的工具载荷结构。
 */
export interface LangChainToolPayload extends RuntimeData {
  /** 工具节点 id，优先使用 LangChain 事件自身的 `run_id`。 */
  id?: string;
  /** 工具名称。 */
  name?: string;
  /** LangChain tool message 上的原始 tool call id。 */
  tool_call_id?: string;
  /** 工具输入。 */
  input?: unknown;
  /** LangChain tool output 原始对象。 */
  output?: unknown;
  /** 归一化后的工具结果。 */
  result?: unknown;
  /** 某些工具结果会挂在 `content`。 */
  content?: unknown;
}

/**
 * LangChain `astream_events(version="v2")` 的最小公共结构。
 */
export interface LangChainEvent extends RuntimeData {
  /** 官方事件名，例如 `on_chat_model_stream`、`on_tool_start`。 */
  event: string;
  /** 当前 LangChain runnable 自身的 run id。 */
  run_id?: string;
  /** 当前 runnable 名称，例如 `LangGraph`、`lookup_weather`。 */
  name?: string;
  /** LangChain 原始 tags。 */
  tags?: string[];
  /** LangChain 原始 metadata。 */
  metadata?: RuntimeData;
  /** 父级 runnable id 链。第一个通常就是整次 agent run 的根 id。 */
  parent_ids?: string[];
  /** LangChain 事件的业务数据区。 */
  data?: RuntimeData;
  /** 某些异常场景会直接附带 message。 */
  message?: string;
  /** 某些异常场景会直接附带 reason。 */
  reason?: string;
  /** 错误对象或错误字符串。 */
  error?: unknown;
}

/**
 * 解析 tool renderer 时可用的上下文信息。
 */
export interface LangChainToolRendererContext {
  /** 当前根 run id。 */
  runId: string;
  /** 当前工具节点 id。 */
  toolId: string;
  /** 当前工具原始 payload。 */
  tool: LangChainToolPayload | undefined;
  /** 当前处理的 LangChain 原始事件。 */
  packet: LangChainEvent;
  /** protocol 执行上下文。 */
  context: ProtocolContext;
}

/**
 * LangChain tool renderer 的可配置解析方式。
 */
export type LangChainToolRendererResolver =
  | string
  | ((input: LangChainToolRendererContext) => string | undefined);

/**
 * 生成 streamId 时的自定义回调签名。
 */
export type LangChainStreamIdResolver = (
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 blockId 时的自定义回调签名。
 */
export type LangChainBlockIdResolver = (
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 groupId 时的自定义回调签名。
 */
export type LangChainGroupIdResolver = (
  runId: string,
  packet: LangChainEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 run 标题时的自定义回调签名。
 */
export type LangChainRunTitleResolver = (
  packet: LangChainEvent,
  runId: string,
  context: ProtocolContext
) => string | undefined;

/**
 * LangChain protocol 的可选行为配置。
 */
export interface LangChainProtocolOptions {
  /** 生成 block 时使用的 slot，默认是 `main`。 */
  slot?: string;
  /** `on_chat_model_stream` 打开流时使用的 assembler，默认是 `markdown`。 */
  streamAssembler?: string;
  /** 是否在 root run 启动时立刻打开一个内容流占位。 */
  openStreamOnRunStarted?: boolean;
  /** 是否把原始事件额外记录到 runtime intents 里，方便调试。 */
  recordEvents?: boolean;
  /** 自定义 run 内容流 id 生成规则。 */
  streamId?: string | LangChainStreamIdResolver;
  /** 自定义 run 内容 block id 生成规则。 */
  blockId?: string | LangChainBlockIdResolver;
  /** 自定义消息分组 id，默认按 `turn:${runId}` 分组。 */
  groupId?: string | LangChainGroupIdResolver;
  /** 自定义 run 标题解析规则。 */
  defaultRunTitle?: string | LangChainRunTitleResolver;
  /** 把某个工具映射到哪个 renderer，例如 `tool.weather`。 */
  toolRenderer?: LangChainToolRendererResolver;
}

/**
 * LangChain preset 的扩展配置。
 */
export interface LangChainPresetOptions<
  TSource = AsyncIterable<LangChainEvent> | Iterable<LangChainEvent>
> extends Omit<AgentdownPresetOptions<LangChainEvent, TSource>, 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个 protocol。 */
  protocol?: RuntimeProtocol<LangChainEvent>;
  /** 传给 `createLangChainProtocol()` 的配置。 */
  protocolOptions?: LangChainProtocolOptions;
  /** 增加或覆写 preset 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
}

/**
 * LangChain adapter 在运行时维护的一条待完成工具调用。
 */
export interface LangChainPendingTool {
  /** runtime 内部稳定工具 id。 */
  id: string;
  /** 后端返回的原始工具 id。 */
  rawId: string | undefined;
  /** 工具名称。 */
  name: string | undefined;
}

/**
 * LangChain adapter 在运行时维护的一次根 run 会话状态。
 */
export interface LangChainRunSession {
  /** 当前根 run 的稳定 id。 */
  runId: string;
  /** assistant 内容流的基础 id，不带分段后缀。 */
  streamBaseId: string;
  /** assistant 内容 block 的基础 id，不带分段后缀。 */
  blockBaseId: string;
  /** 当前激活中的内容流 id。 */
  streamId: string;
  /** 当前激活中的内容 block id。 */
  blockId: string;
  /** 当前已经切到了第几段文本。 */
  streamSegmentIndex: number;
  /** 当前分段里是否已经收到过真正的文本。 */
  segmentHasContent: boolean;
  /** 当前 run 在 surface 里的消息分组 id。 */
  groupId: string | null | undefined;
  /** 当前 run 的显示标题。 */
  title: string | undefined;
  /** 当前分段的内容流是否已经打开。 */
  streamOpen: boolean;
  /** 等待 `on_tool_end` 对上的工具队列。 */
  pendingTools: LangChainPendingTool[];
  /** 已经发出过 `tool.start` 的工具集合，避免重复开始。 */
  startedToolIds: Set<string>;
  /** 当官方事件没给工具 id 时，本地生成一个兜底序号。 */
  fallbackToolCount: number;
}

/**
 * LangChain protocol 在一次运行中维护的全局会话状态。
 */
export interface LangChainSessionState {
  /** 当前所有活跃根 run 的状态映射。 */
  sessions: Map<string, LangChainRunSession>;
  /** 已经发出过 `run.start` 的 run 集合。 */
  startedRuns: Set<string>;
}
