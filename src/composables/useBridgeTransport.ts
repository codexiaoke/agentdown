import { computed, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { createBridge } from '../runtime/createBridge';
import {
  createAsyncIterableTransport,
  createNdjsonTransport,
  createSseTransport,
  createWebSocketTransport
} from '../runtime/transports';
import type {
  AgentRuntime,
  Bridge,
  BridgeError,
  BridgeOptions,
  BridgeSnapshot,
  BridgeStatus
} from '../runtime/types';
import type {
  FetchTransportSource,
  NdjsonTransportOptions,
  SseTransportOptions,
  WebSocketTransportOptions,
  WebSocketTransportSource
} from '../runtime/transports';
import { createSseRequestInitResolver, type SseRequestOptions } from './useSse';
import { useRuntimeSnapshot } from './useRuntimeSnapshot';

/**
 * `useBridgeTransport()` 的基础配置。
 */
export interface UseBridgeTransportOptions<TRawPacket, TSource> {
  bridge: Bridge<TRawPacket, TSource>;
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  autoStart?: boolean;
  resetOnStart?: boolean;
  closeOnScopeDispose?: boolean;
}

/**
 * `useBridgeTransport()` 暴露的状态和控制方法。
 */
export interface UseBridgeTransportResult<TRawPacket, TSource> {
  bridge: Bridge<TRawPacket, TSource>;
  runtime: AgentRuntime;
  runtimeSnapshot: ReturnType<typeof useRuntimeSnapshot>;
  status: ShallowRef<BridgeStatus>;
  bridgeSnapshot: ShallowRef<BridgeSnapshot<TRawPacket>>;
  consuming: ComputedRef<boolean>;
  error: ComputedRef<BridgeError<TRawPacket> | Error | undefined>;
  start: (source?: TSource) => Promise<void>;
  stop: () => void;
  restart: (source?: TSource) => Promise<void>;
  push: (packet: TRawPacket | TRawPacket[]) => void;
  flush: (reason?: string) => void;
  reset: () => void;
  close: () => void;
  refresh: () => void;
}

/**
 * `useSseBridge()` 的扩展配置。
 */
export interface UseSseBridgeOptions<TRawPacket, TSource = FetchTransportSource>
  extends Omit<BridgeOptions<TRawPacket, TSource>, 'transport'> {
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  request?: SseRequestOptions<TSource>;
  transport?: SseTransportOptions<TRawPacket, TSource>;
  autoStart?: boolean;
  resetOnStart?: boolean;
  closeOnScopeDispose?: boolean;
}

/**
 * 单次 SSE 连接时可临时覆盖的请求配置。
 */
export interface UseSseBridgeConnectOptions<TSource = FetchTransportSource> {
  request?: SseRequestOptions<TSource>;
}

/**
 * `useSseBridge()` 在基础 bridge 状态之上增加的 SSE 控制方法。
 */
export interface UseSseBridgeResult<TRawPacket, TSource = FetchTransportSource>
  extends UseBridgeTransportResult<TRawPacket, TSource> {
  connect: (source?: TSource, options?: UseSseBridgeConnectOptions<TSource>) => Promise<void>;
  reconnect: (source?: TSource, options?: UseSseBridgeConnectOptions<TSource>) => Promise<void>;
  disconnect: () => void;
}

/**
 * `useNdjsonBridge()` 的配置项。
 */
export interface UseNdjsonBridgeOptions<TRawPacket, TSource = FetchTransportSource>
  extends Omit<BridgeOptions<TRawPacket, TSource>, 'transport'> {
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  transport?: NdjsonTransportOptions<TRawPacket, TSource>;
  autoStart?: boolean;
  resetOnStart?: boolean;
  closeOnScopeDispose?: boolean;
}

/**
 * `useWebSocketBridge()` 的配置项。
 */
export interface UseWebSocketBridgeOptions<TRawPacket, TSource = WebSocketTransportSource>
  extends Omit<BridgeOptions<TRawPacket, TSource>, 'transport'> {
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  transport?: WebSocketTransportOptions<TRawPacket, TSource>;
  autoStart?: boolean;
  resetOnStart?: boolean;
  closeOnScopeDispose?: boolean;
}

/**
 * `useAsyncIterableBridge()` 的配置项。
 */
export interface UseAsyncIterableBridgeOptions<
  TRawPacket,
  TSource extends AsyncIterable<TRawPacket> | Iterable<TRawPacket> =
    AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> extends Omit<BridgeOptions<TRawPacket, TSource>, 'transport'> {
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  autoStart?: boolean;
  resetOnStart?: boolean;
  closeOnScopeDispose?: boolean;
}

/**
 * 优先使用显式传入的 source，否则回退到 hook 默认 source。
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

  throw new Error('Bridge source is required before calling start().');
}

/**
 * 给现成 bridge 补一层 Vue 状态管理。
 * 适合做 start / stop / reconnect 按钮，或把 bridge 状态直接绑到界面上。
 */
export function useBridgeTransport<TRawPacket, TSource>(
  options: UseBridgeTransportOptions<TRawPacket, TSource>
): UseBridgeTransportResult<TRawPacket, TSource> {
  const bridge = options.bridge;
  const runtimeSnapshot = useRuntimeSnapshot(bridge.runtime);
  const status = shallowRef(bridge.status());
  const bridgeSnapshot = shallowRef(bridge.snapshot());
  const transportError = shallowRef<BridgeError<TRawPacket> | Error | undefined>(undefined);
  let activeController: AbortController | null = null;

  /**
   * 从 bridge 重新同步一份最新状态。
   */
  function refresh() {
    status.value = bridge.status();
    bridgeSnapshot.value = bridge.snapshot();
  }

  /**
   * 中断当前 transport 消费流程。
   */
  function stop() {
    activeController?.abort();
    activeController = null;
    refresh();
  }

  /**
   * 启动 bridge 对指定 source 的消费。
   */
  async function start(nextSource?: TSource) {
    const source = resolveSourceOrThrow(nextSource, options.source ? toValue(options.source) : undefined);

    stop();
    transportError.value = undefined;

    if (options.resetOnStart) {
      bridge.reset();
      runtimeSnapshot.refresh();
    }

    const controller = new AbortController();
    activeController = controller;
    const consumePromise = bridge.consume(source, {
      signal: controller.signal
    });

    refresh();

    try {
      await consumePromise;
    } catch (error) {
      transportError.value = error instanceof Error ? error : new Error('Bridge consume failed.');
      throw error;
    } finally {
      if (activeController === controller) {
        activeController = null;
      }

      refresh();
    }
  }

  /**
   * 重新启动一次 bridge 消费。
   */
  async function restart(nextSource?: TSource) {
    await start(nextSource);
  }

  /**
   * 手动推入一条或多条 packet。
   */
  function push(packet: TRawPacket | TRawPacket[]) {
    bridge.push(packet);
    refresh();
  }

  /**
   * 手动结束当前 packet 批次。
   */
  function flush(reason?: string) {
    bridge.flush(reason);
    refresh();
  }

  /**
   * 清空 bridge 内部状态并同步 runtime 快照。
   */
  function reset() {
    stop();
    bridge.reset();
    runtimeSnapshot.refresh();
    transportError.value = undefined;
    refresh();
  }

  /**
   * 关闭 bridge，并释放后续连接能力。
   */
  function close() {
    stop();
    bridge.close();
    refresh();
  }

  watch(
    () => options.autoStart ? options.source ? toValue(options.source) : undefined : undefined,
    (nextSource) => {
      if (nextSource === undefined || nextSource === null) {
        return;
      }

      start(nextSource).catch(() => {
        refresh();
      });
    },
    {
      immediate: true
    }
  );

  onScopeDispose(() => {
    stop();

    if (options.closeOnScopeDispose ?? true) {
      bridge.close();
      refresh();
    }
  });

  return {
    bridge,
    runtime: bridge.runtime,
    runtimeSnapshot,
    status,
    bridgeSnapshot,
    consuming: computed(() => status.value.phase === 'consuming'),
    error: computed(() => transportError.value ?? status.value.lastError),
    start,
    stop,
    restart,
    push,
    flush,
    reset,
    close,
    refresh
  };
}

/**
 * 最省事的 SSE composable。
 * 只需要给 source、protocol 和可选 assembler，就能拿到可直接驱动 UI 的 runtime 与控制方法。
 */
export function useSseBridge<TRawPacket, TSource = FetchTransportSource>(
  options: UseSseBridgeOptions<TRawPacket, TSource>
): UseSseBridgeResult<TRawPacket, TSource> {
  /**
   * 保存单次 connect 时临时覆盖的请求配置。
   */
  const requestOverride = shallowRef<SseRequestOptions<TSource>>();

  /**
   * 把默认 request 和单次覆盖 request 合并成 transport.init。
   */
  const init: NonNullable<SseTransportOptions<TRawPacket, TSource>['init']> = async (source: TSource) => {
    const resolver = createSseRequestInitResolver(
      requestOverride.value ?? options.request,
      options.transport?.init as SseTransportOptions<unknown, TSource>['init']
    );

    if (!resolver) {
      return undefined;
    }

    return typeof resolver === 'function'
      ? resolver(source)
      : resolver;
  };
  const transport: SseTransportOptions<TRawPacket, TSource> = {
    ...(options.transport?.mode !== undefined ? { mode: options.transport.mode } : {}),
    ...(options.transport?.fetch !== undefined ? { fetch: options.transport.fetch } : {}),
    ...(options.transport?.parse !== undefined ? { parse: options.transport.parse } : {}),
    init
  };

  const bridge = createBridge({
    ...options,
    transport: createSseTransport(transport)
  });

  const state = useBridgeTransport({
    bridge,
    ...(options.source !== undefined ? { source: options.source } : {}),
    ...(options.autoStart !== undefined ? { autoStart: options.autoStart } : {}),
    ...(options.resetOnStart !== undefined ? { resetOnStart: options.resetOnStart } : {}),
    ...(options.closeOnScopeDispose !== undefined ? { closeOnScopeDispose: options.closeOnScopeDispose } : {})
  });

  /**
   * 发起一次 SSE bridge 连接。
   */
  async function connect(
    source?: TSource,
    connectOptions: UseSseBridgeConnectOptions<TSource> = {}
  ) {
    requestOverride.value = connectOptions.request;

    try {
      await state.start(source);
    } finally {
      requestOverride.value = undefined;
    }
  }

  /**
   * 重新建立 SSE bridge 连接。
   */
  async function reconnect(
    source?: TSource,
    connectOptions: UseSseBridgeConnectOptions<TSource> = {}
  ) {
    await connect(source, connectOptions);
  }

  /**
   * 断开当前 SSE bridge 连接。
   */
  function disconnect() {
    state.stop();
  }

  return {
    ...state,
    connect,
    reconnect,
    disconnect
  };
}

/**
 * NDJSON 版本的 transport hook。
 */
export function useNdjsonBridge<TRawPacket, TSource = FetchTransportSource>(
  options: UseNdjsonBridgeOptions<TRawPacket, TSource>
): UseBridgeTransportResult<TRawPacket, TSource> {
  const bridge = createBridge({
    ...options,
    transport: createNdjsonTransport(options.transport)
  });

  return useBridgeTransport({
    bridge,
    ...(options.source !== undefined ? { source: options.source } : {}),
    ...(options.autoStart !== undefined ? { autoStart: options.autoStart } : {}),
    ...(options.resetOnStart !== undefined ? { resetOnStart: options.resetOnStart } : {}),
    ...(options.closeOnScopeDispose !== undefined ? { closeOnScopeDispose: options.closeOnScopeDispose } : {})
  });
}

/**
 * WebSocket 版本的 transport hook。
 */
export function useWebSocketBridge<TRawPacket, TSource = WebSocketTransportSource>(
  options: UseWebSocketBridgeOptions<TRawPacket, TSource>
): UseBridgeTransportResult<TRawPacket, TSource> {
  const bridge = createBridge({
    ...options,
    transport: createWebSocketTransport(options.transport)
  });

  return useBridgeTransport({
    bridge,
    ...(options.source !== undefined ? { source: options.source } : {}),
    ...(options.autoStart !== undefined ? { autoStart: options.autoStart } : {}),
    ...(options.resetOnStart !== undefined ? { resetOnStart: options.resetOnStart } : {}),
    ...(options.closeOnScopeDispose !== undefined ? { closeOnScopeDispose: options.closeOnScopeDispose } : {})
  });
}

/**
 * 适合本地 async generator、mock packet 流、单测输入流这类不需要真实网络连接的场景。
 */
export function useAsyncIterableBridge<
  TRawPacket,
  TSource extends AsyncIterable<TRawPacket> | Iterable<TRawPacket> =
    AsyncIterable<TRawPacket> | Iterable<TRawPacket>
>(
  options: UseAsyncIterableBridgeOptions<TRawPacket, TSource>
): UseBridgeTransportResult<TRawPacket, TSource> {
  const bridge = createBridge({
    ...options,
    transport: createAsyncIterableTransport<TRawPacket>()
  });

  return useBridgeTransport({
    bridge,
    ...(options.source !== undefined ? { source: options.source } : {}),
    ...(options.autoStart !== undefined ? { autoStart: options.autoStart } : {}),
    ...(options.resetOnStart !== undefined ? { resetOnStart: options.resetOnStart } : {}),
    ...(options.closeOnScopeDispose !== undefined ? { closeOnScopeDispose: options.closeOnScopeDispose } : {})
  });
}
