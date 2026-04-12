import { computed, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { FetchTransportSource } from '../../runtime/transports';
import type { BridgeHooks, RuntimeData, SurfaceBlock } from '../../runtime/types';
import { cmd } from '../../runtime/defineProtocol';
import type { EventActionRegistryResult } from '../../runtime/eventActions';
import type {
  RunSurfaceApprovalActionContext,
  RunSurfaceApprovalActionsOptions,
  RunSurfaceBuiltinApprovalActionKey,
  RunSurfaceOptions
} from '../../surface/types';
import {
  createFrameworkChatIds,
  type FrameworkChatAssistantActionsOptions,
  type FrameworkChatDevtoolsOptions,
  type FrameworkChatInputValue,
  type FrameworkChatIds,
  type FrameworkChatReconnectOptions,
  type FrameworkChatSessionIdOptions,
  type FrameworkChatSessionResult,
  type FrameworkChatUserMessageOptions,
  useFrameworkChatSession
} from '../shared/chatFactory';
import { createSpringAiAdapter } from './adapter';
import {
  createSpringAiSseTransport,
  type SpringAiResumeRequestBody,
  type SpringAiSseTransportOptions
} from './transport';
import type {
  SpringAiAdapterOptions,
  SpringAiEvent,
  SpringAiHumanDecision,
  SpringAiProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface SpringAiChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type SpringAiChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => SpringAiChatIds;

/**
 * Spring AI chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface SpringAiChatSessionIdOptions extends FrameworkChatSessionIdOptions<SpringAiEvent> {}

/**
 * Spring AI chat helper 对用户消息预插入行为的配置。
 */
export interface SpringAiChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * Spring AI chat helper 对自动重连行为的配置。
 */
export interface SpringAiChatReconnectOptions<TSource = FetchTransportSource>
  extends FrameworkChatReconnectOptions<SpringAiEvent, TSource> {}

/**
 * Spring AI chat helper 对 assistant 操作栏的快捷配置。
 */
export interface SpringAiChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * Spring AI chat helper 内置 HITL 动作支持的稳定 key。
 */
export type SpringAiChatHitlActionKey = Extract<
  RunSurfaceBuiltinApprovalActionKey,
  'approve' | 'changes_requested' | 'reject'
>;

/**
 * Spring AI approval 动作对外暴露的可扩展上下文。
 */
export interface SpringAiChatHitlActionContext<TSource = FetchTransportSource>
  extends RunSurfaceApprovalActionContext {
  /** 当前触发的 HITL 动作 key。 */
  actionKey: SpringAiChatHitlActionKey;
  /** 当前 approval block 对应的 interrupt 元数据。 */
  target: SpringAiInterruptTarget;
  /** 当前动作默认会提交给 Spring AI 的单条 human decision。 */
  defaultDecision: SpringAiHumanDecision;
  /** 直接继续 Spring AI approval batch，可完全自定义 resume payload。 */
  resolveInterrupt: (
    input: SpringAiResumeRequestBody,
    source?: TSource
  ) => Promise<void>;
  /**
   * 把一条 decision 提交回默认的 Spring AI batch 收敛流程。
   *
   * - 不传 `decision` 时直接使用 `defaultDecision`
   * - 传入自定义 decision 时，仍然沿用内置的多审批项合并与 resume 逻辑
   */
  submitDecision: (
    decision?: SpringAiHumanDecision,
    source?: TSource
  ) => Promise<void>;
}

/**
 * Spring AI chat helper 对 HITL approval 流程的扩展配置。
 */
export interface SpringAiChatHitlOptions<TSource = FetchTransportSource> {
  /** 覆写默认的 approve / changes_requested / reject 逻辑。 */
  handlers?: Partial<Record<
    SpringAiChatHitlActionKey,
    (context: SpringAiChatHitlActionContext<TSource>) => void | Promise<void>
  >>;
}

/**
 * `useSpringAiChatSession()` 的输入配置。
 */
export interface UseSpringAiChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/springai`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案，或已结构化好的用户消息。 */
  input?: MaybeRefOrGetter<FrameworkChatInputValue | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** Spring AI backend 的运行模式，例如 `hitl`。 */
  mode?: MaybeRefOrGetter<string | undefined>;
  /** Spring AI adapter 的 run 标题简写。 */
  title?: SpringAiAdapterOptions<TSource>['title'];
  /** 传给 `createSpringAiProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<SpringAiProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: SpringAiAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: SpringAiAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 Spring AI SSE transport 的配置。 */
  transport?: Omit<SpringAiSseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: SpringAiChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<SpringAiEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<SpringAiEvent> | undefined;
  /** 是否启用当前聊天会话的内置 devtools。 */
  devtools?: false | FrameworkChatDevtoolsOptions<SpringAiEvent>;
  /** Spring AI approval 这层 HITL 的自定义逻辑。 */
  hitl?: SpringAiChatHitlOptions<TSource>;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | SpringAiChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | SpringAiChatUserMessageOptions;
  /** 当前 chat helper 是否在连接失败后自动重试。 */
  reconnect?: false | SpringAiChatReconnectOptions<TSource>;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | SpringAiChatAssistantActionsOptions;
}

/**
 * `useSpringAiChatSession()` 对外暴露的运行态结果。
 */
export interface UseSpringAiChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<SpringAiEvent, TSource, SpringAiChatIds> {
  /** 手动继续一个已暂停的 Spring AI approval batch。 */
  resolveInterrupt: (
    input: SpringAiResumeRequestBody,
    source?: TSource
  ) => Promise<void>;
}

/**
 * Spring AI approval block 里需要的关键 interrupt 元数据。
 */
interface SpringAiInterruptTarget {
  /** 当前 interrupt batch id。 */
  interruptId: string;
  /** 当前 approval 对应的 requirement id。 */
  requirementId: string;
  /** 当前审批项在 batch 里的索引。 */
  interruptIndex: number;
  /** 当前 batch 一共有多少个审批项。 */
  interruptCount: number;
  /** 当前 tool call id。 */
  toolCallId?: string;
  /** 当前审批项允许的官方决策列表。 */
  allowedDecisions: string[];
  /** 当前哪些决策必须附带 reason。 */
  reasonRequiredDecisions: string[];
  /** 原始工具名称。 */
  toolName?: string;
  /** 原始工具参数。 */
  toolArgs?: Record<string, unknown>;
}

/**
 * 读取一个 transport 可解析配置项的当前值。
 */
async function resolveSpringAiTransportValue<TSource, TValue>(
  source: TSource,
  value: ((source: TSource) => Promise<TValue> | TValue) | TValue | undefined
): Promise<TValue | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    return (value as (source: TSource) => Promise<TValue> | TValue)(source);
  }

  return value;
}

