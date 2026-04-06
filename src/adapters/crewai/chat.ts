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
import { createCrewAIAdapter } from './adapter';
import { createCrewAISseTransport, type CrewAISseTransportOptions } from './transport';
import type {
  CrewAIAdapterOptions,
  CrewAIEvent,
  CrewAIProtocolOptions
} from './types';

/**
 * 一轮聊天请求里会用到的稳定语义 id 集合。
 */
export interface CrewAIChatIds {
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
export type CrewAIChatIdFactory = (input: {
  /** 当前对话 id。 */
  conversationId: string;
  /** 本次发出的用户输入。 */
  text: string;
  /** 本次发送的时间戳。 */
  at: number;
}) => CrewAIChatIds;

/**
 * CrewAI chat helper 对 sessionId 抓取逻辑的配置。
 */
export interface CrewAIChatSessionIdOptions {
  /** 如何从原始事件里提取后端 sessionId。 */
  resolve?: (event: CrewAIEvent) => string | undefined;
}

/**
 * CrewAI chat helper 对用户消息预插入行为的配置。
 */
export interface CrewAIChatUserMessageOptions {
  /** 用户消息写入到哪个 slot。默认 `main`。 */
  slot?: string;
}

/**
 * CrewAI chat helper 对 assistant 操作栏的快捷配置。
 */
export interface CrewAIChatAssistantActionsOptions {
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
 * `useCrewAIChatSession()` 的输入配置。
 */
export interface UseCrewAIChatSessionOptions<
  TSource = FetchTransportSource
> {
  /** 当前聊天真正要连接的 source，例如 `/api/stream/crewai`。 */
  source: MaybeRefOrGetter<TSource | null | undefined>;
  /** 当前输入框里的文案。 */
  input?: MaybeRefOrGetter<string | undefined>;
  /** 当前整段聊天所属的 conversationId。 */
  conversationId: MaybeRefOrGetter<string>;
  /** CrewAI adapter 的 run 标题简写。 */
  title?: CrewAIAdapterOptions<TSource>['title'];
  /** 传给 `createCrewAIProtocol()` 的额外协议配置。 */
  protocolOptions?: Omit<CrewAIProtocolOptions, 'conversationId' | 'turnId' | 'messageId'>;
  /** 按工具名映射 renderer 的 helper 产物。 */
  tools?: CrewAIAdapterOptions<TSource>['tools'];
  /** 按事件名直接映射组件的 helper 产物。 */
  events?: CrewAIAdapterOptions<TSource>['events'];
  /** 直接传给 RunSurface 的静态 surface 配置。 */
  surface?: RunSurfaceOptions;
  /** 透传给 CrewAI SSE transport 的配置。 */
  transport?: Omit<CrewAISseTransportOptions<TSource>, 'message'>;
  /** 自定义 turn / message 语义 id 的生成规则。 */
  createIds?: CrewAIChatIdFactory;
  /** 额外桥接生命周期 hooks。 */
  hooks?: BridgeHooks<CrewAIEvent>;
  /** 是否抓取后端 sessionId。 */
  sessionId?: boolean | CrewAIChatSessionIdOptions;
  /** 是否在真正连接前预插一条用户消息；默认开启。 */
  userMessage?: false | CrewAIChatUserMessageOptions;
  /** assistant 默认消息操作栏的快捷配置；默认开启。 */
  assistantActions?: false | CrewAIChatAssistantActionsOptions;
}

/**
 * `useCrewAIChatSession()` 对外暴露的运行态结果。
 */
export interface UseCrewAIChatSessionResult<
  TSource = FetchTransportSource
> extends Omit<UseAdapterSessionResult<CrewAIEvent, TSource>, 'surface'> {
  /** 已经自动接好 regenerate 的最终 surface 配置。 */
  surface: ComputedRef<RunSurfaceOptions>;
  /** 当前是否仍在消费 CrewAI SSE。 */
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
  chatIds: ShallowRef<CrewAIChatIds | null>;
  /** 发送当前输入框内容。 */
  send: (input?: string, source?: TSource) => Promise<void>;
  /** 重新生成上一条 assistant 回复。 */
  regenerate: (source?: TSource) => Promise<void>;
}

/**
 * 为一轮新请求生成默认聊天语义 id。
 */
export function createCrewAIChatIds(input: {
  conversationId: string;
  at: number;
}): CrewAIChatIds {
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
function readCrewAIRecord(value: unknown): RuntimeData | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as RuntimeData;
  }

