import type { AgentdownPresetOptions } from '../../runtime/definePreset';
import type {
  ProtocolContext,
  RuntimeData,
  RuntimeProtocol,
  StreamAssembler
} from '../../runtime/types';

/**
 * Agno tool 事件里常见的工具载荷结构。
 */
export interface AgnoToolPayload extends RuntimeData {
  /** 工具调用 id。 */
  id?: string;
  /** 某些实现直接把工具名放在 `name`。 */
  name?: string;
  /** Agno 常见的工具名字段。 */
  tool_name?: string;
  /** 某些事件里工具调用 id 会放在 `tool_call_id`。 */
  tool_call_id?: string;
  /** Agno 常见的工具输入字段。 */
  tool_args?: unknown;
  /** 兼容其他实现使用的 `arguments`。 */
  arguments?: unknown;
  /** 兼容其他实现使用的 `args`。 */
  args?: unknown;
  /** 兼容其他实现直接使用的 `input`。 */
  input?: unknown;
  /** Agno 常见的工具结果字段。 */
  result?: unknown;
  /** 兼容其他实现使用的 `output`。 */
  output?: unknown;
  /** 兼容把结果放在 `content` 的情况。 */
  content?: unknown;
}

/**
 * Agno SSE 事件的最小公共结构。
 */
export interface AgnoEvent extends RuntimeData {
  /** 官方事件名，例如 `RunStarted`、`RunContent`、`ToolCallCompleted`。 */
  event: string;
  /** Agno 常见的 run id 字段。 */
  run_id?: string;
  /** 兼容 camelCase 写法。 */
  runId?: string;
  /** 某些服务端可能把会话 id 当作 run id 使用。 */
  session_id?: string;
  /** 兼容 camelCase 写法。 */
  sessionId?: string;
  /** 通用名称字段，可能表示 agent 名或事件名。 */
  name?: string;
  /** Agno agent 名字段。 */
  agent_name?: string;
  /** 增量文本内容。 */
  content?: string;
  /** 兼容使用 `delta` 的流式文本字段。 */
  delta?: string;
  /** 兼容使用 `text` 的流式文本字段。 */
  text?: string;
  /** 通用消息字段。 */
  message?: string;
  /** 通用原因字段。 */
  reason?: string;
  /** 错误对象或错误字符串。 */
  error?: unknown;
  /** agent 信息，可能是字符串，也可能是对象。 */
  agent?: string | RuntimeData;
  /** 工具调用载荷。 */
  tool?: AgnoToolPayload;
  /** 某些事件会把结果挂在根级别。 */
  result?: unknown;
}

/**
 * 解析 tool renderer 时可用的上下文信息。
 */
export interface AgnoToolRendererContext {
  /** 当前 run id。 */
  runId: string;
  /** 当前工具节点 id。 */
  toolId: string;
  /** 当前工具原始 payload。 */
  tool: AgnoToolPayload | undefined;
  /** 当前处理的原始事件。 */
  packet: AgnoEvent;
  /** protocol 执行上下文。 */
  context: ProtocolContext;
}

/**
 * Agno tool renderer 的可配置解析方式。
 */
export type AgnoToolRendererResolver =
  | string
  | ((input: AgnoToolRendererContext) => string | undefined);

/**
 * 生成 streamId 时的自定义回调签名。
 */
export type AgnoStreamIdResolver = (
  runId: string,
  packet: AgnoEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 blockId 时的自定义回调签名。
 */
export type AgnoBlockIdResolver = (
  runId: string,
  packet: AgnoEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 groupId 时的自定义回调签名。
 */
export type AgnoGroupIdResolver = (
  runId: string,
  packet: AgnoEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 run 标题时的自定义回调签名。
 */
export type AgnoRunTitleResolver = (
  packet: AgnoEvent,
  runId: string,
  context: ProtocolContext
) => string | undefined;

/**
 * Agno protocol 的可选行为配置。
 */
export interface AgnoProtocolOptions {
  /** 生成 block 时使用的 slot，默认是 `main`。 */
  slot?: string;
  /** `run_content` 打开流时使用的 assembler，默认是 `markdown`。 */
  streamAssembler?: string;
  /** 是否在 `run_started` 时立刻打开一个内容流占位。 */
  openStreamOnRunStarted?: boolean;
  /** 是否把原始事件额外记录到 runtime intents 里，方便调试。 */
  recordEvents?: boolean;
  /** 自定义 run 内容流 id 生成规则。 */
  streamId?: string | AgnoStreamIdResolver;
  /** 自定义 run 内容 block id 生成规则。 */
  blockId?: string | AgnoBlockIdResolver;
  /** 自定义消息分组 id，默认按 `turn:${runId}` 分组。 */
  groupId?: string | AgnoGroupIdResolver;
  /** 自定义 run 标题解析规则。 */
  defaultRunTitle?: string | AgnoRunTitleResolver;
  /** 把某个工具映射到哪个 renderer，例如 `tool.weather`。 */
  toolRenderer?: AgnoToolRendererResolver;
}

/**
 * Agno preset 的扩展配置。
 */
export interface AgnoPresetOptions<
  TSource = AsyncIterable<AgnoEvent> | Iterable<AgnoEvent>
> extends Omit<AgentdownPresetOptions<AgnoEvent, TSource>, 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个 protocol。 */
  protocol?: RuntimeProtocol<AgnoEvent>;
  /** 传给 `createAgnoProtocol()` 的配置。 */
  protocolOptions?: AgnoProtocolOptions;
  /** 增加或覆写 preset 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
}

/**
 * Agno adapter 在运行时维护的一条待完成工具调用。
 */
export interface AgnoPendingTool {
  /** runtime 内部稳定工具 id。 */
  id: string;
  /** 后端返回的原始工具 id。 */
  rawId: string | undefined;
  /** 工具名称。 */
  name: string | undefined;
}

/**
 * Agno adapter 在运行时维护的一次 run 会话状态。
 */
export interface AgnoRunSession {
  /** 当前 run 的稳定 id。 */
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
  /** 等待 `tool_call_completed` 对上的工具队列。 */
  pendingTools: AgnoPendingTool[];
  /** 已经发出过 `tool.start` 的工具集合，避免重复开始。 */
  startedToolIds: Set<string>;
  /** 当官方事件没给 tool id 时，本地生成一个兜底序号。 */
  fallbackToolCount: number;
}

/**
 * Agno protocol 在一次运行中维护的全局会话状态。
 */
export interface AgnoSessionState {
  /** 当前所有活跃 run 的状态映射。 */
  sessions: Map<string, AgnoRunSession>;
  /** 已经发出过 `run.start` 的 run 集合。 */
  startedRuns: Set<string>;
}
