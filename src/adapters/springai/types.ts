import type { EventComponentRegistryResult } from '../eventComponentRegistry';
import type { ToolNameRegistryResult } from '../toolNameRegistry';
import type { AgentdownAdapterOptions } from '../../runtime/defineAdapter';
import type { AgentdownPresetOptions } from '../../runtime/definePreset';
import type {
  ProtocolContext,
  RuntimeData,
  RuntimeProtocol,
  StreamAssembler
} from '../../runtime/types';

/**
 * Spring AI 事件上的公共 metadata 结构。
 */
export interface SpringAiEventMetadata extends RuntimeData {
  /** 当前框架名称，后端默认会写成 `springai`。 */
  framework?: string;
  /** 当前后端 session id。 */
  session_id?: string;
  /** 当前会话 id；默认与 `session_id` 相同。 */
  conversation_id?: string;
  /** 当前 agent run id。 */
  run_id?: string;
  /** 当前一问一答这一轮的 turn id。 */
  turn_id?: string;
  /** 当前消息分组 id。 */
  group_id?: string;
  /** 当前 assistant message id。 */
  message_id?: string;
  /** 事件生成时间。 */
  timestamp?: string;
}

/**
 * Spring AI 工具事件里常见的工具载荷结构。
 */
export interface SpringAiToolPayload extends RuntimeData {
  /** 后端稳定工具调用 id。 */
  tool_call_id?: string;
  /** 工具名称。 */
  tool_name?: string;
  /** 兼容某些自定义字段名。 */
  name?: string;
  /** 工具输入参数。 */
  tool_args?: Record<string, unknown>;
  /** 兼容某些自定义字段名。 */
  args?: Record<string, unknown>;
  /** 工具执行结果。 */
  result?: unknown;
  /** 工具执行失败时的错误说明。 */
  message?: string;
}

/**
 * Spring AI 一条等待人工确认的 action request。
 */
export interface SpringAiApprovalActionRequest extends RuntimeData {
  /** 当前审批项 requirement id。 */
  requirement_id?: string;
  /** 对应的 tool call id。 */
  tool_call_id?: string;
  /** 工具名称。 */
  name?: string;
  /** 工具参数。 */
  args?: Record<string, unknown>;
  /** 当前允许的人工决策列表。 */
  allowed_decisions?: string[];
}

/**
 * Spring AI `approval.required` 事件的业务数据区。
 */
export interface SpringAiApprovalPayload extends RuntimeData {
  /** 当前这批审批项的 interrupt id。 */
  interrupt_id?: string;
  /** 当前 assistant 在暂停前已经输出的文本。 */
  assistant_text?: string;
  /** 当前批次里等待确认的工具调用列表。 */
  action_requests?: SpringAiApprovalActionRequest[];
  /** 哪些决策必须附带 reason。 */
  reason_required_decisions?: string[];
}

/**
 * Spring AI HITL `edit` 决策里携带的修改后工具调用。
 */
export interface SpringAiEditedAction extends RuntimeData {
  /** 修改后的工具名称。 */
  name: string;
  /** 修改后的工具参数。 */
  args: Record<string, unknown>;
}

/**
 * 前端继续一个 Spring AI HITL interrupt 时提交的单条人工决策。
 */
export interface SpringAiHumanDecision extends RuntimeData {
  /** 当前决策类型。 */
  type: 'approve' | 'edit' | 'reject';
  /** `edit` / `reject` 时附带给后续推理的人工说明。 */
  message?: string;
  /** `edit` 时提交的修改后工具调用。 */
  edited_action?: SpringAiEditedAction;
}

/**
 * Spring AI SSE 事件的最小公共结构。
 */
export interface SpringAiEvent extends RuntimeData {
  /** 当前事件名，例如 `response.delta`、`approval.required`。 */
  event: string;
  /** 当前事件的 metadata。 */
  metadata?: SpringAiEventMetadata;
  /** 当前事件的业务数据区。 */
  data?: RuntimeData;
  /** 某些异常场景会直接带 message。 */
  message?: string;
  /** 某些异常场景会直接带 reason。 */
  reason?: string;
  /** 错误对象或错误字符串。 */
  error?: unknown;
}

/**
 * 解析 Spring AI 工具 renderer 时可用的上下文信息。
 */
export interface SpringAiToolRendererContext {
  /** 当前 run id。 */
  runId: string;
  /** 当前工具节点 id。 */
  toolId: string;
  /** 当前工具原始 payload。 */
  tool: SpringAiToolPayload | undefined;
  /** 当前处理的 Spring AI 原始事件。 */
  packet: SpringAiEvent;
  /** protocol 执行上下文。 */
  context: ProtocolContext;
}

/**
 * Spring AI tool renderer 的可配置解析方式。
 */
export type SpringAiToolRendererResolver =
  | string
  | ((input: SpringAiToolRendererContext) => string | undefined);

/**
 * 生成 streamId 时的自定义回调签名。
 */
