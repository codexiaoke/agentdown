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
import { createAgnoAdapter } from './adapter';
import {
  createAgnoSseTransport,
  type AgnoResumeRequestBody,
  type AgnoSseTransportOptions
} from './transport';
import type {
  AgnoAdapterOptions,
  AgnoEvent,
  AgnoProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface AgnoChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type AgnoChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => AgnoChatIds;

/**
 * Agno chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface AgnoChatSessionIdOptions extends FrameworkChatSessionIdOptions<AgnoEvent> {}

/**
 * Agno chat helper 对用户消息预插入行为的配置。
 */
export interface AgnoChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * Agno chat helper 对自动重连行为的配置。
 */
export interface AgnoChatReconnectOptions<TSource = FetchTransportSource>
  extends FrameworkChatReconnectOptions<AgnoEvent, TSource> {}

/**
 * Agno chat helper 对 assistant 操作栏的快捷配置。
 */
export interface AgnoChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * `useAgnoChatSession()` 的输入配置。
 *
 * 这个 helper 的目标是把最常见的 Agno 聊天接入压缩成一层：
 * - 自动创建 adapter
 * - 自动准备 Agno JSON SSE transport
 * - 自动预插入 user message
 * - 自动生成 turn / message 语义 id
 * - 自动把“重新生成”接回本次请求
 */
export interface UseAgnoChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/agno`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案，或已结构化好的用户消息。 */
  input?: MaybeRefOrGetter<FrameworkChatInputValue | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** 透传给 Agno backend 的运行模式，例如 `hitl`。 */
  mode?: MaybeRefOrGetter<string | undefined>;
  /** 透传给 Agno backend 的 end-user id。 */
  userId?: MaybeRefOrGetter<string | undefined>;
  /** Agno adapter 的 run 标题简写。 */
  title?: AgnoAdapterOptions<TSource>['title'];
  /** 传给 `createAgnoProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<AgnoProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: AgnoAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: AgnoAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 Agno SSE transport 的配置。 */
  transport?: Omit<AgnoSseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: AgnoChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<AgnoEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<AgnoEvent> | undefined;
  /** 是否启用当前聊天会话的内置 devtools。 */
  devtools?: false | FrameworkChatDevtoolsOptions<AgnoEvent>;
  /** 是否抓取后端 sessionId；默认开启。 */
  sessionId?: boolean | AgnoChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | AgnoChatUserMessageOptions;
  /** 当前 chat helper 是否在连接失败后自动重试。 */
  reconnect?: false | AgnoChatReconnectOptions<TSource>;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | AgnoChatAssistantActionsOptions;
}

/**
 * `useAgnoChatSession()` 对外暴露的运行态结果。
 */
export interface UseAgnoChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<AgnoEvent, TSource, AgnoChatIds> {
  /** 手动继续一个已暂停的 Agno requirement。 */
  resolveRequirement: (
    input: AgnoResumeRequestBody,
    source?: TSource
  ) => Promise<void>;
}

/**
 * 读取一个 transport 可解析配置项的当前值。
 */
async function resolveAgnoTransportValue<TSource, TValue>(
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
 * 从未知 block data 中读取普通对象。
 */
function readAgnoRecord(value: unknown): RuntimeData | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RuntimeData
    : undefined;
}

/**
 * 从未知值中读取非空字符串。
 */
function readAgnoString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value
    : undefined;
}

/**
 * 从已有 approval block data 中提取需要继续保留的 Agno 元数据。
 *
 * 这一步会去掉由 approval helper 顶层字段直接管理的键，
 * 避免旧的 `status/message/title` 在 merge 时把新值覆盖回去。
 */
