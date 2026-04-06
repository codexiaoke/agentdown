import type { RunSurfaceOptions } from '../surface/types';
import { defineAgentdownPreset } from './definePreset';
import type {
  AgentRuntime,
  Bridge,
  BridgeError,
  BridgeOptions,
  BridgeSnapshot,
  BridgeStatus,
  RuntimeProtocol,
  StreamAssembler,
  TransportAdapter
} from './types';

/**
 * adapter 层允许暴露给用户的 bridge 静态配置。
 */
export type AgentdownAdapterBridgeOptions<TRawPacket, TSource> = Omit<
  BridgeOptions<TRawPacket, TSource>,
  'runtime' | 'protocol' | 'assemblers'
>;

/**
 * 定义一个 adapter 时可配置的静态选项。
 */
export interface AgentdownAdapterOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** adapter 的显示名，便于调试和后续 starter 区分。 */
  name?: string;
  /** 原始事件到 runtime command 的主协议。 */
  protocol: RuntimeProtocol<TRawPacket>;
  /** adapter 默认可用的 stream assembler 集合。 */
  assemblers?: Record<string, StreamAssembler>;
  /** adapter 默认 bridge 配置。 */
  bridge?: AgentdownAdapterBridgeOptions<TRawPacket, TSource>;
  /** 顶层 transport 简写；等价于写到 `bridge.transport`。 */
  transport?: TransportAdapter<TSource, TRawPacket>;
  /** adapter 默认 surface 渲染配置。 */
  surface?: RunSurfaceOptions;
}

/**
 * 创建 bridge 时可临时覆盖的 adapter 配置。
 */
export interface AgentdownAdapterOverrides<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** 允许显式复用外部 runtime。 */
  runtime?: AgentRuntime;
  /** 允许替换当前会话使用的主协议。 */
  protocol?: RuntimeProtocol<TRawPacket>;
  /** 允许补充或覆写可用 assembler。 */
  assemblers?: Record<string, StreamAssembler>;
  /** 局部 bridge 配置。 */
  bridge?: AgentdownAdapterBridgeOptions<TRawPacket, TSource>;
  /** 顶层 transport 简写；优先级低于 `bridge.transport`。 */
  transport?: TransportAdapter<TSource, TRawPacket>;
  /** 局部 surface 覆盖。 */
  surface?: RunSurfaceOptions;
}

/**
 * 创建 adapter session 时额外支持的连接选项。
 */
export interface AgentdownAdapterSessionOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> extends AgentdownAdapterOverrides<TRawPacket, TSource> {
  /** 默认要消费的数据源，可在后续 `connect()` 时省略。 */
  source?: TSource;
  /** 每次 `connect()` 前是否先重置 bridge 和 runtime。 */
  resetOnConnect?: boolean;
}

/**
 * adapter session 对外暴露的运行期控制接口。
 */
export interface AgentdownAdapterSession<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** 当前会话使用的 runtime。 */
  runtime: AgentRuntime;
  /** 当前会话使用的 bridge。 */
  bridge: Bridge<TRawPacket, TSource>;
  /** 当前会话使用的协议。 */
  protocol: RuntimeProtocol<TRawPacket>;
  /** 当前会话应传给 RunSurface 的 surface 配置。 */
  surface: RunSurfaceOptions;
  /** 当前默认连接源。 */
  readonly source: TSource | undefined;
  /** 当前 bridge 状态的即时快照。 */
  readonly status: BridgeStatus;
  /** 当前 bridge 调试快照。 */
  readonly snapshot: BridgeSnapshot<TRawPacket>;
  /** 最近一次连接或 bridge 产生的错误。 */
  readonly error: BridgeError<TRawPacket> | Error | undefined;
  /** 更新默认数据源，供后续 `connect()` / `restart()` 复用。 */
  setSource(source: TSource): void;
  /** 消费指定 source；不传时复用当前 session.source。 */
  connect(source?: TSource): Promise<void>;
  /** 中断当前消费流程。 */
  disconnect(): void;
  /** 重新消费一次 source。 */
  restart(source?: TSource): Promise<void>;
  /** 手动推入 packet。 */
  push(packet: TRawPacket | TRawPacket[]): void;
  /** 立即把当前批次 flush 到 runtime。 */
  flush(reason?: string): void;
  /** 重置 bridge / runtime，并清空 session 错误。 */
  reset(): void;
  /** 关闭当前 session。 */
  close(): void;
}

/**
 * adapter 工厂对外暴露的核心接口。
 */
export interface AgentdownAdapter<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  /** adapter 的显示名。 */
  name: string;
  /** 当前 adapter 默认主协议。 */
  protocol: RuntimeProtocol<TRawPacket>;
  /** 创建一个新的 runtime。 */
  createRuntime(): AgentRuntime;
  /** 创建一个 bridge，但不附带连接控制。 */
  createBridge(overrides?: AgentdownAdapterOverrides<TRawPacket, TSource>): Bridge<TRawPacket, TSource>;
  /** 创建一个带 `connect()` / `disconnect()` 的完整会话。 */
  createSession(
    overrides?: AgentdownAdapterSessionOptions<TRawPacket, TSource>
  ): AgentdownAdapterSession<TRawPacket, TSource>;
  /** 获取合并后的 surface 配置。 */
  getSurfaceOptions(overrides?: RunSurfaceOptions): RunSurfaceOptions;
}

/**
 * 把顶层 `transport` 简写合并回 `bridge.transport`。
 *
 * 显式传入的 `bridge.transport` 优先级最高，
 * 只有没写时才会回退到顶层 `transport`。
 */