/**
 * 从未知值中读取普通对象。
 */
function readSpringAiRecord(value: unknown): RuntimeData | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as RuntimeData;
}

/**
 * 从未知值中读取非空字符串。
 */
function readSpringAiString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

/**
 * 从未知值中读取数字。
 */
function readSpringAiNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

/**
 * 从未知值中读取字符串数组。
 */
function readSpringAiStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * 从已有 approval block data 中提取需要继续保留的 Spring AI 元数据。
 */
function extractSpringAiApprovalMetadata(block: SurfaceBlock): RuntimeData | undefined {
  const data = readSpringAiRecord(block.data);

  if (!data) {
    return undefined;
  }

  const {
    kind: _kind,
    title: _title,
    approvalId: _approvalId,
    status: _status,
    message: _message,
    refId: _refId,
    ...metadata
  } = data;

  return Object.keys(metadata).length > 0
    ? metadata
    : undefined;
}

/**
 * 从 approval block 上提取继续 Spring AI interrupt 所需的关键元数据。
 */
function resolveSpringAiInterruptTarget(
  block: SurfaceBlock,
  approvalId?: string,
  refId?: string
): SpringAiInterruptTarget | null {
  const data = readSpringAiRecord(block.data);
  const interruptId = readSpringAiString(data?.interruptId)
    ?? readSpringAiString(refId);
  const requirementId = readSpringAiString(data?.requirementId)
    ?? readSpringAiString(approvalId);
  const interruptIndex = readSpringAiNumber(data?.interruptIndex);
  const interruptCount = readSpringAiNumber(data?.interruptCount);

  if (!interruptId || !requirementId || interruptIndex === undefined || interruptCount === undefined) {
    return null;
  }

  const toolCallId = readSpringAiString(data?.toolCallId);
  const toolName = readSpringAiString(data?.toolName);
  const toolArgs = readSpringAiRecord(data?.toolArgs) as Record<string, unknown> | undefined;

  return {
    interruptId,
    requirementId,
    interruptIndex,
    interruptCount,
    allowedDecisions: readSpringAiStringArray(data?.allowedDecisions),
    reasonRequiredDecisions: readSpringAiStringArray(data?.reasonRequiredDecisions),
    ...(toolCallId
      ? {
          toolCallId
        }
      : {}),
    ...(toolName
      ? {
          toolName
        }
      : {}),
    ...(toolArgs
      ? {
          toolArgs
        }
      : {})
  };
}

