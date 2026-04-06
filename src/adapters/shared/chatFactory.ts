import { computed, shallowRef, toValue, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { useAdapterSession, type UseAdapterSessionResult } from '../../composables/useAdapterSession';
import type { AgentdownAdapter, AgentdownAdapterSessionOptions } from '../../runtime/defineAdapter';
import { cmd } from '../../runtime/defineProtocol';
import type { BridgeHooks, TransportAdapter } from '../../runtime/types';
import type { EventActionRegistryResult } from '../../runtime/eventActions';
import type { RunSurfaceMessageActionItem, RunSurfaceMessageActionsRoleOptions, RunSurfaceOptions } from '../../surface/types';
import type { FrameworkAdapterOptionsLike, FrameworkAdapterProtocolOptionsLike, FrameworkEventRegistryLike, FrameworkToolRegistryLike } from './adapterFactory';
import type { FrameworkJsonSseTransportOptionsLike } from './jsonSseTransportFactory';

/**
 * 四套官方 chat helper 共享的最小消息语义 id 结构。
 */
export interface FrameworkChatIds {
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
 * 共享 chat helper 的 sessionId 解析配置。
 */
export interface FrameworkChatSessionIdOptions<TRawPacket = unknown> {
  /** 如何从原始事件里提取后端 sessionId。 */
  resolve?: (event: TRawPacket) => string | undefined;
}

/**
 * 共享 chat helper 的用户消息预插入配置。
 */
export interface FrameworkChatUserMessageOptions {
  /** 用户消息写入到哪个 slot。默认 `main`。 */
  slot?: string;
}

/**
 * 共享 chat helper 的 assistant 操作栏配置。
 */
export interface FrameworkChatAssistantActionsOptions {
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
 * chat 工厂内部会识别的最小 protocol 语义字段。
 */
export interface FrameworkChatProtocolOptionsLike extends FrameworkAdapterProtocolOptionsLike {
  /** conversationId 解析规则。 */
  conversationId?: unknown;
  /** turnId 解析规则。 */
  turnId?: unknown;
  /** messageId 解析规则。 */
  messageId?: unknown;
}

/**
 * 四套官方 chat helper 共享的最小 adapter options 结构。
 */
export interface FrameworkChatAdapterOptionsLike<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TTitle = unknown,
  TTools extends FrameworkToolRegistryLike | undefined = FrameworkToolRegistryLike | undefined,
  TEvents extends FrameworkEventRegistryLike<TRawPacket> | undefined = FrameworkEventRegistryLike<TRawPacket> | undefined
> extends FrameworkAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions, TTitle, TTools, TEvents> {}

/**
 * 四套官方 chat helper 共享的最小 transport options 结构。
 */
export interface FrameworkChatTransportOptionsLike<
  TRawPacket = unknown,
  TSource = unknown
> extends FrameworkJsonSseTransportOptionsLike<TRawPacket, TSource> {}

/**
 * 共享 chat helper 的输入配置结构。
 */
export interface FrameworkChatSessionOptionsLike<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TAdapterOptions extends FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions> = FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions>,
  TTransportOptions extends FrameworkChatTransportOptionsLike<TRawPacket, TSource> = FrameworkChatTransportOptionsLike<TRawPacket, TSource>
> {
  /** 当前聊天真正要连接的 source。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined> | undefined;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** adapter 的 run 标题简写。 */
  title?: TAdapterOptions['title'] | undefined;
  /** 传给框架 protocol 的额外协议配置。 */
  protocolOptions?: Omit<TProtocolOptions, 'conversationId' | 'turnId' | 'messageId'> | undefined;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: TAdapterOptions['tools'] | undefined;
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: TAdapterOptions['events'] | undefined;
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions | undefined;
  /** 透传给框架 SSE transport 的配置。 */
  transport?: Omit<TTransportOptions, 'message'> | undefined;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: ((input: {
    conversationId: string;
    text: string;
    at: number;
  }) => TChatIds) | undefined;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<TRawPacket> | undefined;
  /** 非 UI 事件的副作用通道。 */
  eventActions?: EventActionRegistryResult<TRawPacket> | undefined;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | FrameworkChatSessionIdOptions<TRawPacket> | undefined;
  /** 是否在真正连接前预插一条用户消息。 */
  userMessage?: false | FrameworkChatUserMessageOptions | undefined;
  /** assistant 默认消息操作栏的快捷配置。 */
  assistantActions?: false | FrameworkChatAssistantActionsOptions | undefined;
}

/**
 * 共享 chat helper 对外暴露的运行态结果。
 */
export interface FrameworkChatSessionResult<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds
> extends Omit<UseAdapterSessionResult<TRawPacket, TSource>, 'surface'> {
  /** 已经自动接好 regenerate 的最终 surface 配置。 */
  surface: ComputedRef<RunSurfaceOptions>;
  /** 当前是否仍在消费 SSE。 */
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
  chatIds: ShallowRef<TChatIds | null>;
  /** 发送当前输入框内容。 */
  send: (input?: string, source?: TSource) => Promise<void>;
  /** 重新生成上一条 assistant 回复。 */
  regenerate: (source?: TSource) => Promise<void>;
}

/**
 * 创建共享 chat helper 时需要的配置。
 */
export interface CreateFrameworkChatSessionOptions<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TAdapterOptions extends FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions> = FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions>,
  TTransportOptions extends FrameworkChatTransportOptionsLike<TRawPacket, TSource> = FrameworkChatTransportOptionsLike<TRawPacket, TSource>
> {
  /** 当前框架的显示名，仅用于错误文案。 */
  frameworkName: string;
  /** 当前框架的 chat helper 输入配置。 */
  options: FrameworkChatSessionOptionsLike<TRawPacket, TSource, TChatIds, TProtocolOptions, TAdapterOptions, TTransportOptions>;
  /** 当前框架自己的 adapter 工厂。 */
  createAdapter: (options: TAdapterOptions) => AgentdownAdapter<TRawPacket, TSource>;
  /** 当前框架自己的 transport 工厂。 */
  createTransport: (options: TTransportOptions) => TransportAdapter<TSource, TRawPacket>;
  /** 当前框架默认的 sessionId 解析器。 */
  resolveSessionId: (event: TRawPacket) => string | undefined;
}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createFrameworkChatIds(input: {
  conversationId: string;
  at: number;
}): FrameworkChatIds {
  const seed = input.at;

  return {
    conversationId: input.conversationId,
    turnId: `turn:${input.conversationId}:${seed}`,
    userMessageId: `message:user:${input.conversationId}:${seed}`,
    assistantMessageId: `message:assistant:${input.conversationId}:${seed}`
  };
}

/**
 * 读取 chat helper 最终应该使用的 id 生成器。
 */
function resolveFrameworkChatIdFactory<TChatIds extends FrameworkChatIds>(
  factory: ((input: {
    conversationId: string;
    text: string;
    at: number;
  }) => TChatIds) | undefined
): (input: {
  conversationId: string;
  text: string;
  at: number;
}) => TChatIds {
  if (factory) {
    return factory;
  }

  return (input) => createFrameworkChatIds({
    conversationId: input.conversationId,
    at: input.at
  }) as TChatIds;
}

/**
 * 把空字符串 / 只含空白的输入统一收敛成真正可用的消息文本。
 */
function resolveFrameworkChatText(value: string | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

/**
 * 统一解析当前 chat session 初始要使用的 source。
 */
function resolveFrameworkChatInitialSource<TSource>(
  source: MaybeRefOrGetter<TSource | null | undefined>
): TSource | undefined {
  const resolved = toValue(source);

  if (resolved === null || resolved === undefined) {
    return undefined;
  }

  return resolved;
}

/**
 * 读取当前真正应该连接的数据源。
 */
function resolveFrameworkChatSource<TSource>(
  frameworkName: string,
  preferred: TSource | undefined,
  fallback: TSource | undefined
): TSource {
  if (preferred !== undefined) {
    return preferred;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${frameworkName} chat source is required before sending a message.`);
}

/**
 * 合并一组 bridge hooks，同时保留内置 sessionId 抓取逻辑。
 */
function mergeFrameworkChatHooks<TRawPacket>(
  base: BridgeHooks<TRawPacket> | undefined,
  extra: BridgeHooks<TRawPacket> | undefined
): BridgeHooks<TRawPacket> | undefined {
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
 * 读取 chat helper 最终应该使用的 sessionId 解析器。
 */
function resolveFrameworkChatSessionIdResolver<TRawPacket>(
  option: boolean | FrameworkChatSessionIdOptions<TRawPacket> | undefined,
  defaultResolver: (event: TRawPacket) => string | undefined
): ((event: TRawPacket) => string | undefined) | undefined {
  if (option === false) {
    return undefined;
  }

  if (option && option !== true && option.resolve) {
    return option.resolve;
  }

  return defaultResolver;
}

/**
 * 为 chat helper 创建“只提取一次 sessionId”的 bridge hooks。
 */
function createFrameworkChatCaptureHooks<TRawPacket>(
  sessionId: ShallowRef<string>,
  resolver: ((event: TRawPacket) => string | undefined) | undefined
): BridgeHooks<TRawPacket> | undefined {
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
 * 预插入一条用户消息，确保 user / assistant / tool 落在统一聊天语义里。
 */
function seedFrameworkUserMessage<TRawPacket, TSource, TChatIds extends FrameworkChatIds>(
  text: string,
  ids: TChatIds,
  runtime: UseAdapterSessionResult<TRawPacket, TSource>['runtime'],
  options: FrameworkChatUserMessageOptions | false | undefined,
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
function resolveFrameworkChatAssistantActions(
  surface: RunSurfaceOptions,
  busy: ComputedRef<boolean>,
  regenerate: () => Promise<void>,
  options: FrameworkChatAssistantActionsOptions | false | undefined
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
 * 读取当前 bridge 状态对应的简短状态文案。
 */
function resolveFrameworkStatusLabel(phase: UseAdapterSessionResult['status']['value']['phase']): string {
  switch (phase) {
    case 'consuming':
      return '连接中';
    case 'errored':
      return '连接失败';
    case 'closed':
      return '已关闭';
    default:
      return '待命';
  }
}

/**
 * 创建一个共享的聊天 session helper。
 */
export function useFrameworkChatSession<
  TRawPacket = unknown,
  TSource = unknown,
  TChatIds extends FrameworkChatIds = FrameworkChatIds,
  TProtocolOptions extends FrameworkChatProtocolOptionsLike = FrameworkChatProtocolOptionsLike,
  TAdapterOptions extends FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions> = FrameworkChatAdapterOptionsLike<TRawPacket, TSource, TProtocolOptions>,
  TTransportOptions extends FrameworkChatTransportOptionsLike<TRawPacket, TSource> = FrameworkChatTransportOptionsLike<TRawPacket, TSource>
>(
  config: CreateFrameworkChatSessionOptions<TRawPacket, TSource, TChatIds, TProtocolOptions, TAdapterOptions, TTransportOptions>
): FrameworkChatSessionResult<TRawPacket, TSource, TChatIds> {
  const requestInput = shallowRef('');
  const lastInput = shallowRef('');
  const sessionId = shallowRef('');
  const chatIds: ShallowRef<TChatIds | null> = shallowRef<TChatIds | null>(null);
  const createIds = resolveFrameworkChatIdFactory(config.options.createIds);
  const initialSource = resolveFrameworkChatInitialSource(config.options.source);
  const transport = config.createTransport({
    ...(config.options.transport ?? {}),
    message: () => requestInput.value
  } as unknown as TTransportOptions);
  const sessionIdResolver = resolveFrameworkChatSessionIdResolver(
    config.options.sessionId,
    config.resolveSessionId
  );
  const captureHooks = createFrameworkChatCaptureHooks(sessionId, sessionIdResolver);
  const eventActionHooks = config.options.eventActions?.hooks;
  const mergedUserHooks = mergeFrameworkChatHooks(config.options.hooks, eventActionHooks);
  const mergedHooks = mergeFrameworkChatHooks(mergedUserHooks, captureHooks);
  const adapterOptions = {
    protocolOptions: {
      ...(config.options.protocolOptions ?? {}),
      conversationId() {
        const activeConversationId = chatIds.value?.conversationId;

        if (activeConversationId) {
          return activeConversationId;
        }

        return toValue(config.options.conversationId);
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
  } as TAdapterOptions;

  if (config.options.title !== undefined) {
    adapterOptions.title = config.options.title;
  }

  if (config.options.tools) {
    adapterOptions.tools = config.options.tools;
  }

  if (config.options.events) {
    adapterOptions.events = config.options.events;
  }

  if (config.options.surface) {
    adapterOptions.surface = config.options.surface;
  }

  const adapter = config.createAdapter(adapterOptions);
  const sessionOverrides: AgentdownAdapterSessionOptions<TRawPacket, TSource> = {
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

  const sessionState = useAdapterSession(adapter, {
    overrides: sessionOverrides
  });
  const busy = computed(() => sessionState.status.value.phase === 'consuming');
  const statusLabel = computed(() => resolveFrameworkStatusLabel(sessionState.status.value.phase));
  const transportError = computed(() => sessionState.error.value?.message ?? '');

  /**
   * 发送一次新的用户输入。
   */
  async function send(input?: string, source?: TSource) {
    let nextInput = input;

    if (nextInput === undefined) {
      nextInput = toValue(config.options.input);
    }

    const text = resolveFrameworkChatText(nextInput);
    const conversationId = toValue(config.options.conversationId);
    const at = Date.now();
    const ids = createIds({
      conversationId,
      text,
      at
    });
    const resolvedSourceInput = toValue(config.options.source);
    let fallbackSource = sessionState.source.value;

    if (resolvedSourceInput !== null && resolvedSourceInput !== undefined) {
      fallbackSource = resolvedSourceInput as TSource;
    }

    const nextSource = resolveFrameworkChatSource(
      config.frameworkName,
      source,
      fallbackSource as TSource | undefined
    );

    lastInput.value = text;
    requestInput.value = text;
    chatIds.value = ids;
    sessionState.disconnect();
    sessionState.reset();
    seedFrameworkUserMessage(text, ids, sessionState.runtime, config.options.userMessage, at);
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

    return resolveFrameworkChatAssistantActions(
      sessionState.surface,
      busy,
      handleRegenerate,
      config.options.assistantActions
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
