import { computed, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import type {
  AgentdownAdapter,
  AgentdownAdapterSession,
  AgentdownAdapterSessionOptions
} from '../runtime/defineAdapter';
import { parseRuntimeTranscript } from '../runtime/replay';
import type {
  CreateRuntimeTranscriptOptions,
  ReplayRuntimeHistoryOptions,
  RuntimeTranscript
} from '../runtime/replay';
import type {
  AgentRuntime,
  Bridge,
  BridgeError,
  BridgeSnapshot,
  BridgeStatus,
  RuntimeProtocol
} from '../runtime/types';
import type { RunSurfaceOptions } from '../surface/types';
import { useRuntimeReplayPlayer, type UseRuntimeReplayPlayerResult } from './useRuntimeReplayPlayer';
import { useRuntimeSnapshot, type UseRuntimeSnapshotResult } from './useRuntimeSnapshot';
import { useRuntimeTranscript, type UseRuntimeTranscriptResult } from './useRuntimeTranscript';

/**
 * 当前激活 transcript 的来源标签。
 */
export type AdapterSessionTranscriptSource = 'exported' | 'imported' | 'custom';

/**
 * `useAdapterSession()` 自动重连的配置。
 */
export interface UseAdapterSessionReconnectOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** 最多额外重试多少次；默认 2 次。 */
  retries?: number;
  /** 每次重试前等待多久；默认指数退避到 5 秒以内。 */
  delayMs?: number | ((input: {
    attempt: number;
    error: BridgeError<TRawPacket> | Error;
    source: TSource | undefined;
    status: BridgeStatus;
  }) => number);
  /** 是否应该继续重试；默认始终允许。 */
  shouldRetry?: (input: {
    attempt: number;
    error: BridgeError<TRawPacket> | Error;
    source: TSource | undefined;
    status: BridgeStatus;
  }) => boolean;
}

/**
 * `useAdapterSession()` 的可选行为配置。
 */
export interface UseAdapterSessionOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** 允许直接传入一个已创建好的 adapter session。 */
  session?: AgentdownAdapterSession<TRawPacket, TSource>;
  /** 如果没传 `session`，则用这些配置创建一个新 session。 */
  overrides?: AgentdownAdapterSessionOptions<TRawPacket, TSource>;
  /** 可选的响应式 source；常用于直接绑定表单、路由或请求参数。 */
  source?: MaybeRefOrGetter<TSource | null | undefined>;
  /** 是否在 setup 后立刻连接，或在 `source` 变化时自动重连。 */
  autoConnect?: boolean;
  /** transcript 导出配置。 */
  transcript?: CreateRuntimeTranscriptOptions;
  /** runtime replay 配置。 */
  replay?: ReplayRuntimeHistoryOptions;
  /** 连接失败后是否自动重试。 */
  reconnect?: false | UseAdapterSessionReconnectOptions<TRawPacket, TSource>;
  /** 当前作用域销毁时是否自动关闭 session。 */
  closeSessionOnScopeDispose?: boolean;
}

/**
 * `useAdapterSession()` 暴露给页面层的完整响应式状态。
 */
