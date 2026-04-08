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
  type FrameworkChatIds,
  type FrameworkChatSessionIdOptions,
  type FrameworkChatSessionResult,
  type FrameworkChatUserMessageOptions,
  useFrameworkChatSession
} from '../shared/chatFactory';
import { createLangChainAdapter } from './adapter';
import {
  createLangChainSseTransport,
  type LangChainResumeRequestBody,
  type LangChainSseTransportOptions
} from './transport';
import type {
  LangChainAdapterOptions,
  LangChainEvent,
  LangChainHumanDecision,
  LangChainProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface LangChainChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type LangChainChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => LangChainChatIds;

/**
 * LangChain chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface LangChainChatSessionIdOptions extends FrameworkChatSessionIdOptions<LangChainEvent> {}

/**
 * LangChain chat helper 对用户消息预插入行为的配置。
 */
export interface LangChainChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * LangChain chat helper 对 assistant 操作栏的快捷配置。
 */
export interface LangChainChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * `useLangChainChatSession()` 的输入配置。
 */
export interface UseLangChainChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/langchain`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** LangChain backend 的运行模式，例如 `hitl`。 */
  mode?: MaybeRefOrGetter<string | undefined>;
  /** LangChain adapter 的 run 标题简写。 */
  title?: LangChainAdapterOptions<TSource>['title'];
  /** 传给 `createLangChainProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<LangChainProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: LangChainAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: LangChainAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 LangChain SSE transport 的配置。 */
  transport?: Omit<LangChainSseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: LangChainChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<LangChainEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<LangChainEvent> | undefined;
  /** 是否启用当前聊天会话的内置 devtools。 */
  devtools?: false | FrameworkChatDevtoolsOptions<LangChainEvent>;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | LangChainChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | LangChainChatUserMessageOptions;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | LangChainChatAssistantActionsOptions;
}

/**
 * `useLangChainChatSession()` 对外暴露的运行态结果。
 */
export interface UseLangChainChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<LangChainEvent, TSource, LangChainChatIds> {
  /** 手动继续一个已暂停的 LangChain HITL interrupt。 */
  resolveInterrupt: (
    input: LangChainResumeRequestBody,
    source?: TSource
  ) => Promise<void>;
}

/**
 * LangChain approval block 里需要的关键 interrupt 元数据。
 */
interface LangChainInterruptTarget {
  /** 当前 interrupt batch id。 */
  interruptId: string;
  /** 当前审批项在 batch 里的索引。 */
  interruptIndex: number;
  /** 当前 batch 一共有多少个审批项。 */
  interruptCount: number;
  /** 当前审批项允许的官方决策列表。 */
  allowedDecisions: string[];
  /** 原始工具名称。 */
  toolName?: string;
  /** 原始工具参数。 */
  toolArgs?: Record<string, unknown>;
}

/**
 * 读取一个 transport 可解析配置项的当前值。
 */
async function resolveLangChainTransportValue<TSource, TValue>(
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
function readLangChainRecord(value: unknown): RuntimeData | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as RuntimeData;
}

/**
 * 从未知值中读取非空字符串。
 */
function readLangChainString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

/**
 * 从未知值中读取数字。
 */
function readLangChainNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

/**
 * 从未知值中读取字符串数组。
 */
function readLangChainStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * 从已有 approval block data 中提取需要继续保留的 LangChain 元数据。
 */
function extractLangChainApprovalMetadata(block: SurfaceBlock): RuntimeData | undefined {
  const data = readLangChainRecord(block.data);

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

  if (Object.keys(metadata).length === 0) {
    return undefined;
  }

  return metadata;
}

/**
 * 从 approval block 上提取继续 LangChain interrupt 所需的关键元数据。
 */
