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
  type FrameworkChatTransportContext,
  type FrameworkChatUserMessageOptions,
  useFrameworkChatSession
} from '../shared/chatFactory';
import { createAutoGenAdapter } from './adapter';
import {
  createAutoGenSseTransport,
  type AutoGenResumeRequestBody,
  type AutoGenSseTransportOptions
} from './transport';
import type { FrameworkJsonTransportResolvable } from '../shared/jsonSseTransportFactory';
import type {
  AutoGenAdapterOptions,
  AutoGenEvent,
  AutoGenProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface AutoGenChatIds extends FrameworkChatIds {}

/**
 * 自定义生成聊天语义 id 的回调签名。
 */
export type AutoGenChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => AutoGenChatIds;

/**
 * AutoGen chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface AutoGenChatSessionIdOptions extends FrameworkChatSessionIdOptions<AutoGenEvent> {}

/**
 * AutoGen chat helper 对用户消息预插入行为的配置。
 */
export interface AutoGenChatUserMessageOptions extends FrameworkChatUserMessageOptions {}

/**
 * AutoGen chat helper 对自动重连行为的配置。
 */
export interface AutoGenChatReconnectOptions<TSource = FetchTransportSource>
  extends FrameworkChatReconnectOptions<AutoGenEvent, TSource> {}

/**
 * AutoGen chat helper 对 assistant 操作栏的快捷配置。
 */
export interface AutoGenChatAssistantActionsOptions extends FrameworkChatAssistantActionsOptions {}

/**
 * AutoGen chat helper 内置 HITL 动作支持的稳定 key。
 */
export type AutoGenChatHitlActionKey = Extract<
  RunSurfaceBuiltinApprovalActionKey,
  'approve' | 'reject'
>;

/**
 * AutoGen 继续 human handoff 时允许传入的扩展输入。
 */
export interface AutoGenChatHandoffResolutionInput extends AutoGenResumeRequestBody {
  /** 当前要继续的 handoff block id，仅前端本地用于精确更新卡片状态。 */
  blockId?: string;
  /** 当前继续动作对应的本地审批决策。 */
  decision?: 'approve' | 'reject';
}

/**
 * AutoGen approval 动作对外暴露的可扩展上下文。
 *
 * 这层主要给业务方做两类扩展：
 * - 改默认继续内容，例如把“已确认，请继续执行”换成业务自己的提示词
 * - 在真正 resume 前后插入日志、校验、弹窗或额外 side effect
 */
export interface AutoGenChatHitlActionContext<TSource = FetchTransportSource>
  extends RunSurfaceApprovalActionContext {
  /** 当前触发的 HITL 动作 key。 */
  actionKey: AutoGenChatHitlActionKey;
  /** 当前动作默认会发送给后端的 handoff 恢复输入。 */
  defaultRequest: AutoGenChatHandoffResolutionInput;
  /** 直接继续当前 human handoff，可完全自定义 payload。 */
  resolveHandoff: (
    input: AutoGenChatHandoffResolutionInput,
    source?: TSource
  ) => Promise<void>;
  /**
   * 使用默认的本地状态更新继续当前 handoff。
   *
   * - 不传 `input` 时直接使用 `defaultRequest`
   * - 传入 `input` 时会带着你的自定义内容继续请求
   */
  submit: (
    input?: AutoGenChatHandoffResolutionInput,
    source?: TSource
  ) => Promise<void>;
}

/**
 * AutoGen chat helper 对 HITL handoff 流程的扩展配置。
 */
export interface AutoGenChatHitlOptions<TSource = FetchTransportSource> {
  /** 覆写默认的 approve / reject 逻辑。 */
  handlers?: Partial<Record<
    AutoGenChatHitlActionKey,
    (context: AutoGenChatHitlActionContext<TSource>) => void | Promise<void>
  >>;
}

/**
 * `useAutoGenChatSession()` 的输入配置。
 */
export interface UseAutoGenChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/autogen`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案，或已结构化好的用户消息。 */
  input?: MaybeRefOrGetter<FrameworkChatInputValue | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** AutoGen backend 的运行模式，例如 `hitl`。 */
  mode?: MaybeRefOrGetter<string | undefined>;
  /** AutoGen adapter 的 run 标题简写。 */
  title?: AutoGenAdapterOptions<TSource>['title'];
  /** 传给 `createAutoGenProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<AutoGenProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: AutoGenAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: AutoGenAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 AutoGen SSE transport 的配置。 */
  transport?: Omit<AutoGenSseTransportOptions<TSource, FrameworkChatTransportContext>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: AutoGenChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<AutoGenEvent>;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<AutoGenEvent> | undefined;
  /** 是否启用当前聊天会话的内置 devtools。 */
  devtools?: false | FrameworkChatDevtoolsOptions<AutoGenEvent>;
  /** AutoGen approval / handoff 这层 HITL 的自定义逻辑。 */
  hitl?: AutoGenChatHitlOptions<TSource>;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | AutoGenChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | AutoGenChatUserMessageOptions;
  /** 当前 chat helper 是否在连接失败后自动重试。 */
  reconnect?: false | AutoGenChatReconnectOptions<TSource>;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | AutoGenChatAssistantActionsOptions;
}