export type SpringAiStreamIdResolver = (
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 blockId 时的自定义回调签名。
 */
export type SpringAiBlockIdResolver = (
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext
) => string;

/**
 * 生成 groupId 时的自定义回调签名。
 */
export type SpringAiGroupIdResolver = (
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 conversationId 时的自定义回调签名。
 */
export type SpringAiConversationIdResolver = (
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 turnId 时的自定义回调签名。
 */
export type SpringAiTurnIdResolver = (
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 assistant messageId 时的自定义回调签名。
 */
export type SpringAiMessageIdResolver = (
  runId: string,
  packet: SpringAiEvent,
  context: ProtocolContext
) => string | null | undefined;

/**
 * 生成 run 标题时的自定义回调签名。
 */
export type SpringAiRunTitleResolver = (
  packet: SpringAiEvent,
  runId: string,
  context: ProtocolContext
) => string | undefined;

/**
 * Spring AI protocol 的可选行为配置。
 */
export interface SpringAiProtocolOptions {
  /** 生成 block 时使用的 slot，默认是 `main`。 */
  slot?: string;
  /** 流式内容默认使用的 assembler，默认是 `markdown`。 */
  streamAssembler?: string;
  /** `response.started` 时是否立刻打开一个内容流占位。 */
  openStreamOnResponseStarted?: boolean;
  /** 是否把原始事件额外记录到 runtime intents 里。 */
  recordEvents?: boolean;
  /** 自定义 run 内容流 id 生成规则。 */
  streamId?: string | SpringAiStreamIdResolver;
  /** 自定义 run 内容 block id 生成规则。 */
  blockId?: string | SpringAiBlockIdResolver;
  /** 自定义消息分组 id。 */
  groupId?: string | SpringAiGroupIdResolver;
  /** 自定义 conversationId。 */
  conversationId?: string | SpringAiConversationIdResolver;
  /** 自定义 turnId。 */
  turnId?: string | SpringAiTurnIdResolver;
  /** 自定义 assistant messageId。 */
  messageId?: string | SpringAiMessageIdResolver;
  /** 自定义 run 标题解析规则。 */
  defaultRunTitle?: string | SpringAiRunTitleResolver;
  /** 把某个工具映射到哪个 renderer。 */
  toolRenderer?: SpringAiToolRendererResolver;
}

/**
 * Spring AI preset 的扩展配置。
 */
export interface SpringAiPresetOptions<
  TSource = AsyncIterable<SpringAiEvent> | Iterable<SpringAiEvent>
> extends Omit<AgentdownPresetOptions<SpringAiEvent, TSource>, 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个 protocol。 */
  protocol?: RuntimeProtocol<SpringAiEvent>;
  /** 传给 `createSpringAiProtocol()` 的配置。 */
  protocolOptions?: SpringAiProtocolOptions;
  /** 增加或覆写 preset 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
}

/**
 * Spring AI 官方 starter adapter 的配置项。
 */
export interface SpringAiAdapterOptions<
  TSource = AsyncIterable<SpringAiEvent> | Iterable<SpringAiEvent>
> extends Omit<AgentdownAdapterOptions<SpringAiEvent, TSource>, 'name' | 'protocol' | 'assemblers'> {
  /** 允许直接覆写整个主协议。 */
  protocol?: RuntimeProtocol<SpringAiEvent>;
  /** 传给 `createSpringAiProtocol()` 的配置。 */
  protocolOptions?: SpringAiProtocolOptions;
  /** 增加或覆写 adapter 可用的 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
  /** 顶层 run 标题简写，会回填到 `protocolOptions.defaultRunTitle`。 */
  title?: string | SpringAiRunTitleResolver;
  /** 基于工具名自动选择 renderer 的 helper 产物。 */
  tools?: ToolNameRegistryResult<SpringAiToolRendererContext>;
  /** 基于事件名直接渲染组件的 helper 产物。 */
  events?: EventComponentRegistryResult<SpringAiEvent>;
}

/**
 * Spring AI adapter 在运行时维护的一条待完成工具调用。
 */
export interface SpringAiPendingTool {
  /** runtime 内部稳定工具 id。 */
  id: string;
  /** 后端返回的原始工具 id。 */
  rawId: string | undefined;
  /** 工具名称。 */
  name: string | undefined;
}

/**
 * Spring AI adapter 在运行时维护的一次 run 会话状态。
 */
export interface SpringAiRunSession {
  /** 当前 run 的稳定 id。 */
  runId: string;
  /** assistant 内容流的基础 id。 */
  streamBaseId: string;
  /** assistant 内容 block 的基础 id。 */
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
  /** 当前 message 已经累计到的文本内容。 */
  currentMessageText: string;
  /** 等待后续完成事件对上的工具队列。 */
  pendingTools: SpringAiPendingTool[];
  /** 已经发出过 `tool.start` 的工具集合。 */
  startedToolIds: Set<string>;
  /** 当后端没给工具 id 时，本地生成一个兜底序号。 */
  fallbackToolCount: number;
}

/**
 * Spring AI protocol 在一次运行中维护的全局会话状态。
 */
export interface SpringAiSessionState {
  /** 当前所有活跃 run 的状态映射。 */
  sessions: Map<string, SpringAiRunSession>;
  /** 已经发出过 `run.start` 的 run 集合。 */
  startedRuns: Set<string>;
}