/**
 * 判断当前审批项是否允许某个 Spring AI 官方决策。
 */
function supportsSpringAiDecision(
  target: SpringAiInterruptTarget,
  decision: 'approve' | 'edit' | 'reject'
): boolean {
  return target.allowedDecisions.includes(decision);
}

/**
 * 判断当前决策是否要求用户填写 reason。
 */
function doesSpringAiDecisionRequireReason(
  target: SpringAiInterruptTarget,
  decision: 'approve' | 'edit' | 'reject'
): boolean {
  return target.reasonRequiredDecisions.includes(decision);
}

/**
 * 把 approval 动作 key 映射成前端本地审批状态。
 */
function resolveSpringAiApprovalStatus(
  actionKey: RunSurfaceBuiltinApprovalActionKey
): 'approved' | 'rejected' | 'changes_requested' {
  if (actionKey === 'approve') {
    return 'approved';
  }

  if (actionKey === 'changes_requested') {
    return 'changes_requested';
  }

  return 'rejected';
}

/**
 * 读取当前 approval block 关联的 tool id。
 */
function resolveSpringAiApprovalToolId(block: SurfaceBlock): string | undefined {
  const data = readSpringAiRecord(block.data);

  return readSpringAiString(data?.toolCallId);
}

/**
 * 读取当前动作点击后要回写到卡片上的提示文案。
 */
function resolveSpringAiApprovalMessage(
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  waitingForOthers: boolean
): string {
  if (actionKey === 'approve') {
    return waitingForOthers
      ? '已批准，等待其他审批项。'
      : '已批准，Spring AI 正在继续执行。';
  }

  if (actionKey === 'changes_requested') {
    return waitingForOthers
      ? '已提交修改意见，等待其他审批项。'
      : '已提交修改意见，Spring AI 正在继续执行。';
  }

  return waitingForOthers
    ? '已拒绝，等待其他审批项。'
    : '已拒绝，Spring AI 正在继续执行。';
}

/**
 * 读取 approval 决策联动到工具卡片后的状态。
 */
function resolveSpringAiToolStatus(
  actionKey: RunSurfaceBuiltinApprovalActionKey
): 'pending' | 'rejected' {
  return actionKey === 'reject'
    ? 'rejected'
    : 'pending';
}

/**
 * 读取当前工具卡片要展示的简短状态说明。
 */
function resolveSpringAiToolMessage(
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  waitingForOthers: boolean
): string {
  if (actionKey === 'approve') {
    return waitingForOthers
      ? '已批准，等待其他审批项。'
      : '已批准，等待执行';
  }

  if (actionKey === 'changes_requested') {
    return waitingForOthers
      ? '已提交修改意见，等待其他审批项。'
      : '已提交修改意见，等待重新执行';
  }

  return waitingForOthers
    ? '已拒绝，等待其他审批项。'
    : '已拒绝执行';
}

/**
 * 乐观更新 approval 对应的工具状态，避免 reject 后卡片仍停在 pending。
 */
function patchSpringAiApprovalToolBlock(
  context: RunSurfaceApprovalActionContext,
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  waitingForOthers: boolean
) {
  const toolId = resolveSpringAiApprovalToolId(context.block);

  if (!toolId) {
    return;
  }

  context.runtime.apply(cmd.tool.update({
    id: toolId,
    ...(context.block.groupId ? { groupId: context.block.groupId } : {}),
    ...(context.block.conversationId ? { conversationId: context.block.conversationId } : {}),
    ...(context.block.turnId ? { turnId: context.block.turnId } : {}),
    ...(context.block.messageId ? { messageId: context.block.messageId } : {}),
    status: resolveSpringAiToolStatus(actionKey),
    message: resolveSpringAiToolMessage(actionKey, waitingForOthers),
    at: Date.now()
  }));
}