function extractAgnoApprovalMetadata(block: SurfaceBlock): RuntimeData | undefined {
  const data = readAgnoRecord(block.data);

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
 * 从 approval block 上提取继续 requirement 所需的关键 id。
 */
function resolveAgnoRequirementTarget(
  block: SurfaceBlock,
  approvalId?: string,
  refId?: string
): Pick<AgnoResumeRequestBody, 'run_id' | 'requirement_id'> | null {
  const data = readAgnoRecord(block.data);
  const runId = readAgnoString(data?.runId) ?? readAgnoString(refId);
  const requirementId = readAgnoString(data?.requirementId) ?? readAgnoString(approvalId);

  if (!runId || !requirementId) {
    return null;
  }

  return {
    run_id: runId,
    requirement_id: requirementId
  };
}

/**
 * 把 approval 动作 key 转换成 Agno requirement action。
 */
function resolveAgnoRequirementAction(
  actionKey: RunSurfaceBuiltinApprovalActionKey
): AgnoResumeRequestBody['action'] | null {
  switch (actionKey) {
    case 'approve':
      return 'approve';
    case 'reject':
      return 'reject';
    default:
      return null;
  }
}

/**
 * 把 approval 动作 key 映射成前端本地审批状态。
 */
function resolveAgnoApprovalStatus(
  actionKey: RunSurfaceBuiltinApprovalActionKey
): 'approved' | 'rejected' {
  return actionKey === 'approve'
    ? 'approved'
    : 'rejected';
}

/**
 * 读取当前 approval block 关联的 tool id。
 */
function resolveAgnoApprovalToolId(block: SurfaceBlock): string | undefined {
  const data = readAgnoRecord(block.data);

  return readAgnoString(data?.toolId);
}

/**
 * 乐观更新 approval 对应的工具状态，避免 reject 后卡片仍停在 pending。
 */
function patchAgnoApprovalToolBlock(
  context: RunSurfaceApprovalActionContext,
  actionKey: RunSurfaceBuiltinApprovalActionKey
) {
  const toolId = resolveAgnoApprovalToolId(context.block);

  if (!toolId) {
    return;
  }

  const status = actionKey === 'approve'
    ? 'pending'
    : 'rejected';
  const message = actionKey === 'approve'
    ? '已批准，等待执行'
    : '已拒绝执行';

  context.runtime.apply(cmd.tool.update({
    id: toolId,
    ...(context.block.groupId ? { groupId: context.block.groupId } : {}),
    ...(context.block.conversationId ? { conversationId: context.block.conversationId } : {}),
    ...(context.block.turnId ? { turnId: context.block.turnId } : {}),
    ...(context.block.messageId ? { messageId: context.block.messageId } : {}),
    status,
    message,
    at: Date.now()
  }));
}

/**
 * 先在 runtime 里乐观更新 approval block，再继续新的 SSE 流。
 */
function patchAgnoApprovalBlock(
  context: RunSurfaceApprovalActionContext,
  actionKey: RunSurfaceBuiltinApprovalActionKey
) {
  const status = resolveAgnoApprovalStatus(actionKey);
  const input = {
    id: context.block.id,
    role: context.role,
    title: context.title,
    ...(context.message ? { message: context.message } : {}),
    ...(context.approvalId ? { approvalId: context.approvalId } : {}),
    ...(context.refId ? { refId: context.refId } : {}),
    ...(context.block.groupId ? { groupId: context.block.groupId } : {}),
    ...(context.block.conversationId ? { conversationId: context.block.conversationId } : {}),
    ...(context.block.turnId ? { turnId: context.block.turnId } : {}),
    ...(context.block.messageId ? { messageId: context.block.messageId } : {}),
    status,
    at: Date.now()
  };
  const data = extractAgnoApprovalMetadata(context.block);

  context.runtime.apply(cmd.approval.update({
    ...input,
    ...(data ? { data } : {})
  }));
  patchAgnoApprovalToolBlock(context, actionKey);
}

/**
 * 为 Agno chat helper 自动装配 approval 卡片动作。
 */
function resolveAgnoChatApprovalActions(
  baseSurface: RunSurfaceOptions,
  handlers: Partial<Record<RunSurfaceBuiltinApprovalActionKey, (context: RunSurfaceApprovalActionContext) => Promise<void>>>
): RunSurfaceOptions {
  const baseApprovalActions = baseSurface.approvalActions;

  if (baseApprovalActions === false) {
    return baseSurface;
  }

  const actions = baseApprovalActions?.actions ?? ['approve', 'reject'];
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
export function createAgnoChatIds(input: {
  conversationId: string;
  at: number;
}): AgnoChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从 Agno 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultAgnoSessionId(event: AgnoEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  return undefined;
}

/**
 * 创建一个更短的 Agno 聊天接入入口。
 */
export function useAgnoChatSession<
  TSource = FetchTransportSource
>(
  options: UseAgnoChatSessionOptions<TSource>
): UseAgnoChatSessionResult<TSource> {
  const backendSessionIdForTransport = shallowRef('');
  const pendingResumeRequest = shallowRef<AgnoResumeRequestBody | null>(null);
  const sessionState = useFrameworkChatSession<
    AgnoEvent,
    TSource,
    AgnoChatIds,
    AgnoProtocolOptions,
    AgnoAdapterOptions<TSource>,
    AgnoSseTransportOptions<TSource>
  >({
    frameworkName: 'Agno',
    options: {
      ...options,
      transport: {
        ...(options.transport ?? {}),
        body: async (source: TSource) => {
          const resolvedBody = await resolveAgnoTransportValue(source, options.transport?.body);
          const mode = toValue(options.mode);
          const userId = toValue(options.userId);

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
            ...(userId
              ? {
                  user_id: userId
                }
              : {}),
            ...(pendingResumeRequest.value
              ? {
                  agno_resume: pendingResumeRequest.value
                }
              : {})
          };
        }
      }
    },
    createAdapter: createAgnoAdapter,
    createTransport: createAgnoSseTransport,
    resolveSessionId: resolveDefaultAgnoSessionId
  }) as UseAgnoChatSessionResult<TSource>;

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
   * 继续一个已暂停的 Agno requirement，并复用同一个 `/api/stream/agno` SSE 入口。
   */
  async function resolveRequirement(
    input: AgnoResumeRequestBody,
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

  const surface = computed(() => {
    const baseSurface = sessionState.surface.value;

    return resolveAgnoChatApprovalActions(baseSurface, {
      approve: async (context) => {
        const target = resolveAgnoRequirementTarget(context.block, context.approvalId, context.refId);
        const action = resolveAgnoRequirementAction('approve');

        if (!target || !action) {
          throw new Error('Agno requirement target is missing on the current approval block.');
        }

        patchAgnoApprovalBlock(context, 'approve');
        await resolveRequirement({
          ...target,
          action
        });
      },
      reject: async (context) => {
        const target = resolveAgnoRequirementTarget(context.block, context.approvalId, context.refId);
        const action = resolveAgnoRequirementAction('reject');

        if (!target || !action) {
          throw new Error('Agno requirement target is missing on the current approval block.');
        }

        patchAgnoApprovalBlock(context, 'reject');
        await resolveRequirement({
          ...target,
          action,
          ...(context.reason
            ? {
                note: context.reason
              }
            : {})
        });
      }
    });
  });

  return {
    ...sessionState,
    surface,
    resolveRequirement
  };
}