/**
 * `useAutoGenChatSession()` 对外暴露的运行态结果。
 */
export interface UseAutoGenChatSessionResult<
  TSource = FetchTransportSource
> extends FrameworkChatSessionResult<AutoGenEvent, TSource, AutoGenChatIds> {
  /** 手动继续一个已暂停的 AutoGen human handoff。 */
  resolveHandoff: (
    input: AutoGenChatHandoffResolutionInput,
    source?: TSource
  ) => Promise<void>;
}

/**
 * AutoGen approval 动作对应的默认人工回复文案。
 */
function resolveAutoGenApprovalReply(
  actionKey: RunSurfaceBuiltinApprovalActionKey,
  reason?: string
): string {
  if (actionKey === 'reject') {
    const resolvedReason = reason?.trim();

    if (!resolvedReason) {
      throw new Error('请先填写拒绝原因。');
    }

    const normalizedReason = resolvedReason.replace(/[。.!！?？]+$/u, '');
    return `这次不继续执行，原因：${normalizedReason}。请停止当前任务，并简要确认已收到。`;
  }

  return '已确认，请继续执行。';
}

/**
 * AutoGen approval 动作执行后回写到卡片上的提示文案。
 */
function resolveAutoGenApprovalStatusMessage(
  actionKey: RunSurfaceBuiltinApprovalActionKey
): string {
  if (actionKey === 'reject') {
    return '已拒绝，AutoGen 正在处理中。';
  }

  return '已批准，AutoGen 正在继续执行。';
}

/**
 * AutoGen approval 动作失败时回退到卡片上的默认提示文案。
 */
function resolveAutoGenApprovalFallbackMessage(
  actionKey: RunSurfaceBuiltinApprovalActionKey
): string {
  if (actionKey === 'reject') {
    return '这次是否继续执行，请人工确认。';
  }

  return '请确认是否继续执行。';
}

/**
 * 为 AutoGen chat helper 自动装配简洁的 approval 卡片动作。
 */
function resolveAutoGenChatApprovalActions(
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
      label: '继续',
      title: '批准并继续执行',
      reasonMode: 'hidden'
    },
    {
      key: 'reject',
      label: '拒绝',
      title: '拒绝继续执行',
      reasonMode: 'required',
      reasonLabel: '拒绝原因',
      reasonPlaceholder: '告诉 AutoGen 为什么这次不应继续执行',
      reasonSubmitLabel: '提交拒绝原因'
    }
  ];
  const approvalActions: RunSurfaceApprovalActionsOptions = {
    enabled: true,
    ...(baseApprovalActions ?? {}),
    actions,
    builtinHandlers: {
      ...handlers,
      ...(baseApprovalActions?.builtinHandlers ?? {})
    }
  };

  return {
    ...baseSurface,
    approvalActions
  };
}