  return undefined;
}

/**
 * 从 CrewAI 原始事件里读取最常见的 sessionId 字段。
 */
function resolveDefaultCrewAISessionId(event: CrewAIEvent): string | undefined {
  if (typeof event.session_id === 'string' && event.session_id.length > 0) {
    return event.session_id;
  }

  if (typeof event.sessionId === 'string' && event.sessionId.length > 0) {
    return event.sessionId;
  }

  const error = readCrewAIRecord(event.error);

  if (typeof error?.session_id === 'string' && error.session_id.length > 0) {
    return error.session_id;
  }

  if (typeof error?.sessionId === 'string' && error.sessionId.length > 0) {
    return error.sessionId;
  }

  return undefined;
}

/**
 * 把空字符串 / 只含空白的输入统一收敛成真正可用的消息文本。
 */
function resolveCrewAIChatText(value: string | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  return '';
}

/**
 * 读取当前应该使用的 source。
 */
function resolveCrewAIChatSource<TSource>(
  preferred: TSource | undefined,
  fallback: TSource | undefined
): TSource {
  if (preferred !== undefined) {
    return preferred;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error('CrewAI chat source is required before sending a message.');
}

/**
 * 合并一组 bridge hooks，同时保留内置 sessionId 抓取逻辑。
 */
function mergeCrewAIChatHooks(
  base: BridgeHooks<CrewAIEvent> | undefined,
  extra: BridgeHooks<CrewAIEvent> | undefined
): BridgeHooks<CrewAIEvent> | undefined {
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
function resolveCrewAIChatIdFactory(
  factory: CrewAIChatIdFactory | undefined
): CrewAIChatIdFactory {
  if (factory) {
    return factory;
  }

  return (input) => createCrewAIChatIds({
    conversationId: input.conversationId,
    at: input.at
  });
}

/**
 * 读取 chat helper 最终应该使用的 sessionId 解析器。
 */
function resolveCrewAIChatSessionIdResolver(
  option: boolean | CrewAIChatSessionIdOptions | undefined
): ((event: CrewAIEvent) => string | undefined) | undefined {
  if (option === false) {
    return undefined;
  }

  if (option && option !== true && option.resolve) {
    return option.resolve;
  }

  return resolveDefaultCrewAISessionId;
}

/**
 * 为 chat helper 创建“只提取一次 sessionId”的 bridge hooks。
 */
function createCrewAIChatCaptureHooks(
  sessionId: ShallowRef<string>,
  resolver: ((event: CrewAIEvent) => string | undefined) | undefined
): BridgeHooks<CrewAIEvent> | undefined {
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
function resolveCrewAIChatInitialSource<TSource>(
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
function seedCrewAIUserMessage(
  text: string,
  ids: CrewAIChatIds,
  runtime: UseAdapterSessionResult<CrewAIEvent>['runtime'],
  options: CrewAIChatUserMessageOptions | false | undefined,
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
function resolveCrewAIChatAssistantActions(
  surface: RunSurfaceOptions,
  busy: ComputedRef<boolean>,
  regenerate: () => Promise<void>,
  options: CrewAIChatAssistantActionsOptions | false | undefined
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
 * 创建一个更短的 CrewAI 聊天接入入口。
 */
export function useCrewAIChatSession<
  TSource = FetchTransportSource
>(
  options: UseCrewAIChatSessionOptions<TSource>
): UseCrewAIChatSessionResult<TSource> {
  const requestInput = shallowRef('');
  const lastInput = shallowRef('');
  const sessionId = shallowRef('');
  const chatIds = shallowRef<CrewAIChatIds | null>(null);
  const createIds = resolveCrewAIChatIdFactory(options.createIds);
  const initialSource = resolveCrewAIChatInitialSource(options.source);
  const transport = createCrewAISseTransport<TSource>({
    ...(options.transport ?? {}),
    message: () => requestInput.value
  });
  const sessionIdResolver = resolveCrewAIChatSessionIdResolver(options.sessionId);
  const captureHooks = createCrewAIChatCaptureHooks(sessionId, sessionIdResolver);
  const mergedHooks = mergeCrewAIChatHooks(options.hooks, captureHooks);
  const crewAIAdapterOptions: CrewAIAdapterOptions<TSource> = {
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
    crewAIAdapterOptions.title = options.title;
  }

  if (options.tools) {
    crewAIAdapterOptions.tools = options.tools;
  }

  if (options.events) {
    crewAIAdapterOptions.events = options.events;
  }

  if (options.surface) {
    crewAIAdapterOptions.surface = options.surface;
  }

  const crewAIAdapter = createCrewAIAdapter<TSource>(crewAIAdapterOptions);
  const sessionOverrides: AgentdownAdapterSessionOptions<CrewAIEvent, TSource> = {
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

  const sessionState = useAdapterSession(crewAIAdapter, {
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

    const text = resolveCrewAIChatText(nextInput);
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

    const nextSource = resolveCrewAIChatSource(
      source,
      fallbackSource as TSource | undefined
    );

    lastInput.value = text;
    requestInput.value = text;
    chatIds.value = ids;
    sessionState.disconnect();
    sessionState.reset();
    seedCrewAIUserMessage(text, ids, sessionState.runtime, options.userMessage, at);
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

    return resolveCrewAIChatAssistantActions(
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
