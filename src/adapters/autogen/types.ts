import type { AgentdownPresetOptions } from '../../runtime/definePreset';
import type {
  ProtocolContext,
  RuntimeData,
  RuntimeProtocol,
  StreamAssembler
} from '../../runtime/types';

/**
 * AutoGen 工具调用请求条目的最小结构。
 */
export interface AutoGenToolCall extends RuntimeData {
  /** 工具调用 id。 */
  id?: string;
  /** 工具名。 */
  name?: string;
  /** JSON 字符串形式的参数。 */
  arguments?: string;
}

/**
 * AutoGen 工具执行结果条目的最小结构。
 */
export interface AutoGenToolResult extends RuntimeData {
  /** 工具输出文本，常见为 Python repr 字符串。 */
  content?: unknown;
  /** 工具名。 */
  name?: string;
  /** 工具调用 id。 */
  call_id?: string;
  /** 是否执行失败。 */
  is_error?: boolean;
}

/**
 * AutoGen 适配层统一后的工具载荷结构。
 */
export interface AutoGenToolPayload extends RuntimeData {
  /** runtime 内部或原始工具 id。 */
  id?: string;
  /** 工具名。 */
  name?: string;
  /** AutoGen 原始 call id。 */
  call_id?: string;
  /** 已解析后的工具输入。 */
  input?: unknown;
  /** 已解析后的工具结果。 */
  result?: unknown;
  /** 原始工具结果文本。 */
  content?: unknown;
  /** 是否执行失败。 */
  is_error?: boolean;
}

/**
 * AutoGen SSE 事件的最小公共结构。
 */
export interface AutoGenEvent extends RuntimeData {
  /** 官方事件类型，例如 `ModelClientStreamingChunkEvent`。 */
  type: string;
  /** 当前消息或事件 id。 */
  id?: string;
  /** 事件来源，常见为 `user` / `assistant`。 */
  source?: string;
  /** 原始 metadata。 */
  metadata?: RuntimeData;
  /** 模型用量。 */
  models_usage?: RuntimeData | null;
  /** 事件时间。 */
  created_at?: string;
  /** 文本、数组或其他复杂结构。 */
  content?: unknown;
  /** 流式 token 所属的完整消息 id。 */
  full_message_id?: string;
  /** ToolCallSummaryMessage 上的工具调用数组。 */
  tool_calls?: AutoGenToolCall[];
  /** ToolCallSummaryMessage 上的工具结果数组。 */
  results?: AutoGenToolResult[];
  /** TaskResult 上的完整消息列表。 */
  messages?: AutoGenEvent[];
  /** 结束原因。 */
  stop_reason?: unknown;
  /** 错误消息。 */
  message?: string;
  /** 错误原因。 */
  reason?: string;
  /** 错误对象。 */
  error?: unknown;
}

/**
 * 解析 tool renderer 时可用的上下文信息。
 */
export interface AutoGenToolRendererContext {
  /** 当前根 run id。 */
  runId: string;
  /** 当前工具节点 id。 */
  toolId: string;
  /** 当前工具原始 payload。 */
  tool: AutoGenToolPayload | undefined;
  /** 当前处理的原始事件。 */
  packet: AutoGenEvent;
  /** protocol 执行上下文。 */
  context: ProtocolContext;
}

/**
 * AutoGen tool renderer 的可配置解析方式。
 */
export type AutoGenToolRendererResolver =
  | string
  | ((input: AutoGenToolRendererContext) => string | undefined);

/**
 * 生成 streamId 时的自定义回调签名。
 */
export type AutoGenStreamIdResolver = (
  runId: string,
  packet: AutoGenEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 blockId 时的自定义回调签名。
 */
export type AutoGenBlockIdResolver = (
  runId: string,
  packet: AutoGenEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 groupId 时的自定义回调签名。
 */
export type AutoGenGroupIdResolver = (
  runId: string,
  packet: AutoGenEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 run 标题时的自定义回调签名。
 */
export type AutoGenRunTitleResolver = (
  packet: AutoGenEvent,
  runId: string,
  context: ProtocolContext
) => string | undefined;

/**
 * AutoGen protocol 的可选行为配置。
 */
export interface AutoGenProtocolOptions {
  /** 生成 block 时使用的 slot，默认是 `main`。 */
  slot?: string;
  /** assistant 文本流打开时使用的 assembler，默认是 `markdown`。 */
  streamAssembler?: string;
  /** 是否在 run 启动时立刻打开一个内容流占位。 */
  openStreamOnRunStarted?: boolean;
  /** 是否把原始事件额外记录到 runtime intents 里，方便调试。 */
  recordEvents?: boolean;
  /** 自定义 run 内容流 id 生成规则。 */
  streamId?: string | AutoGenStreamIdResolver;
  /** 自定义 run 内容 block id 生成规则。 */
  blockId?: string | AutoGenBlockIdResolver;
  /** 自定义消息分组 id，默认按 `turn:${runId}` 分组。 */
  groupId?: string | AutoGenGroupIdResolver;
  /** 自定义 run 标题解析规则。 */
  defaultRunTitle?: string | AutoGenRunTitleResolver;
  /** 把某个工具映射到哪个 renderer，例如 `tool.weather`。 */
  toolRenderer?: AutoGenToolRendererResolver;
}

/**
 * AutoGen preset 的扩展配置。
 */
export interface AutoGenPresetOptions<
  TSource = AsyncIterable<AutoGenEvent> | Iterable<AutoGenEvent>
> extends Omit<AgentdownPresetOptions<AutoGenEvent, TSource>, 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个 protocol。 */
  protocol?: RuntimeProtocol<AutoGenEvent>;
  /** 传给 `createAutoGenProtocol()` 的配置。 */
  protocolOptions?: AutoGenProtocolOptions;
  /** 增加或覆写 preset 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
}

/**
 * AutoGen adapter 在运行时维护的一条待完成工具调用。
 */
export interface AutoGenPendingTool {
  /** runtime 内部稳定工具 id。 */
  id: string;
  /** 后端返回的原始工具 id。 */
  rawId: string | undefined;
  /** 工具名称。 */
  name: string | undefined;
}

/**
 * AutoGen adapter 在运行时维护的一次根 run 会话状态。
 */
export interface AutoGenRunSession {
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
  /** 当前正在流式输出的 assistant message id。 */
  activeAssistantMessageId: string | undefined;
  /** 已完成去重的 assistant message id 集合。 */
  finalizedAssistantMessageIds: Set<string>;
  /** 等待工具结果对上的工具队列。 */
  pendingTools: AutoGenPendingTool[];
  /** 已经发出过 `tool.start` 的工具集合，避免重复开始。 */
  startedToolIds: Set<string>;
  /** 已经结束过的工具集合，避免 summary 再次覆盖。 */
  finishedToolIds: Set<string>;
  /** 当官方事件没给工具 id 时，本地生成一个兜底序号。 */
  fallbackToolCount: number;
}

/**
 * AutoGen protocol 在一次运行中维护的全局会话状态。
 */
export interface AutoGenSessionState {
  /** 当前所有活跃 run 的状态映射。 */
  sessions: Map<string, AutoGenRunSession>;
  /** 已经发出过 `run.start` 的 run 集合。 */
  startedRuns: Set<string>;
}
