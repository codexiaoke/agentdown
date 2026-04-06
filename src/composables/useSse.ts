import { computed, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { createJsonRequestInitResolver, createSseTransport } from '../runtime/transports';
import type {
  FetchTransportSource,
  JsonRequestOptions,
  SseTransportOptions
} from '../runtime/transports';

/**
 * `useSse()` 暴露给页面层的连接状态。
 */
export type SseStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'aborted' | 'error';

/**
 * 更贴近业务语义的 SSE 请求描述。
 */
export interface SseRequestOptions<TSource = FetchTransportSource>
  extends JsonRequestOptions<TSource, BodyInit | Record<string, unknown>> {}

/**
 * 单次 connect 时可覆盖的行为配置。
 */
export interface UseSseConnectOptions<TSource = FetchTransportSource> {
  request?: SseRequestOptions<TSource>;
  clearMessages?: boolean;
}

/**
 * `useSse()` 的完整配置项。
 */
export interface UseSseOptions<TPacket = unknown, TSource = FetchTransportSource>
  extends Omit<SseTransportOptions<TPacket, TSource>, 'init'> {
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  request?: SseRequestOptions<TSource>;
  init?: SseTransportOptions<TPacket, TSource>['init'];
  autoStart?: boolean;
  closeOnScopeDispose?: boolean;
  clearMessagesOnConnect?: boolean;
  keepMessages?: number | false;
  onMessage?: (packet: TPacket, index: number) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onAbort?: () => void;
  onStatusChange?: (status: SseStatus) => void;
}

/**
 * `useSse()` 返回的响应式状态和控制方法。
 */
export interface UseSseResult<TPacket = unknown, TSource = FetchTransportSource> {
  status: ShallowRef<SseStatus>;
  messages: ShallowRef<TPacket[]>;
  lastMessage: ShallowRef<TPacket | undefined>;
  messageCount: ShallowRef<number>;
  error: ShallowRef<Error | undefined>;
  connecting: ComputedRef<boolean>;
  streaming: ComputedRef<boolean>;
  completed: ComputedRef<boolean>;
  connect: (source?: TSource, options?: UseSseConnectOptions<TSource>) => Promise<void>;
  restart: (source?: TSource, options?: UseSseConnectOptions<TSource>) => Promise<void>;
  abort: () => void;
  clearMessages: () => void;
}

/**
 * 把 method / headers / body 这类更贴近业务的配置，转成 transport.init。
 * 这样 standalone useSse 和 useSseBridge 可以共用同一套请求描述方式。
 */
export function createSseRequestInitResolver<TSource = FetchTransportSource>(
  request?: SseRequestOptions<TSource>,
  baseInit?: SseTransportOptions<unknown, TSource>['init']
): SseTransportOptions<unknown, TSource>['init'] | undefined {
  return createJsonRequestInitResolver(request, baseInit);
}

/**
 * 优先使用显式传入的 source，否则回退到默认 source。
 */
function resolveSourceOrThrow<TSource>(
  preferred: TSource | null | undefined,
  fallback: TSource | null | undefined
): TSource {
  if (preferred !== undefined && preferred !== null) {
    return preferred;
  }

  if (fallback !== undefined && fallback !== null) {
    return fallback;
  }

  throw new Error('SSE source is required before calling connect().');
}

/**
 * 通用 SSE composable。
 * 适合直接消费后端 SSE，同时保留 connect / abort / status / lastMessage 这一层业务友好的 API。
 */
export function useSse<TPacket = unknown, TSource = FetchTransportSource>(
  options: UseSseOptions<TPacket, TSource> = {}
): UseSseResult<TPacket, TSource> {
  const status = shallowRef<SseStatus>('idle');
  const messages = shallowRef<TPacket[]>([]);
  const lastMessage = shallowRef<TPacket>();
  const messageCount = shallowRef(0);
  const error = shallowRef<Error>();
  let activeController: AbortController | null = null;
  let abortedByUser = false;

  /**
   * 更新状态并触发外部状态监听。
   */
  function setStatus(nextStatus: SseStatus) {
    status.value = nextStatus;
    options.onStatusChange?.(nextStatus);
  }

  /**
   * 清空当前缓存的消息列表和计数。
   */
  function clearMessages() {
    messages.value = [];
    lastMessage.value = undefined;
    messageCount.value = 0;
  }

  /**
   * 主动中断当前 SSE 连接。
   */
  function abort() {
    if (!activeController) {
      return;
    }

    abortedByUser = true;
    activeController.abort();
  }

  /**
   * 建立一条新的 SSE 连接，并持续消费返回消息。
   */
  async function connect(
    nextSource?: TSource,
    connectOptions: UseSseConnectOptions<TSource> = {}
  ) {
    const source = resolveSourceOrThrow(nextSource, options.source ? toValue(options.source) : undefined);

    abort();
    error.value = undefined;
    abortedByUser = false;

    if (connectOptions.clearMessages ?? options.clearMessagesOnConnect) {
      clearMessages();
    }

    const controller = new AbortController();
    activeController = controller;
    setStatus('connecting');
    const init = createSseRequestInitResolver(
      connectOptions.request ?? options.request,
      options.init as SseTransportOptions<unknown, TSource>['init']
    ) as SseTransportOptions<TPacket, TSource>['init'];
    const transportOptions: SseTransportOptions<TPacket, TSource> = {
      ...(options.mode !== undefined ? { mode: options.mode } : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.parse !== undefined ? { parse: options.parse } : {}),
      ...(init !== undefined ? { init } : {})
    };

    const transport = createSseTransport<TPacket, TSource>(transportOptions);

    try {
      let packetIndex = messageCount.value;

      for await (const packet of transport.connect(source, { signal: controller.signal })) {
        if (status.value === 'connecting') {
          setStatus('streaming');
        }

        packetIndex += 1;
        messageCount.value = packetIndex;
        lastMessage.value = packet;

        const keepMessages = options.keepMessages ?? false;

        if (keepMessages !== false) {
          const nextMessages = [...messages.value, packet];

          messages.value = typeof keepMessages === 'number'
            ? nextMessages.slice(-keepMessages)
            : nextMessages;
        }

        options.onMessage?.(packet, packetIndex);
      }

      if (abortedByUser || controller.signal.aborted) {
        setStatus('aborted');
        options.onAbort?.();
      } else {
        setStatus('completed');
        options.onComplete?.();
      }
    } catch (cause) {
      if (abortedByUser || controller.signal.aborted) {
        setStatus('aborted');
        options.onAbort?.();
      } else {
        const nextError = cause instanceof Error ? cause : new Error('SSE stream failed.');
        error.value = nextError;
        setStatus('error');
        options.onError?.(nextError);
        throw nextError;
      }
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  /**
   * 重新发起一次 SSE 连接。
   */
  async function restart(
    nextSource?: TSource,
    connectOptions: UseSseConnectOptions<TSource> = {}
  ) {
    await connect(nextSource, connectOptions);
  }

  watch(
    () => options.autoStart ? options.source ? toValue(options.source) : undefined : undefined,
    (nextSource) => {
      if (nextSource === undefined || nextSource === null) {
        return;
      }

      connect(nextSource).catch(() => {
        // error 已经走 status / onError，对页面层不再重复抛出。
      });
    },
    {
      immediate: true
    }
  );

  onScopeDispose(() => {
    if (options.closeOnScopeDispose ?? true) {
      abort();
    }
  });

  return {
    status,
    messages,
    lastMessage,
    messageCount,
    error,
    connecting: computed(() => status.value === 'connecting'),
    streaming: computed(() => status.value === 'streaming'),
    completed: computed(() => status.value === 'completed'),
    connect,
    restart,
    abort,
    clearMessages
  };
}
