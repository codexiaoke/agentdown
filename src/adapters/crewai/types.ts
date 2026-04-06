import type { AgentdownPresetOptions } from '../../runtime/definePreset';
import type {
  ProtocolContext,
  RuntimeData,
  RuntimeProtocol,
  StreamAssembler
} from '../../runtime/types';

/**
 * CrewAI 流式 chunk 上的类型描述。
 */
export interface CrewAIChunkType extends RuntimeData {
  /** 枚举的真实值，例如 `text` 或 `tool_call`。 */
  _value_?: string;
  /** 枚举成员名，例如 `TEXT` 或 `TOOL_CALL`。 */
  _name_?: string;
}

/**
 * CrewAI 流式工具调用 chunk 里的原始 `tool_call` 描述。
 */
export interface CrewAIStreamingToolCall extends RuntimeData {
  /** CrewAI / OpenAI 风格的工具调用 id。 */
  tool_id?: string;
  /** 工具名称。 */
  tool_name?: string;
  /** 当前已累计的 arguments 字符串。 */
  arguments?: string;
  /** 并行 tool call 时的顺序索引。 */
  index?: number;
}

/**
 * CrewAI 最终 `messages[].tool_calls[].function` 的结构。
 */
export interface CrewAIMessageToolFunction extends RuntimeData {
  /** 函数名。 */
  name?: string;
  /** JSON 字符串形式的函数参数。 */
  arguments?: string;
}

/**
 * CrewAI 最终输出里的 assistant tool call 消息结构。
 */
export interface CrewAIMessageToolCall extends RuntimeData {
  /** 工具调用 id。 */
  id?: string;
  /** 官方类型，通常是 `function`。 */
  type?: string;
  /** 函数定义与参数。 */
  function?: CrewAIMessageToolFunction;
}

/**
 * CrewAI 最终 `tasks_output[].messages[]` 的最小公共结构。
 */
export interface CrewAIMessage extends RuntimeData {
  /** 消息角色，例如 `assistant` / `tool` / `user`。 */
  role?: string;
  /** 文本内容。 */
  content?: unknown;
  /** tool message 上的工具名。 */
  name?: string;
  /** tool message 对应的 tool call id。 */
  tool_call_id?: string;
  /** assistant message 里的工具调用列表。 */
  tool_calls?: CrewAIMessageToolCall[];
}

/**
 * CrewAI `CrewOutput.tasks_output[]` 的最小公共结构。
 */
export interface CrewAITaskOutput extends RuntimeData {
  /** 该 task 对应的 agent 名称。 */
  agent?: string;
  /** task 的最终 raw 文本。 */
  raw?: string;
  /** OpenAI 风格消息历史。 */
  messages?: CrewAIMessage[];
}

/**
 * CrewAI 前端适配层消费的原始事件结构。
 *
 * 说明：
 * - 普通流式 chunk 基本只有 `content` / `chunk_type` / `tool_call`
 * - 结束时会收到一个显式 `CrewOutput`
 * - 错误场景一般是 `type: "ErrorEvent"`
 */
export interface CrewAIEvent extends RuntimeData {
  /** SSE `event:` 字段，例如 `CrewOutput`。 */
  event?: string;
  /** 后端对象本身的类型字段，例如 `CrewOutput` / `ErrorEvent`。 */
  type?: string;
  /** 流式文本 chunk 或兜底字符串内容。 */
  content?: unknown;
  /** 流式 chunk 类型。 */
  chunk_type?: CrewAIChunkType | string;
  /** 流式 tool call 片段。 */
  tool_call?: CrewAIStreamingToolCall | null;
  /** 当前流式 chunk 所属 agent 角色。 */
  agent_role?: string;
  /** 当前流式 chunk 所属 agent id。 */
  agent_id?: string;
  /** 当前 task 索引。 */
  task_index?: number;
  /** 当前 task 名。 */
  task_name?: string;
  /** 当前 task id。 */
  task_id?: string;
  /** `CrewOutput.raw` 最终文本。 */
  raw?: string;
  /** `CrewOutput.tasks_output`。 */
  tasks_output?: CrewAITaskOutput[];
  /** 错误消息。 */
  message?: string;
  /** 错误原因。 */
  reason?: string;
  /** 原始错误对象。 */
  error?: unknown;
}

/**
 * CrewAI adapter 内部统一后的工具载荷结构。
 */
export interface CrewAIToolPayload extends RuntimeData {
  /** 工具调用 id。 */
  id?: string;
  /** 工具名称。 */
  name?: string;
  /** 原始 arguments 字符串。 */
  argumentsText?: string;
  /** 已结构化的工具输入。 */
  input?: unknown;
  /** 已结构化的工具结果。 */
  result?: unknown;
  /** 原始工具结果内容。 */
  content?: unknown;
  /** tool message 上的原始 `tool_call_id`。 */
  tool_call_id?: string;
  /** 并行调用顺序。 */
  index?: number;
  /** 是否是错误工具结果。 */
  is_error?: boolean;
}

/**
 * 解析 tool renderer 时可用的上下文信息。
 */
export interface CrewAIToolRendererContext {
  /** 当前根 run id。 */
  runId: string;
  /** 当前工具节点 id。 */
  toolId: string;
  /** 当前工具原始 payload。 */
  tool: CrewAIToolPayload | undefined;
  /** 当前处理的 CrewAI 原始事件。 */
  packet: CrewAIEvent;
  /** protocol 执行上下文。 */
  context: ProtocolContext;
}