export interface UseAdapterSessionResult<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** 当前正在使用的 adapter session 实例。 */
  session: AgentdownAdapterSession<TRawPacket, TSource>;
  /** 便捷暴露的 runtime 引用。 */
  runtime: AgentRuntime;
  /** 便捷暴露的 bridge 引用。 */
  bridge: Bridge<TRawPacket, TSource>;
  /** 便捷暴露的 protocol 引用。 */
  protocol: RuntimeProtocol<TRawPacket>;
  /** 便捷暴露的 surface 配置。 */
  surface: RunSurfaceOptions;
  /** 当前 session 默认数据源。 */
  source: ShallowRef<TSource | undefined>;
  /** runtime 的响应式快照。 */
  runtimeState: UseRuntimeSnapshotResult;
  /** transcript 的响应式导出状态。 */
  transcriptState: UseRuntimeTranscriptResult;
  /** runtime replay 控制器。 */
  replay: UseRuntimeReplayPlayerResult;
  /** 当前实时导出的 transcript。 */
  exportedTranscript: ComputedRef<RuntimeTranscript>;
  /** 当前页面正在使用的 transcript。 */
  activeTranscript: ShallowRef<RuntimeTranscript>;
  /** 最近一次外部导入的 transcript。 */
  importedTranscript: ShallowRef<RuntimeTranscript | null>;
  /** 当前激活 transcript 的来源。 */
  activeTranscriptSource: ShallowRef<AdapterSessionTranscriptSource>;
  /** bridge 的响应式状态。 */
  status: ShallowRef<BridgeStatus>;
  /** bridge 的响应式调试快照。 */
  bridgeSnapshot: ShallowRef<BridgeSnapshot<TRawPacket>>;
  /** 当前是否处于消费中。 */
  consuming: ComputedRef<boolean>;
  /** 当前是否正处于自动重连等待或重试中。 */
  reconnecting: ComputedRef<boolean>;
  /** 当前已经进入第几次自动重连。 */
  reconnectAttempt: ShallowRef<number>;
  /** 最近一次连接或 bridge 报错。 */
  error: ComputedRef<BridgeError<TRawPacket> | Error | undefined>;
  /** 手动刷新 bridge 状态快照。 */
  refresh: () => {
    status: BridgeStatus;
    snapshot: BridgeSnapshot<TRawPacket>;
    error: BridgeError<TRawPacket> | Error | undefined;
  };
  /** 切回 runtime 实时导出的 transcript。 */
  useExportedTranscript: () => RuntimeTranscript;
  /** 切到最近一次导入的 transcript。 */
  useImportedTranscript: () => RuntimeTranscript | null;
  /** 显式设置当前页面使用的 transcript。 */
  loadTranscript: (transcript: RuntimeTranscript, source?: AdapterSessionTranscriptSource) => RuntimeTranscript;
  /** 解析并载入外部 transcript。 */
  importTranscript: (
    input: string | RuntimeTranscript | Record<string, unknown>,
    source?: Extract<AdapterSessionTranscriptSource, 'imported' | 'custom'>
  ) => RuntimeTranscript;
  /** 清空导入的 transcript。 */
  clearImportedTranscript: () => void;
  /** 下载当前 transcript。 */
  downloadTranscript: (transcript?: RuntimeTranscript, filename?: string) => RuntimeTranscript;
  /** 更新默认 source。 */
  setSource: (source: TSource) => void;
  /** 连接 source。 */
  connect: (source?: TSource) => Promise<void>;
  /** 中断当前连接。 */
  disconnect: () => void;
  /** 重新连接当前或新的 source。 */
  restart: (source?: TSource) => Promise<void>;
  /** 手动推入 packet。 */
  push: (packet: TRawPacket | TRawPacket[]) => void;
  /** 手动 flush 当前批次。 */
  flush: (reason?: string) => void;
  /** 重置 session。 */
  reset: () => void;
  /** 关闭 session。 */
  close: () => void;
}

/**
 * 基于 adapter 创建一个页面可直接消费的响应式 session。
 *
 * 这个 composable 的目标是把三层能力收敛在一起：
 * - adapter session 的 connect / restart / disconnect
 * - runtime snapshot / transcript / replay
 * - bridge status / error 的 Vue 响应式状态
 */