/**
 * 生成 AutoGen 默认聊天语义 id。
 */
function resolveAutoGenChatIdFactory(
  factory: AutoGenChatIdFactory | undefined
): AutoGenChatIdFactory {
  if (factory) {
    return factory;
  }

  return ({ conversationId, at }) => createAutoGenChatIds({
    conversationId,
    at
  });
}

/**
 * 读取一个 transport 可解析配置项的当前值。
 */
async function resolveAutoGenTransportValue<TSource, TValue>(
  source: TSource,
  context: FrameworkChatTransportContext | undefined,
  value: FrameworkJsonTransportResolvable<TSource, TValue, FrameworkChatTransportContext> | undefined
): Promise<TValue | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    return (value as (source: TSource, context: FrameworkChatTransportContext | undefined) => Promise<TValue> | TValue)(
      source,
      context
    );
  }

  return value;
}

/**
 * 从未知值中读取普通对象。
 */
function readAutoGenRecord(value: unknown): RuntimeData | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as RuntimeData;
}

/**
 * 从未知值中读取非空字符串。
 */
function readAutoGenString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

/**
 * 从 block.data 上读取 approval 标题。
 */
function resolveAutoGenApprovalTitle(block: SurfaceBlock): string {
  const data = readAutoGenRecord(block.data);
  return readAutoGenString(data?.title) ?? '等待人工确认';
}

/**
 * 从 block.data 上读取 approval 说明文案。
 */
function resolveAutoGenApprovalMessage(block: SurfaceBlock): string | undefined {
  const data = readAutoGenRecord(block.data);
  return readAutoGenString(data?.message);
}

/**
 * 从 block.data 上读取 approvalId。
 */
function resolveAutoGenApprovalId(block: SurfaceBlock): string | undefined {
  const data = readAutoGenRecord(block.data);
  return readAutoGenString(data?.approvalId) ?? readAutoGenString(data?.handoffId);
}

/**
 * 从 block.data 上读取 handoff targetType。
 */
function resolveAutoGenHandoffTargetType(block: SurfaceBlock): string | undefined {
  const data = readAutoGenRecord(block.data);
  return readAutoGenString(data?.targetType);
}

/**
 * 从 block.data 上读取 handoff assignee。
 */
function resolveAutoGenHandoffAssignee(block: SurfaceBlock): string | undefined {
  const data = readAutoGenRecord(block.data);
  return readAutoGenString(data?.assignee);
}

/**
 * 提取 approval block 上仍然需要继续保留的 AutoGen 元数据。
 */