/**
 * 读取当前动作的 reason 输入模式。
 */
function resolveSpringAiReasonMode(
  actionKey: SpringAiChatHitlActionKey,
  context: RunSurfaceApprovalActionContext
): 'hidden' | 'required' | 'optional' {
  const target = resolveSpringAiInterruptTarget(context.block, context.approvalId, context.refId);

  if (!target || actionKey === 'approve') {
    return 'hidden';
  }

  const decisionType = actionKey === 'changes_requested'
    ? 'edit'
    : 'reject';

  return doesSpringAiDecisionRequireReason(target, decisionType)
    ? 'required'
    : 'optional';
}

/**
 * 把 approval 动作转换成真正发给 Spring AI 的人工决策。
 */
function resolveSpringAiHumanDecision(
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  context: RunSurfaceApprovalActionContext,
  target: SpringAiInterruptTarget
): SpringAiHumanDecision | null {
  if (actionKey === 'approve') {
    if (!supportsSpringAiDecision(target, 'approve')) {
      return null;
    }

    return {
      type: 'approve'
    };
  }

  if (actionKey === 'changes_requested') {
    if (!supportsSpringAiDecision(target, 'edit')) {
      return null;
    }

    return {
      type: 'edit',
      message: context.reason?.trim() || '请根据人工意见调整这次工具调用。',
      edited_action: {
        name: target.toolName ?? 'tool',
        args: {
          ...(target.toolArgs ?? {})
        }
      }
    };
  }

  if (actionKey === 'reject') {
    if (!supportsSpringAiDecision(target, 'reject')) {
      return null;
    }

    return {
      type: 'reject',
      message: context.reason?.trim() || '人工确认拒绝执行这次工具调用。'
    };
  }

  return null;
}

/**
 * 把一条 Spring AI human decision 重新映射回前端本地的 approval 状态语义。
 */
function resolveSpringAiDecisionActionKey(
  decision: SpringAiHumanDecision
): SpringAiChatHitlActionKey {
  if (decision.type === 'approve') {
    return 'approve';
  }

  if (decision.type === 'edit') {
    return 'changes_requested';
  }

  return 'reject';
}

/**
 * 先在 runtime 里乐观更新 approval block，让用户立刻看到当前决策已记录。
 */
function patchSpringAiApprovalBlock(
  context: RunSurfaceApprovalActionContext,
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  message: string
) {
  const status = resolveSpringAiApprovalStatus(actionKey);
  const metadata = extractSpringAiApprovalMetadata(context.block);

  context.runtime.apply(cmd.approval.update({
    id: context.block.id,
    role: context.role,
    title: context.title,
    message,
    ...(context.approvalId ? { approvalId: context.approvalId } : {}),
    ...(context.refId ? { refId: context.refId } : {}),
    ...(context.block.groupId ? { groupId: context.block.groupId } : {}),
    ...(context.block.conversationId ? { conversationId: context.block.conversationId } : {}),
    ...(context.block.turnId ? { turnId: context.block.turnId } : {}),
    ...(context.block.messageId ? { messageId: context.block.messageId } : {}),
    status,
    ...(metadata ? { data: metadata } : {}),
    at: Date.now()
  }));
}

/**
 * 判断当前 block 是否应该显示“批准”动作。
 */
function canApproveSpringAiBlock(context: RunSurfaceApprovalActionContext): boolean {
  const target = resolveSpringAiInterruptTarget(context.block, context.approvalId, context.refId);

  if (!target || context.status !== 'pending') {
    return false;
  }

  return supportsSpringAiDecision(target, 'approve');
}

/**
 * 判断当前 block 是否应该显示“需修改”动作。
 */
function canRequestSpringAiChanges(context: RunSurfaceApprovalActionContext): boolean {
  const target = resolveSpringAiInterruptTarget(context.block, context.approvalId, context.refId);

  if (!target || context.status !== 'pending') {
    return false;
  }

  return supportsSpringAiDecision(target, 'edit');
}

/**
 * 判断当前 block 是否应该显示“拒绝”动作。
 */
function canRejectSpringAiBlock(context: RunSurfaceApprovalActionContext): boolean {
  const target = resolveSpringAiInterruptTarget(context.block, context.approvalId, context.refId);

  if (!target || context.status !== 'pending') {
    return false;
  }

  return supportsSpringAiDecision(target, 'reject');
}

