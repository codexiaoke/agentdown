import { computed, shallowRef, toValue, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { useAdapterSession, type UseAdapterSessionResult } from '../../composables/useAdapterSession';
import type { AgentdownAdapterSessionOptions } from '../../runtime/defineAdapter';
import { cmd } from '../../runtime/defineProtocol';
import type { BridgeHooks, RuntimeData } from '../../runtime/types';
import type { FetchTransportSource } from '../../runtime/transports';
import type {
  RunSurfaceMessageActionItem,
  RunSurfaceMessageActionsRoleOptions,
  RunSurfaceOptions
} from '../../surface/types';
import { createAutoGenAdapter } from './adapter';
import { createAutoGenSseTransport, type AutoGenSseTransportOptions } from './transport';
import type {
  AutoGenAdapterOptions,
  AutoGenEvent,
  AutoGenProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface AutoGenChatIds {
  /** 当前整段对话 / session 的 id。 */
  conversationId: string;
  /** 当前一问一答这一轮的 id。 */
  turnId: string;
  /** 当前用户消息的 id。 */
  userMessageId: string;
  /** 当前 assistant 消息的 id。 */
  assistantMessageId: string;
}

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
export interface AutoGenChatSessionIdOptions {
  /** 如何从原始事件里提取后端 sessionId。 */
  resolve?: (event: AutoGenEvent) => string | undefined;
}

/**
 * AutoGen chat helper 对用户消息预插入行为的配置。
 */
export interface AutoGenChatUserMessageOptions {
  /** 用户消息写入到哪个 slot。默认 `main`。 */
  slot?: string;
}

/**
 * AutoGen chat helper 对 assistant 操作栏的快捷配置。
 */
export interface AutoGenChatAssistantActionsOptions {
  /** 是否启用这一层快捷消息操作。 */
  enabled?: boolean;
  /** 自定义动作列表。 */
  actions?: RunSurfaceMessageActionItem[];
  /** draft 阶段是否也显示动作栏。 */
  showOnDraft?: boolean;
  /** 节点运行中是否也显示动作栏。 */
  showWhileRunning?: boolean;
}

/**
 * `useAutoGenChatSession()` 的输入配置。
 */
export interface UseAutoGenChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/autogen`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
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
  transport?: Omit<AutoGenSseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: AutoGenChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<AutoGenEvent>;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | AutoGenChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | AutoGenChatUserMessageOptions;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | AutoGenChatAssistantActionsOptions;
}

/**
 * `useAutoGenChatSession()` 对外暴露的运行态结果。
 */
export interface UseAutoGenChatSessionResult<
  TSource = FetchTransportSource
> extends Omit<UseAdapterSessionResult<AutoGenEvent, TSource>, 'surface'> {
  /** 已经自动接好 regenerate 的最终 surface 配置。 */
  surface: ComputedRef<RunSurfaceOptions>;
  /** 当前是否仍在消费 AutoGen SSE。 */
  busy: ComputedRef<boolean>;
  /** 适合直接展示在 demo 里的简短状态文本。 */
  statusLabel: ComputedRef<string>;
  /** 适合页面提示用的 transport 错误文本。 */
  transportError: ComputedRef<string>;
  /** 最近一次成功抓到的后端 sessionId。 */
  sessionId: ShallowRef<string>;
  /** 最近一次真正发给后端的输入文本。 */
  lastInput: ShallowRef<string>;
  /** 当前这次请求真正送给 transport 的输入文本。 */
  requestInput: ShallowRef<string>;
  /** 当前这轮消息对应的聊天语义 id。 */
  chatIds: ShallowRef<AutoGenChatIds | null>;
  /** 发送当前输入框内容。 */
  send: (input?: string, source?: TSource) => Promise<void>;
  /** 重新生成上一条 assistant 回复。 */
  regenerate: (source?: TSource) => Promise<void>;
}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createAutoGenChatIds(input: {
  conversationId: string;
  at: number;
}): AutoGenChatIds {
  const seed = input.at;

  return {
    conversationId: input.conversationId,
    turnId: `turn:${input.conversationId}:${seed}`,
    userMessageId: `message:user:${input.conversationId}:${seed}`,
    assistantMessageId: `message:assistant:${input.conversationId}:${seed}`
  };
}

/**
 * 从未知值中读取普通对象。
 */
function readAutoGenRecord(value: unknown): RuntimeData | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as RuntimeData;
  }

  return undefined;
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
 * 把空字符串 / 只含空白的输入统一收敛成真正可用的消息文本。
 */
function resolveAutoGenChatText(value: string | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

/**
 * 读取当前应该使用的 source。
 */
function resolveAutoGenChatSource<TSource>(
  preferred: TSource | undefined,
  fallback: TSource | undefined
): TSource {
  if (preferred !== undefined) {
    return preferred;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error('AutoGen chat source is required before sending a message.');
}

/**
 * 合并一组 bridge hooks，同时保留内置 sessionId 抓取逻辑。
 */
function mergeAutoGenChatHooks(
  base: BridgeHooks<AutoGenEvent> | undefined,
  extra: BridgeHooks<AutoGenEvent> | undefined
): BridgeHooks<AutoGenEvent> | undefined {
  if (!base && !extra) {
    return undefined;
  }

  return {
    onPacket(packet) {
      base?.onPacket?.(packet);
      extra?.onPacket?.(packet);
    },
    onMapped(commands, packet) {
      base?.onMapped?.(commands, packet);
      extra?.onMapped?.(commands, packet);
    },
    onFlush(commands) {
      base?.onFlush?.(commands);
      extra?.onFlush?.(commands);
    },
    onError(error) {
      base?.onError?.(error);
      extra?.onError?.(error);
    }
  };
}

/**
 * 读取 chat helper 最终应该使用的 id 生成器。
 */
function resolveAutoGenChatIdFactory(
  factory: AutoGenChatIdFactory | undefined
): AutoGenChatIdFactory {
  if (factory) {
    return factory;
  }

  return (input) => createAutoGenChatIds({
    conversationId: input.conversationId,
    at: input.at
  });
}

/**
 * 读取 chat helper 最终应该使用的 sessionId 解析器。
 */
function resolveAutoGenChatSessionIdResolver(
  option: boolean | AutoGenChatSessionIdOptions | undefined
): ((event: AutoGenEvent) => string | undefined) | undefined {
  if (option === false) {
    return undefined;
  }

  if (option && option !== true && option.resolve) {
    return option.resolve;
  }

  return resolveDefaultAutoGenSessionId;
}

/**
 * 为 chat helper 创建“只提取一次 sessionId”的 bridge hooks。
 */
function createAutoGenChatCaptureHooks(
  sessionId: ShallowRef<string>,
  resolver: ((event: AutoGenEvent) => string | undefined) | undefined
): BridgeHooks<AutoGenEvent> | undefined {
  if (!resolver) {
    return undefined;
  }

  return {
    onPacket(packet) {
      if (sessionId.value.length > 0) {
        return;
      }

      const nextSessionId = resolver(packet);

      if (typeof nextSessionId === 'string' && nextSessionId.length > 0) {
        sessionId.value = nextSessionId;
      }
    }
  };
}

/**
 * 统一解析当前 chat session 初始要使用的 source。
 */
function resolveAutoGenChatInitialSource<TSource>(
  source: MaybeRefOrGetter<TSource | null | undefined>
): TSource | undefined {
  const resolved = toValue(source);

  if (resolved === null || resolved === undefined) {
    return undefined;
  }

  return resolved;
}

/**
 * 预插入一条用户消息，确保 user / assistant / tool 落在统一聊天语义里。
 */
function seedAutoGenUserMessage(
  text: string,
  ids: AutoGenChatIds,
  runtime: UseAdapterSessionResult<AutoGenEvent>['runtime'],
  options: AutoGenChatUserMessageOptions | false | undefined,
  at: number
) {
  if (options === false) {
    return;
  }

  let slot = 'main';

  if (options?.slot) {
    slot = options.slot;
  }

  runtime.apply(cmd.message.text({
    id: `block:${ids.userMessageId}:text`,
    role: 'user',
    slot,
    text,
    conversationId: ids.conversationId,
    turnId: ids.turnId,
    messageId: ids.userMessageId,
    at
  }));
}

/**
 * 生成 assistant 默认动作栏配置，并把 regenerate 接到真实重新请求。
 */
function resolveAutoGenChatAssistantActions(
  surface: RunSurfaceOptions,
  busy: ComputedRef<boolean>,
  regenerate: () => Promise<void>,
  options: AutoGenChatAssistantActionsOptions | false | undefined
): RunSurfaceOptions {
  if (options === false) {
    return surface;
  }

  const baseAssistantActions = surface.messageActions?.assistant;

  if (baseAssistantActions === false) {
    return surface;
  }

  let actions = options?.actions;

  if (!actions) {
    actions = [
      'copy',
      {
        key: 'regenerate',
        disabled: () => busy.value
      },
      'like',
      'dislike',
      'share'
    ] satisfies RunSurfaceMessageActionItem[];
  }

  const assistantActions: RunSurfaceMessageActionsRoleOptions = {
    enabled: true,
    showOnDraft: false,
    showWhileRunning: false,
    ...(baseAssistantActions ?? {}),
    ...(options ?? {}),
    actions,
    builtinHandlers: {
      ...(baseAssistantActions?.builtinHandlers ?? {}),
      regenerate: async () => {
        await regenerate();
      }
    }
  };

  return {
    ...surface,
    messageActions: {
      ...(surface.messageActions ?? {}),
      assistant: assistantActions
    }
  };
}

/**
 * 创建一个更短的 AutoGen 聊天接入入口。
 */
export function useAutoGenChatSession<
  TSource = FetchTransportSource
>(
  options: UseAutoGenChatSessionOptions<TSource>
): UseAutoGenChatSessionResult<TSource> {
  const requestInput = shallowRef('');
  const lastInput = shallowRef('');
  const sessionId = shallowRef('');
  const chatIds = shallowRef<AutoGenChatIds | null>(null);
  const createIds = resolveAutoGenChatIdFactory(options.createIds);
  const initialSource = resolveAutoGenChatInitialSource(options.source);
  const transport = createAutoGenSseTransport<TSource>({
    ...(options.transport ?? {}),
    message: () => requestInput.value
  });
  const sessionIdResolver = resolveAutoGenChatSessionIdResolver(options.sessionId);
  const captureHooks = createAutoGenChatCaptureHooks(sessionId, sessionIdResolver);
  const mergedHooks = mergeAutoGenChatHooks(options.hooks, captureHooks);
  const autoGenAdapterOptions: AutoGenAdapterOptions<TSource> = {
    protocolOptions: {
      ...(options.protocolOptions ?? {}),
      conversationId() {
        const activeConversationId = chatIds.value?.conversationId;

        if (activeConversationId) {
          return activeConversationId;
        }

        return toValue(options.conversationId);
      },
      turnId() {
        const activeTurnId = chatIds.value?.turnId;

        if (activeTurnId) {
          return activeTurnId;
        }

        return null;
      },
      messageId() {
        const activeAssistantMessageId = chatIds.value?.assistantMessageId;

        if (activeAssistantMessageId) {
          return activeAssistantMessageId;
        }

        return null;
      }
    }
  };

  if (options.title !== undefined) {
    autoGenAdapterOptions.title = options.title;
  }

  if (options.tools) {
    autoGenAdapterOptions.tools = options.tools;
  }

  if (options.events) {
    autoGenAdapterOptions.events = options.events;
  }

  if (options.surface) {
    autoGenAdapterOptions.surface = options.surface;
  }

  const autoGenAdapter = createAutoGenAdapter<TSource>(autoGenAdapterOptions);
  const sessionOverrides: AgentdownAdapterSessionOptions<AutoGenEvent, TSource> = {
    transport
  };

  if (initialSource !== undefined) {
    sessionOverrides.source = initialSource;
  }

  if (mergedHooks) {
    sessionOverrides.bridge = {
      hooks: mergedHooks
    };
  }

  const sessionState = useAdapterSession(autoGenAdapter, {
    overrides: sessionOverrides
  });
  const busy = computed(() => sessionState.status.value.phase === 'consuming');
  const statusLabel = computed(() => {
    switch (sessionState.status.value.phase) {
      case 'consuming':
        return '连接中';
      case 'errored':
        return '连接失败';
      case 'closed':
        return '已关闭';
      default:
        return '待命';
    }
  });
  const transportError = computed(() => sessionState.error.value?.message ?? '');

  /**
   * 发送一次新的用户输入。
   */
  async function send(input?: string, source?: TSource) {
    let nextInput = input;

    if (nextInput === undefined) {
      nextInput = toValue(options.input);
    }

    const text = resolveAutoGenChatText(nextInput);
    const conversationId = toValue(options.conversationId);
    const at = Date.now();
    const ids = createIds({
      conversationId,
      text,
      at
    });
    const resolvedSourceInput = toValue(options.source);
    let fallbackSource = sessionState.source.value;

    if (resolvedSourceInput !== null && resolvedSourceInput !== undefined) {
      fallbackSource = resolvedSourceInput as TSource;
    }

    const nextSource = resolveAutoGenChatSource(
      source,
      fallbackSource as TSource | undefined
    );

    lastInput.value = text;
    requestInput.value = text;
    chatIds.value = ids;
    sessionState.disconnect();
    sessionState.reset();
    seedAutoGenUserMessage(text, ids, sessionState.runtime, options.userMessage, at);
    await sessionState.connect(nextSource);
  }

  /**
   * 重新生成上一条 assistant 回复。
   */
  async function regenerate(source?: TSource) {
    await send(lastInput.value, source);
  }

  /**
   * 基于当前 session surface 再叠一层更顺手的聊天默认值。
   */
  const surface = computed<RunSurfaceOptions>(() => {
    const handleRegenerate = async () => {
      await regenerate();
    };

    return resolveAutoGenChatAssistantActions(
      sessionState.surface,
      busy,
      handleRegenerate,
      options.assistantActions
    );
  });

  return {
    ...sessionState,
    surface,
    busy,
    statusLabel,
    transportError,
    sessionId,
    lastInput,
    requestInput,
    chatIds,
    send,
    regenerate
  };
}