export function useAdapterSession<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
>(
  adapter: AgentdownAdapter<TRawPacket, TSource>,
  options: UseAdapterSessionOptions<TRawPacket, TSource> = {}
): UseAdapterSessionResult<TRawPacket, TSource> {
  const session = options.session ?? adapter.createSession(options.overrides);
  const runtimeState = useRuntimeSnapshot(session.runtime);
  const transcriptState = useRuntimeTranscript(session.runtime, options.transcript ?? {});
  const exportedTranscript = computed(() => transcriptState.transcript.value);
  const activeTranscript = shallowRef(exportedTranscript.value);
  const importedTranscript = shallowRef<RuntimeTranscript | null>(null);
  const activeTranscriptSource = shallowRef<AdapterSessionTranscriptSource>('exported');
  const replay = useRuntimeReplayPlayer(() => activeTranscript.value, options.replay ?? {});
  const source = shallowRef<TSource | undefined>(session.source);
  const status = shallowRef(session.status);
  const bridgeSnapshot = shallowRef(session.snapshot);
  const sessionError = shallowRef<BridgeError<TRawPacket> | Error | undefined>(session.error);
  const reconnectAttempt = shallowRef(0);
  const reconnectingState = shallowRef(false);
  let connectRunId = 0;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let resolveReconnectWait: (() => void) | null = null;

  /**
   * 清空当前等待中的重连定时器。
   */
  function clearReconnectTimer() {
    if (reconnectTimer === null) {
      return;
    }

    globalThis.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    resolveReconnectWait?.();
    resolveReconnectWait = null;
  }

  /**
   * 清空当前自动重连状态。
   */
  function resetReconnectState() {
    clearReconnectTimer();
    reconnectAttempt.value = 0;
    reconnectingState.value = false;
  }

  /**
   * 取消当前这条连接链路后续可能继续发生的自动重连。
   */
  function cancelReconnectFlow() {
    connectRunId += 1;
    resetReconnectState();
  }

  /**
   * 从 adapter session 同步一份最新 bridge 状态。
   */
  function refresh() {
    const nextStatus = session.status;
    const nextSnapshot = session.snapshot;
    const nextError = session.error;

    status.value = nextStatus;
    bridgeSnapshot.value = nextSnapshot;
    sessionError.value = nextError;

    return {
      status: nextStatus,
      snapshot: nextSnapshot,
      error: nextError
    };
  }

  /**
   * 读取自动重连配置；没开启时返回 `null`。
   */
  function resolveReconnectOptions() {
    return options.reconnect === false || options.reconnect === undefined
      ? null
      : options.reconnect;
  }

  /**
   * 计算下一次自动重连前应等待的时长。
   */
  function resolveReconnectDelay(
    reconnectOptions: UseAdapterSessionReconnectOptions<TRawPacket, TSource>,
    input: {
      attempt: number;
      error: BridgeError<TRawPacket> | Error;
      source: TSource | undefined;
      status: BridgeStatus;
    }
  ): number {
    if (typeof reconnectOptions.delayMs === 'function') {
      return Math.max(0, reconnectOptions.delayMs(input));
    }

    if (typeof reconnectOptions.delayMs === 'number') {
      return Math.max(0, reconnectOptions.delayMs);
    }

    return Math.min(1000 * 2 ** Math.max(0, input.attempt - 1), 5000);
  }

  /**
   * 等待一次自动重连延迟；如果中途被新连接打断，则直接结束当前流程。
   */
  async function waitReconnectDelay(delayMs: number, runId: number): Promise<boolean> {
    if (delayMs <= 0) {
      return runId === connectRunId;
    }

    await new Promise<void>((resolve) => {
      resolveReconnectWait = resolve;
      reconnectTimer = globalThis.setTimeout(() => {
        reconnectTimer = null;
        resolveReconnectWait = null;
        resolve();
      }, delayMs);
    });

    return runId === connectRunId;
  }

  /**
   * 执行一次带自动重连能力的连接流程。
   */
  async function executeSessionConnect(
    operation: 'connect' | 'restart',
    nextSource?: TSource
  ) {
    const resolvedReconnectOptions = resolveReconnectOptions();
    const runId = ++connectRunId;
    const resolvedSource = nextSource ?? source.value ?? session.source;
    const maxRetries = Math.max(0, resolvedReconnectOptions?.retries ?? 2);
    let attempt = 0;

    resetReconnectState();

    if (nextSource !== undefined) {
      source.value = nextSource;
    }

    refresh();

    while (true) {
      try {
        if (operation === 'connect') {
          await session.connect(resolvedSource);
        } else {
          await session.restart(resolvedSource);
        }

        runtimeState.refresh();
        break;
      } catch (error) {
        const normalizedError = error instanceof Error
          ? error
          : new Error('Adapter session consume failed.');
        sessionError.value = normalizedError;
        const { status: nextStatus } = refresh();

        if (!resolvedReconnectOptions) {
          throw normalizedError;
        }

        attempt += 1;

        const shouldRetry = attempt <= maxRetries && (
          resolvedReconnectOptions.shouldRetry?.({
            attempt,
            error: normalizedError,
            source: resolvedSource,
            status: nextStatus
          })
          ?? true
        );

        if (!shouldRetry) {
          throw normalizedError;
        }

        reconnectAttempt.value = attempt;
        reconnectingState.value = true;

        const delayMs = resolveReconnectDelay(resolvedReconnectOptions, {
          attempt,
          error: normalizedError,
          source: resolvedSource,
          status: nextStatus
        });
        const shouldContinue = await waitReconnectDelay(delayMs, runId);

        if (!shouldContinue) {
          return;
        }
      } finally {
        source.value = session.source;
        refresh();
      }
    }

    if (runId === connectRunId) {
      resetReconnectState();
    }
  }

  /**
   * 切回当前 runtime 实时导出的 transcript。
   */
  function useExportedTranscript() {
    const nextTranscript = exportedTranscript.value;
    activeTranscript.value = nextTranscript;
    activeTranscriptSource.value = 'exported';
    return nextTranscript;
  }

  /**
   * 显式设置当前要使用的 transcript。
   */
  function loadTranscript(
    transcript: RuntimeTranscript,
    sourceType: AdapterSessionTranscriptSource = 'custom'
  ) {
    activeTranscript.value = transcript;
    activeTranscriptSource.value = sourceType;
    return transcript;
  }

  /**
   * 使用最近一次导入的 transcript 作为当前页面视图源。
   */
  function useImportedTranscript() {
    if (!importedTranscript.value) {
      return null;
    }

    return loadTranscript(importedTranscript.value, 'imported');
  }

  /**
   * 解析并载入外部 transcript 内容。
   */
  function importTranscript(
    input: string | RuntimeTranscript | Record<string, unknown>,
    sourceType: Extract<AdapterSessionTranscriptSource, 'imported' | 'custom'> = 'imported'
  ) {
    const nextTranscript = parseRuntimeTranscript(input, options.transcript ?? {});

    if (sourceType === 'imported') {
      importedTranscript.value = nextTranscript;
    }

    return loadTranscript(nextTranscript, sourceType);
  }

  /**
   * 清空当前缓存的导入 transcript。
   */
  function clearImportedTranscript() {
    importedTranscript.value = null;

    if (activeTranscriptSource.value === 'imported') {
      useExportedTranscript();
    }
  }

  /**
   * 下载当前激活的 transcript JSON。
   */
  function downloadTranscript(
    transcript: RuntimeTranscript = activeTranscript.value,
    filename?: string
  ) {
    const blob = new Blob([JSON.stringify(transcript, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename
      ?? (
        activeTranscriptSource.value === 'imported'
          ? 'agentdown-transcript-imported.json'
          : 'agentdown-transcript.json'
      );
    link.click();
    URL.revokeObjectURL(url);

    return transcript;
  }

  /**
   * 同步更新 session 默认 source。
   */
  function setSource(nextSource: TSource) {
    session.setSource(nextSource);
    source.value = nextSource;
    refresh();
  }

  /**
   * 连接当前或新的 source。
   */
  async function connect(nextSource?: TSource) {
    await executeSessionConnect('connect', nextSource);
  }

  /**
   * 中断当前连接。
   */
  function disconnect() {
    cancelReconnectFlow();
    session.disconnect();
    refresh();
  }

  /**
   * 重新连接当前或新的 source。
   */
  async function restart(nextSource?: TSource) {
    await executeSessionConnect('restart', nextSource);
  }

  /**
   * 手动推入一条或多条 packet。
   */
  function push(packet: TRawPacket | TRawPacket[]) {
    session.push(packet);
    refresh();
  }

  /**
   * 立即把当前批次 flush 到 runtime。
   */
  function flush(reason?: string) {
    session.flush(reason);
    runtimeState.refresh();
    refresh();
  }

  /**
   * 重置当前 session，并保持 runtime / bridge / transcript 状态同步。
   */
  function reset() {
    cancelReconnectFlow();
    session.reset();
    runtimeState.refresh();
    refresh();

    if (activeTranscriptSource.value === 'exported') {
      useExportedTranscript();
    }
  }

  /**
   * 关闭当前 session。
   */
  function close() {
    cancelReconnectFlow();
    replay.pause();
    session.close();
    refresh();
  }

  watch(
    () => options.autoConnect
      ? options.source
        ? toValue(options.source)
        : session.source
      : undefined,
    (nextSource) => {
      if (nextSource === undefined || nextSource === null) {
        return;
      }

      connect(nextSource).catch(() => {
        refresh();
      });
    },
    {
      immediate: true
    }
  );

  onScopeDispose(() => {
    cancelReconnectFlow();
    replay.pause();

    if (options.closeSessionOnScopeDispose ?? true) {
      session.close();
      refresh();
    }
  });

  return {
    session,
    runtime: session.runtime,
    bridge: session.bridge,
    protocol: session.protocol,
    surface: session.surface,
    source,
    runtimeState,
    transcriptState,
    replay,
    exportedTranscript,
    activeTranscript,
    importedTranscript,
    activeTranscriptSource,
    status,
    bridgeSnapshot,
    consuming: computed(() => status.value.phase === 'consuming'),
    reconnecting: computed(() => reconnectingState.value),
    reconnectAttempt,
    error: computed(() => sessionError.value),
    refresh,
    useExportedTranscript,
    useImportedTranscript,
    loadTranscript,
    importTranscript,
    clearImportedTranscript,
    downloadTranscript,
    setSource,
    connect,
    disconnect,
    restart,
    push,
    flush,
    reset,
    close
  };
}