function resolveLangChainInterruptTarget(
  block: SurfaceBlock,
  approvalId?: string,
  refId?: string
): LangChainInterruptTarget | null {
  const data = readLangChainRecord(block.data);
  const interruptId = readLangChainString(data?.interruptId)
    ?? readLangChainString(refId)
    ?? readLangChainString(approvalId);
  const interruptIndex = readLangChainNumber(data?.interruptIndex);
  const interruptCount = readLangChainNumber(data?.interruptCount);

  if (!interruptId || interruptIndex === undefined || interruptCount === undefined) {
    return null;
  }

  const toolName = readLangChainString(data?.toolName);
  const toolArgs = readLangChainRecord(data?.toolArgs) as Record<string, unknown> | undefined;

  return {
    interruptId,
    interruptIndex,
    interruptCount,
    allowedDecisions: readLangChainStringArray(data?.allowedDecisions),
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
 * 判断当前审批项是否允许某个 LangChain 官方决策。
 */
function supportsLangChainDecision(
  target: LangChainInterruptTarget,
  decision: 'approve' | 'edit' | 'reject'
): boolean {
  return target.allowedDecisions.includes(decision);
}

/**
 * 把 approval 动作 key 映射成前端本地审批状态。
 */
function resolveLangChainApprovalStatus(
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
 * 读取当前动作点击后要回写到卡片上的提示文案。
 */
function resolveLangChainApprovalMessage(
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  waitingForOthers: boolean
): string {
  if (actionKey === 'approve') {
    return waitingForOthers
      ? '已批准，等待其他审批项。'
      : '已批准，LangChain 正在继续执行。';
  }

  if (actionKey === 'changes_requested') {
    return waitingForOthers
      ? '已记录修改意见，等待其他审批项。'
      : '已提交修改意见，LangChain 正在继续执行。';
  }

  return waitingForOthers
    ? '已拒绝，等待其他审批项。'
    : '已拒绝，LangChain 正在继续执行。';
}

/**
 * 把 approval 动作转换成真正发给 LangChain 的人工决策。
 *
 * 说明：
 * - `approve` 直接映射到官方 `approve`
 * - `reject` 直接映射到官方 `reject`
 * - `changes_requested` 当前也会回落到官方 `reject`
 *   并把用户填写的说明作为 message 传回模型，让模型自行调整后续计划
 */
function resolveLangChainHumanDecision(
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  context: RunSurfaceApprovalActionContext,
  target: LangChainInterruptTarget
): LangChainHumanDecision | null {
  if (actionKey === 'approve') {
    if (!supportsLangChainDecision(target, 'approve')) {
      return null;
    }

    return {
      type: 'approve'
    };
  }

  if (!supportsLangChainDecision(target, 'reject')) {
    return null;
  }

  const message = context.reason?.trim() || undefined;

  if (actionKey === 'changes_requested') {
    return {
      type: 'reject',
      ...(message
        ? {
            message
          }
        : {})
    };
  }

  if (actionKey === 'reject') {
    return {
      type: 'reject',
      ...(message
        ? {
            message
          }
        : {})
    };
  }

  return null;
}

/**
 * 先在 runtime 里乐观更新 approval block，让用户立刻看到当前决策已记录。
 */
function patchLangChainApprovalBlock(
  context: RunSurfaceApprovalActionContext,
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  message: string
) {
  const status = resolveLangChainApprovalStatus(actionKey);
  const metadata = extractLangChainApprovalMetadata(context.block);

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
function canApproveLangChainBlock(context: RunSurfaceApprovalActionContext): boolean {
  const target = resolveLangChainInterruptTarget(context.block, context.approvalId, context.refId);

  if (!target || context.status !== 'pending') {
    return false;
  }

  return supportsLangChainDecision(target, 'approve');
}

/**
 * 判断当前 block 是否应该显示“需修改”动作。
 */
function canRequestLangChainChanges(context: RunSurfaceApprovalActionContext): boolean {
  const target = resolveLangChainInterruptTarget(context.block, context.approvalId, context.refId);

  if (!target || context.status !== 'pending') {
    return false;
  }

  return supportsLangChainDecision(target, 'reject');
}

/**
 * 判断当前 block 是否应该显示“拒绝”动作。
 */
function canRejectLangChainBlock(context: RunSurfaceApprovalActionContext): boolean {
  return canRequestLangChainChanges(context);
}

/**
 * 为 LangChain chat helper 自动装配 approval 卡片动作。
 */
function resolveLangChainChatApprovalActions(
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
      visible: canApproveLangChainBlock
    },
    {
      key: 'changes_requested',
      label: '需修改',
      visible: canRequestLangChainChanges,
      reasonMode: 'required',
      reasonLabel: '修改说明',
      reasonPlaceholder: '告诉 LangChain 为什么这次工具调用需要调整',
      reasonSubmitLabel: '提交修改意见'
    },
    {
      key: 'reject',
      visible: canRejectLangChainBlock,
      reasonMode: 'required',
      reasonLabel: '拒绝原因',
      reasonPlaceholder: '告诉 LangChain 为什么不执行这次工具调用',
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
export function createLangChainChatIds(input: {
  conversationId: string;
  at: number;
}): LangChainChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从 LangChain 原始事件里读取最常见的 sessionId / threadId 字段。
 */
function resolveDefaultLangChainSessionId(event: LangChainEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  const metadata = readLangChainRecord(event.metadata);

  if (typeof metadata?.session_id === 'string' && metadata.session_id.length > 0) {
    return metadata.session_id;
  }

  if (typeof metadata?.sessionId === 'string' && metadata.sessionId.length > 0) {
    return metadata.sessionId;
  }

  if (typeof metadata?.thread_id === 'string' && metadata.thread_id.length > 0) {
    return metadata.thread_id;
  }

  if (typeof metadata?.threadId === 'string' && metadata.threadId.length > 0) {
    return metadata.threadId;
  }

  return undefined;
}

/**
 * 创建一个更短的 LangChain 聊天接入入口。
 */
export function useLangChainChatSession<
  TSource = FetchTransportSource
>(
  options: UseLangChainChatSessionOptions<TSource>
): UseLangChainChatSessionResult<TSource> {
  const backendSessionIdForTransport = shallowRef('');
  const pendingResumeRequest = shallowRef<LangChainResumeRequestBody | null>(null);
  const pendingInterruptDecisions = new Map<string, Map<number, LangChainHumanDecision>>();
  const sessionState = useFrameworkChatSession<
    LangChainEvent,
    TSource,
    LangChainChatIds,
    LangChainProtocolOptions,
    LangChainAdapterOptions<TSource>,
    LangChainSseTransportOptions<TSource>
  >({
    frameworkName: 'LangChain',
    options: {
      ...options,
      transport: {
        ...(options.transport ?? {}),
        body: async (source: TSource) => {
          const resolvedBody = await resolveLangChainTransportValue(source, options.transport?.body);
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
                  langchain_resume: pendingResumeRequest.value
                }
              : {})
          };
        }
      }
    },
    createAdapter: createLangChainAdapter,
    createTransport: createLangChainSseTransport,
    resolveSessionId: resolveDefaultLangChainSessionId
  }) as UseLangChainChatSessionResult<TSource>;

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
   * 继续一个已暂停的 LangChain HITL interrupt，并复用同一个 `/api/stream/langchain` SSE 入口。
   */
  async function resolveInterrupt(
    input: LangChainResumeRequestBody,
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
  async function handleLangChainApprovalAction(
    context: RunSurfaceApprovalActionContext,
    actionKey: RunSurfaceBuiltinApprovalActionKey
  ) {
    const target = resolveLangChainInterruptTarget(context.block, context.approvalId, context.refId);

    if (!target) {
      throw new Error('LangChain interrupt target is missing on the current approval block.');
    }

    const decision = resolveLangChainHumanDecision(actionKey, context, target);

    if (!decision) {
      throw new Error(`LangChain decision "${actionKey}" is not supported by the current interrupt.`);
    }

    let decisionsByIndex = pendingInterruptDecisions.get(target.interruptId);

    if (!decisionsByIndex) {
      decisionsByIndex = new Map<number, LangChainHumanDecision>();
      pendingInterruptDecisions.set(target.interruptId, decisionsByIndex);
    }

    decisionsByIndex.set(target.interruptIndex, decision);

    const orderedDecisions: LangChainHumanDecision[] = [];

    for (let index = 0; index < target.interruptCount; index += 1) {
      const current = decisionsByIndex.get(index);

      if (!current) {
        patchLangChainApprovalBlock(
          context,
          actionKey,
          resolveLangChainApprovalMessage(actionKey, true)
        );
        return;
      }

      orderedDecisions.push(current);
    }

    patchLangChainApprovalBlock(
      context,
      actionKey,
      resolveLangChainApprovalMessage(actionKey, false)
    );

    await resolveInterrupt({
      decisions: orderedDecisions
    });
    pendingInterruptDecisions.delete(target.interruptId);
  }

  const surface = computed(() => {
    const baseSurface = sessionState.surface.value;

    return resolveLangChainChatApprovalActions(baseSurface, {
      approve: async (context) => {
        await handleLangChainApprovalAction(context, 'approve');
      },
      changes_requested: async (context) => {
        await handleLangChainApprovalAction(context, 'changes_requested');
      },
      reject: async (context) => {
        await handleLangChainApprovalAction(context, 'reject');
      }
    });
  });

  return {
    ...sessionState,
    surface,
    resolveInterrupt
  };
}