function mergeBridgeTransport<TRawPacket, TSource>(
  bridge: AgentdownAdapterBridgeOptions<TRawPacket, TSource> | undefined,
  transport: TransportAdapter<TSource, TRawPacket> | undefined
): AgentdownAdapterBridgeOptions<TRawPacket, TSource> | undefined {
  if (bridge?.transport !== undefined || transport === undefined) {
    return bridge;
  }

  return {
    ...(bridge ?? {}),
    transport
  };
}

/**
 * 统一解析当前这次连接真正要使用的数据源。
 */
function resolveAdapterSource<TSource>(
  preferred: TSource | undefined,
  fallback: TSource | undefined
): TSource {
  if (preferred !== undefined) {
    return preferred;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error('Adapter source is required before calling connect().');
}

/**
 * 把任意异常规范成 Error，避免上层处理 unknown。
 */
function normalizeAdapterError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Adapter session consume failed.');
}

/**
 * 定义一个带连接控制能力的 adapter。
 *
 * 这层是对 `defineAgentdownPreset()` 的轻量升级：
 * - 保留底层 runtime / bridge / protocol 能力
 * - 额外提供 `session.connect()` / `disconnect()` / `restart()`
 * - 让 transport/source 的常见接法更顺手
 */
export function defineAdapter<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
>(
  options: AgentdownAdapterOptions<TRawPacket, TSource>
): AgentdownAdapter<TRawPacket, TSource> {
  const baseBridge = mergeBridgeTransport(options.bridge, options.transport);
  const preset = defineAgentdownPreset<TRawPacket, TSource>({
    protocol: options.protocol,
    ...(options.assemblers ? { assemblers: options.assemblers } : {}),
    ...(baseBridge ? { bridge: baseBridge } : {}),
    ...(options.surface ? { surface: options.surface } : {})
  });
  const adapterName = options.name ?? 'adapter';

  /**
   * 创建一个带连接生命周期的 adapter session。
   */
  function createSession(
    overrides: AgentdownAdapterSessionOptions<TRawPacket, TSource> = {}
  ): AgentdownAdapterSession<TRawPacket, TSource> {
    const bridgeOverrides = mergeBridgeTransport(overrides.bridge, overrides.transport);
    const session = preset.createSession({
      ...(overrides.runtime ? { runtime: overrides.runtime } : {}),
      ...(overrides.protocol ? { protocol: overrides.protocol } : {}),
      ...(overrides.assemblers ? { assemblers: overrides.assemblers } : {}),
      ...(bridgeOverrides ? { bridge: bridgeOverrides } : {}),
      ...(overrides.surface ? { surface: overrides.surface } : {})
    });
    let currentSource = overrides.source;
    let activeController: AbortController | null = null;
    let sessionError: BridgeError<TRawPacket> | Error | undefined;
    let closed = false;

    /**
     * 中断当前活动连接，但不重置 runtime 内容。
     */
    function disconnect() {
      activeController?.abort();
      activeController = null;
    }

    /**
     * 消费一个 source；如果没传，则复用当前 session.source。
     */
    async function connect(nextSource?: TSource) {
      if (closed) {
        throw new Error(`Adapter session "${adapterName}" is already closed.`);
      }

      const source = resolveAdapterSource(nextSource, currentSource);
      currentSource = source;
      disconnect();
      sessionError = undefined;

      if (overrides.resetOnConnect) {
        session.bridge.reset();
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        await session.bridge.consume(source, {
          signal: controller.signal
        });
      } catch (error) {
        sessionError = normalizeAdapterError(error);
        throw sessionError;
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
      }
    }

    /**
     * 重新执行一次连接流程；如果传入了 source，也会同时更新默认源。
     */
    async function restart(nextSource?: TSource) {
      if (nextSource !== undefined) {
        currentSource = nextSource;
      }

      await connect(currentSource);
    }

    /**
     * 手动推入一条或多条 packet。
     */
    function push(packet: TRawPacket | TRawPacket[]) {
      session.bridge.push(packet);
    }

    /**
     * 立即把当前积压命令落入 runtime。
     */
    function flush(reason?: string) {
      session.bridge.flush(reason);
    }

    /**
     * 清空当前 bridge / runtime，并重置 session 错误态。
     */
    function reset() {
      disconnect();
      session.bridge.reset();
      sessionError = undefined;
    }

    /**
     * 彻底关闭当前 session。
     */
    function close() {
      disconnect();
      session.bridge.close();
      sessionError = undefined;
      closed = true;
    }

    return {
      runtime: session.runtime,
      bridge: session.bridge,
      protocol: session.protocol,
      surface: session.surface,
      get source() {
        return currentSource;
      },
      get status() {
        return session.bridge.status();
      },
      get snapshot() {
        return session.bridge.snapshot();
      },
      get error() {
        return sessionError ?? session.bridge.status().lastError;
      },
      setSource(source: TSource) {
        currentSource = source;
      },
      connect,
      disconnect,
      restart,
      push,
      flush,
      reset,
      close
    };
  }

  return {
    name: adapterName,
    protocol: options.protocol,
    createRuntime() {
      return preset.createRuntime();
    },
    createBridge(overrides: AgentdownAdapterOverrides<TRawPacket, TSource> = {}) {
      const bridgeOverrides = mergeBridgeTransport(overrides.bridge, overrides.transport);

      return preset.createBridge({
        ...(overrides.runtime ? { runtime: overrides.runtime } : {}),
        ...(overrides.protocol ? { protocol: overrides.protocol } : {}),
        ...(overrides.assemblers ? { assemblers: overrides.assemblers } : {}),
        ...(bridgeOverrides ? { bridge: bridgeOverrides } : {}),
        ...(overrides.surface ? { surface: overrides.surface } : {})
      });
    },
    createSession,
    getSurfaceOptions(overrides?: RunSurfaceOptions) {
      return preset.getSurfaceOptions(overrides);
    }
  };
}