/**
 * CrewAI tool renderer 的可配置解析方式。
 */
export type CrewAIToolRendererResolver =
  | string
  | ((input: CrewAIToolRendererContext) => string | undefined);

/**
 * 生成 streamId 时的自定义回调签名。
 */
export type CrewAIStreamIdResolver = (
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 blockId 时的自定义回调签名。
 */
export type CrewAIBlockIdResolver = (
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 groupId 时的自定义回调签名。
 */
export type CrewAIGroupIdResolver = (
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 conversationId 时的自定义回调签名。
 */
export type CrewAIConversationIdResolver = (
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 turnId 时的自定义回调签名。
 */
export type CrewAITurnIdResolver = (
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 assistant messageId 时的自定义回调签名。
 */
export type CrewAIMessageIdResolver = (
  runId: string,
  packet: CrewAIEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 run 标题时的自定义回调签名。
 */
export type CrewAIRunTitleResolver = (
  packet: CrewAIEvent,
  runId: string,
  context: ProtocolContext
) => string | undefined;

/**
 * CrewAI protocol 的可选行为配置。
 */
export interface CrewAIProtocolOptions {
  /** 生成 block 时使用的 slot，默认是 `main`。 */
  slot?: string;
  /** assistant 内容流使用的 assembler，默认是 `markdown`。 */
  streamAssembler?: string;
  /** 是否在 run.start 后立刻打开一个草稿流。 */
  openStreamOnRunStarted?: boolean;
  /** 是否把原始事件额外记录进 runtime history。 */
  recordEvents?: boolean;
  /** 自定义 run 内容流 id 生成规则。 */
  streamId?: string | CrewAIStreamIdResolver;
  /** 自定义 run 内容 block id 生成规则。 */
  blockId?: string | CrewAIBlockIdResolver;
  /** 自定义消息分组 id。 */
  groupId?: string | CrewAIGroupIdResolver;
  /** 自定义 conversationId；CrewAI 默认无法可靠推断，所以默认是 `null`。 */
  conversationId?: string | CrewAIConversationIdResolver;
  /** 自定义 turnId，默认回退到当前 `groupId`。 */
  turnId?: string | CrewAITurnIdResolver;
  /** 自定义 assistant messageId，默认按 `message:${runId}:assistant` 生成。 */
  messageId?: string | CrewAIMessageIdResolver;
  /** 自定义 run 标题解析规则。 */
  defaultRunTitle?: string | CrewAIRunTitleResolver;
  /** 把某个工具映射到哪个 renderer。 */
  toolRenderer?: CrewAIToolRendererResolver;
}

/**
 * CrewAI preset 的扩展配置。
 */
export interface CrewAIPresetOptions<
  TSource = AsyncIterable<CrewAIEvent> | Iterable<CrewAIEvent>
> extends Omit<AgentdownPresetOptions<CrewAIEvent, TSource>, 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个 protocol。 */
  protocol?: RuntimeProtocol<CrewAIEvent>;
  /** 传给 `createCrewAIProtocol()` 的配置。 */
  protocolOptions?: CrewAIProtocolOptions;
  /** 增加或覆写 preset 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
}

/**
 * CrewAI adapter 在运行时维护的一条待完成工具调用。
 */
export interface CrewAIPendingTool {
  /** runtime 内部稳定工具 id。 */
  id: string;
  /** 后端返回的原始工具 id。 */
  rawId: string | undefined;
  /** 工具名称。 */
  name: string | undefined;
  /** 最新一次可用的结构化输入。 */
  input?: unknown;
  /** 最新一次可用的 arguments 原文。 */
  argumentsText?: string;
}

/**
 * CrewAI adapter 在运行时维护的一次 run 会话状态。
 */
export interface CrewAIRunSession {
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
  /** 当前 run 所属的 conversation / session id。 */
  conversationId: string | null | undefined;
  /** 当前 run 所属的 turn id。 */
  turnId: string | null | undefined;
  /** 当前 assistant 消息的稳定 message id。 */
  messageId: string | null | undefined;
  /** 当前 run 的显示标题。 */
  title: string | undefined;
  /** 当前分段的内容流是否已经打开。 */
  streamOpen: boolean;
  /** 当前已累积的分段文本，用于结束时去重。 */
  currentSegmentText: string;
  /** 最近一个已完成分段的文本。 */
  lastCompletedSegmentText: string;
  /** 等待最终结果对上的工具队列。 */
  pendingTools: CrewAIPendingTool[];
  /** 已经发出过 `tool.start` 的工具集合，避免重复开始。 */
  startedToolIds: Set<string>;
  /** 已经发出过 `tool.finish` 的工具集合，避免重复结束。 */
  finishedToolIds: Set<string>;
  /** 当官方事件没给工具 id 时，本地生成一个兜底序号。 */
  fallbackToolCount: number;
}

/**
 * CrewAI protocol 在一次运行中维护的全局会话状态。
 */
export interface CrewAISessionState {
  /** 当前所有活跃 run 的状态映射。 */
  sessions: Map<string, CrewAIRunSession>;
  /** 已经发出过 `run.start` 的 run 集合。 */
  startedRuns: Set<string>;
}