function extractAutoGenApprovalMetadata(block: SurfaceBlock): RuntimeData | undefined {
  const data = readAutoGenRecord(block.data);

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
 * 读取当前 runtime 里最新的 pending approval block。
 */
function resolvePendingAutoGenApprovalBlock(
  blocks: SurfaceBlock[],
  conversationId: string
): SurfaceBlock | undefined {
  return [...blocks].reverse().find((block) => {
    if (block.type !== 'approval') {
      return false;
    }

    if (block.conversationId !== conversationId) {
      return false;
    }

    const data = readAutoGenRecord(block.data);
    return readAutoGenString(data?.status) === 'pending';
  });
}

/**
 * 按 block id 精确查找当前 runtime 里的 approval block。
 */
function resolveAutoGenApprovalBlockById(
  blocks: SurfaceBlock[],
  blockId: string
): SurfaceBlock | undefined {
  return blocks.find((block) => block.id === blockId && block.type === 'approval');
}

/**
 * 用统一规则更新 approval block 的显示状态。
 */
function patchAutoGenApprovalBlock(
  runtime: FrameworkChatSessionResult<AutoGenEvent, unknown, AutoGenChatIds>['runtime'],
  block: SurfaceBlock,
  status: 'pending' | 'approved' | 'rejected',
  message?: string
) {
  const metadata = extractAutoGenApprovalMetadata(block);
  const approvalId = resolveAutoGenApprovalId(block);
  const targetType = resolveAutoGenHandoffTargetType(block);
  const assignee = resolveAutoGenHandoffAssignee(block);
  const resolvedMessage = message ?? resolveAutoGenApprovalMessage(block);
  const refId = block.nodeId ?? undefined;

  runtime.apply(cmd.approval.upsert({
    id: block.id,
    title: resolveAutoGenApprovalTitle(block),
    status,
    ...(approvalId
      ? {
          approvalId
        }
      : {}),
    ...(resolvedMessage
      ? {
          message: resolvedMessage
        }
      : {}),
    ...(refId
      ? {
          refId
        }
      : {}),
    ...(block.groupId !== undefined ? { groupId: block.groupId } : {}),
    ...(block.conversationId !== undefined ? { conversationId: block.conversationId } : {}),
    ...(block.turnId !== undefined ? { turnId: block.turnId } : {}),
    ...(block.messageId !== undefined ? { messageId: block.messageId } : {}),
    ...(metadata
      ? {
          data: {
            ...metadata,
            ...(targetType
              ? {
                  targetType
                }
              : {}),
            ...(assignee
              ? {
                  assignee
                }
              : {})
          }
        }
      : {}),
    at: Date.now()
  }));
}

/**
 * 按 userMessage 配置预插入一条用户消息。
 */
function seedAutoGenUserMessage(
  text: string,
  ids: AutoGenChatIds,
  runtime: FrameworkChatSessionResult<AutoGenEvent, unknown, AutoGenChatIds>['runtime'],
  options: AutoGenChatUserMessageOptions | false | undefined,
  at: number
) {
  if (options === false) {
    return;
  }

  runtime.apply(cmd.message.text({
    id: `block:${ids.userMessageId}:text`,
    role: 'user',
    slot: options?.slot ?? 'main',
    text,
    conversationId: ids.conversationId,
    turnId: ids.turnId,
    messageId: ids.userMessageId,
    at
  }));
}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createAutoGenChatIds(input: {
  conversationId: string;
  at: number;
}): AutoGenChatIds {
  return createFrameworkChatIds(input);
}

/**
 * 从 AutoGen 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultAutoGenSessionId(event: AutoGenEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  const metadata = readAutoGenRecord(event.metadata);

  if (typeof metadata?.session_id === 'string' && metadata.session_id.length > 0) {
    return metadata.session_id;
  }

  if (typeof metadata?.sessionId === 'string' && metadata.sessionId.length > 0) {
    return metadata.sessionId;
  }

  return undefined;
}

/**
 * 创建一个更短的 AutoGen 聊天接入入口。
 */
export function useAutoGenChatSession<
  TSource = FetchTransportSource
>(
  options: UseAutoGenChatSessionOptions<TSource>
): UseAutoGenChatSessionResult<TSource> {
  const backendSessionIdForTransport = shallowRef('');
  const pendingResumeRequest = shallowRef<AutoGenResumeRequestBody | null>(null);
  const createIds = resolveAutoGenChatIdFactory(options.createIds);
  const sessionState = useFrameworkChatSession<
    AutoGenEvent,
    TSource,
    AutoGenChatIds,
    AutoGenProtocolOptions,
    AutoGenAdapterOptions<TSource>,
    AutoGenSseTransportOptions<TSource, FrameworkChatTransportContext>
  >({
    frameworkName: 'AutoGen',
    options: {
      ...options,
      transport: {
        ...(options.transport ?? {}),
        body: async (source: TSource, context) => {
          const resolvedBody = await resolveAutoGenTransportValue(source, context, options.transport?.body);
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
                  autogen_resume: pendingResumeRequest.value
                }
              : {})
          };
        }
      }
    },
    createAdapter: createAutoGenAdapter,
    createTransport: createAutoGenSseTransport,
    resolveSessionId: resolveDefaultAutoGenSessionId
  }) as UseAutoGenChatSessionResult<TSource>;

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
   * 继续一个已暂停的 AutoGen human handoff，并复用同一个 `/api/stream/autogen` SSE 入口。
   */
  async function resolveHandoff(
    input: AutoGenChatHandoffResolutionInput,
    source?: TSource
  ) {
    const content = input.content.trim();
    const decision = input.decision ?? 'approve';
    const approvalActionKey: RunSurfaceBuiltinApprovalActionKey = decision === 'reject'
      ? 'reject'
      : 'approve';

    if (!content) {
      throw new Error('AutoGen handoff reply cannot be empty.');
    }

    if (!backendSessionIdForTransport.value) {
      throw new Error('AutoGen sessionId is missing, so the paused handoff cannot be resumed yet.');
    }

    const conversationId = toValue(options.conversationId);
    const at = Date.now();
    const ids = createIds({
      conversationId,
      text: content,
      at
    });
    const runtimeBlocks = sessionState.runtime.snapshot().blocks;
    const pendingApprovalBlock = input.blockId
      ? resolveAutoGenApprovalBlockById(runtimeBlocks, input.blockId)
      : resolvePendingAutoGenApprovalBlock(runtimeBlocks, conversationId);
    const previousRequestInput = sessionState.requestInput.value;
    pendingResumeRequest.value = {
      content
    };
    sessionState.requestInput.value = content;
    sessionState.chatIds.value = ids;
    sessionState.interrupted.value = false;
    seedAutoGenUserMessage(content, ids, sessionState.runtime, options.userMessage, at);

    if (pendingApprovalBlock) {
      patchAutoGenApprovalBlock(
        sessionState.runtime,
        pendingApprovalBlock,
        approvalActionKey === 'reject'
          ? 'rejected'
          : 'approved',
        resolveAutoGenApprovalStatusMessage(approvalActionKey)
      );
    }

    try {
      await sessionState.withPendingHumanResolution(async () => {
        await sessionState.connect(source);
      });
    } catch (error) {
      if (pendingApprovalBlock) {
        patchAutoGenApprovalBlock(
          sessionState.runtime,
          pendingApprovalBlock,
          'pending',
          resolveAutoGenApprovalMessage(pendingApprovalBlock)
            ?? resolveAutoGenApprovalFallbackMessage(approvalActionKey)
        );
      }

      throw error;
    } finally {
      sessionState.requestInput.value = previousRequestInput;
      pendingResumeRequest.value = null;
    }
  }

  /**
   * 基于当前 approval 动作构造一份可自定义的 AutoGen HITL 上下文。
   */
  function createAutoGenHitlActionContext(
    context: RunSurfaceApprovalActionContext,
    actionKey: AutoGenChatHitlActionKey
  ): AutoGenChatHitlActionContext<TSource> {
    const defaultRequest: AutoGenChatHandoffResolutionInput = {
      content: resolveAutoGenApprovalReply(actionKey, context.reason),
      decision: actionKey,
      blockId: context.block.id
    };

    return {
      ...context,
      actionKey,
      defaultRequest,
      resolveHandoff,
      submit: async (input = defaultRequest, source?: TSource) => {
        await resolveHandoff(input, source);
      }
    };
  }

  const surface = computed(() => {
    const baseSurface = sessionState.surface.value;
    const hitlHandlers = options.hitl?.handlers;

    return resolveAutoGenChatApprovalActions(baseSurface, {
      approve: async (context) => {
        const hitlContext = createAutoGenHitlActionContext(context, 'approve');
        const customHandler = hitlHandlers?.approve;

        if (customHandler) {
          await customHandler(hitlContext);
          return;
        }

        await hitlContext.submit();
      },
      reject: async (context) => {
        const hitlContext = createAutoGenHitlActionContext(context, 'reject');
        const customHandler = hitlHandlers?.reject;

        if (customHandler) {
          await customHandler(hitlContext);
          return;
        }

        await hitlContext.submit();
      }
    });
  });

  return {
    ...sessionState,
    surface,
    resolveHandoff
  };
}