/**
 * 为 Spring AI chat helper 自动装配 approval 卡片动作。
 */
function resolveSpringAiChatApprovalActions(
  baseSurface: RunSurfaceOptions,
  handlers: Partial<Record<RunSurfaceBuiltinApprovalActionKey, (context: RunSurfaceApprovalActionContext) => Promise<void>>>
): RunSurfaceOptions {
  const baseApprovalActions = baseSurface.approvalActions;

  if (baseApprovalActions === false) {
    return baseSurface;
  }

  const actions = baseApprovalActions?.actions ?? [
    {
      key: 'approve',
      visible: canApproveSpringAiBlock
    },
    {
      key: 'changes_requested',
      label: '需修改',
      visible: canRequestSpringAiChanges,
      reasonMode: (context) => resolveSpringAiReasonMode('changes_requested', context),
      reasonLabel: '修改说明',
      reasonPlaceholder: '告诉 Spring AI 为什么这次工具调用需要调整',
      reasonSubmitLabel: '提交修改意见'
    },
    {
      key: 'reject',
      visible: canRejectSpringAiBlock,
      reasonMode: (context) => resolveSpringAiReasonMode('reject', context),
      reasonLabel: '拒绝原因',
      reasonPlaceholder: '告诉 Spring AI 为什么不执行这次工具调用',
      reasonSubmitLabel: '确认拒绝'
    }
  ];
  const builtinHandlers = {
    ...handlers,
    ...(baseApprovalActions?.builtinHandlers ?? {})
  };
  const approvalActions: RunSurfaceApprovalActionsOptions = {
    enabled: true,
    ...(baseApprovalActions ?? {}),
    actions,
    builtinHandlers
  };

  return {
    ...baseSurface,
    approvalActions
  };
}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createSpringAiChatIds(input: {
  conversationId: string;
  at: number;
}): SpringAiChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从 Spring AI 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultSpringAiSessionId(event: SpringAiEvent): string | undefined {
  const metadata = readSpringAiRecord(event.metadata);
  const data = readSpringAiRecord(event.data);

  return readSpringAiString(metadata?.session_id)
    ?? readSpringAiString(data?.session_id);
}

/**
 * 创建一个更短的 Spring AI 聊天接入入口。
 */
export function useSpringAiChatSession<
  TSource = FetchTransportSource
>(
  options: UseSpringAiChatSessionOptions<TSource>
): UseSpringAiChatSessionResult<TSource> {
  const backendSessionIdForTransport = shallowRef('');
  const pendingResumeRequest = shallowRef<SpringAiResumeRequestBody | null>(null);
  const pendingInterruptDecisions = new Map<string, Map<number, SpringAiHumanDecision>>();
  const sessionState = useFrameworkChatSession<
    SpringAiEvent,
    TSource,
    SpringAiChatIds,
    SpringAiProtocolOptions,
    SpringAiAdapterOptions<TSource>,
    SpringAiSseTransportOptions<TSource>
  >({
    frameworkName: 'Spring AI',
    options: {
      ...options,
      transport: {
        ...(options.transport ?? {}),
        body: async (source: TSource) => {
          const resolvedBody = await resolveSpringAiTransportValue(source, options.transport?.body);
          const mode = toValue(options.mode);

          return {
            ...(resolvedBody ?? {}),
            ...(backendSessionIdForTransport.value
              ? {
                  session_id: backendSessionIdForTransport.value
                }
              : {}),
            ...(mode
              ? {
                  mode
                }
              : {}),
            ...(pendingResumeRequest.value
              ? {
                  springai_resume: pendingResumeRequest.value
                }
              : {})
          };
        }
      }
    },
    createAdapter: createSpringAiAdapter,
    createTransport: createSpringAiSseTransport,
    resolveSessionId: resolveDefaultSpringAiSessionId
  }) as UseSpringAiChatSessionResult<TSource>;

  watch(
    () => sessionState.sessionId.value,
    (nextSessionId) => {
      backendSessionIdForTransport.value = nextSessionId;
    },
    {
      immediate: true
    }
  );

  /**
   * 继续一个已暂停的 Spring AI approval batch，并复用同一个 `/api/stream/springai` SSE 入口。
   */
  async function resolveInterrupt(
    input: SpringAiResumeRequestBody,
    source?: TSource
  ) {
    const previousRequestInput = sessionState.requestInput.value;
    pendingResumeRequest.value = input;
    sessionState.requestInput.value = '';

    try {
      await sessionState.connect(source);
    } finally {
      sessionState.requestInput.value = previousRequestInput;
      pendingResumeRequest.value = null;
    }
  }

  /**
   * 记录某个审批项的决策；只有当同一个 interrupt batch 的决策收齐后才真正 resume。
   */
  async function submitSpringAiDecision(
    context: RunSurfaceApprovalActionContext,
    decision: SpringAiHumanDecision,
    source?: TSource
  ) {
    const target = resolveSpringAiInterruptTarget(context.block, context.approvalId, context.refId);

    if (!target) {
      throw new Error('Spring AI interrupt target is missing on the current approval block.');
    }

    const resolvedActionKey = resolveSpringAiDecisionActionKey(decision);
    let decisionsByIndex = pendingInterruptDecisions.get(target.interruptId);

    if (!decisionsByIndex) {
      decisionsByIndex = new Map<number, SpringAiHumanDecision>();
      pendingInterruptDecisions.set(target.interruptId, decisionsByIndex);
    }

    decisionsByIndex.set(target.interruptIndex, decision);

    const orderedDecisions: SpringAiHumanDecision[] = [];

    for (let index = 0; index < target.interruptCount; index += 1) {
      const current = decisionsByIndex.get(index);

      if (!current) {
        patchSpringAiApprovalBlock(
          context,
          resolvedActionKey,
          resolveSpringAiApprovalMessage(resolvedActionKey, true)
        );
        patchSpringAiApprovalToolBlock(context, resolvedActionKey, true);
        return;
      }

      orderedDecisions.push(current);
    }

    patchSpringAiApprovalBlock(
      context,
      resolvedActionKey,
      resolveSpringAiApprovalMessage(resolvedActionKey, false)
    );
    patchSpringAiApprovalToolBlock(context, resolvedActionKey, false);

    await resolveInterrupt({
      decisions: orderedDecisions
    }, source);
    pendingInterruptDecisions.delete(target.interruptId);
  }

  /**
   * 基于当前 approval 动作构造一份可自定义的 Spring AI HITL 上下文。
   */
  function createSpringAiHitlActionContext(
    context: RunSurfaceApprovalActionContext,
    actionKey: SpringAiChatHitlActionKey
  ): SpringAiChatHitlActionContext<TSource> {
    const target = resolveSpringAiInterruptTarget(context.block, context.approvalId, context.refId);

    if (!target) {
      throw new Error('Spring AI interrupt target is missing on the current approval block.');
    }

    const defaultDecision = resolveSpringAiHumanDecision(actionKey, context, target);

    if (!defaultDecision) {
      throw new Error(`Spring AI decision "${actionKey}" is not supported by the current interrupt.`);
    }

    return {
      ...context,
      actionKey,
      target,
      defaultDecision,
      resolveInterrupt,
      submitDecision: async (decision = defaultDecision, source?: TSource) => {
        await submitSpringAiDecision(context, decision, source);
      }
    };
  }

  const surface = computed(() => {
    const baseSurface = sessionState.surface.value;
    const hitlHandlers = options.hitl?.handlers;

    return resolveSpringAiChatApprovalActions(baseSurface, {
      approve: async (context) => {
        const hitlContext = createSpringAiHitlActionContext(context, 'approve');
        const customHandler = hitlHandlers?.approve;

        if (customHandler) {
          await customHandler(hitlContext);
          return;
        }

        await hitlContext.submitDecision();
      },
      changes_requested: async (context) => {
        const hitlContext = createSpringAiHitlActionContext(context, 'changes_requested');
        const customHandler = hitlHandlers?.changes_requested;

        if (customHandler) {
          await customHandler(hitlContext);
          return;
        }

        await hitlContext.submitDecision();
      },
      reject: async (context) => {
        const hitlContext = createSpringAiHitlActionContext(context, 'reject');
        const customHandler = hitlHandlers?.reject;

        if (customHandler) {
          await customHandler(hitlContext);
          return;
        }

        await hitlContext.submitDecision();
      }
    });
  });

  return {
    ...sessionState,
    surface,
    resolveInterrupt
  };
}
