import { createBridge } from './createBridge';
import { createAgentRuntime } from './createAgentRuntime';
import type { RunSurfaceOptions } from '../surface/types';
import type {
  AgentRuntime,
  Bridge,
  BridgeOptions,
  RuntimeProtocol,
  StreamAssembler
} from './types';

/**
 * preset 内部允许覆盖的 bridge 配置。
 */
type PresetBridgeOptions<TRawPacket, TSource> = Omit<
  BridgeOptions<TRawPacket, TSource>,
  'runtime' | 'protocol' | 'assemblers'
>;

/**
 * 定义一个 preset 时可配置的静态选项。
 */
export interface AgentdownPresetOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  protocol: RuntimeProtocol<TRawPacket>;
  assemblers?: Record<string, StreamAssembler>;
  bridge?: PresetBridgeOptions<TRawPacket, TSource>;
  surface?: RunSurfaceOptions;
}

/**
 * 创建 preset 实例时可临时覆盖的配置。
 */
export interface AgentdownPresetOverrides<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  runtime?: AgentRuntime;
  protocol?: RuntimeProtocol<TRawPacket>;
  assemblers?: Record<string, StreamAssembler>;
  bridge?: PresetBridgeOptions<TRawPacket, TSource>;
  surface?: RunSurfaceOptions;
}

/**
 * preset 派生出的完整运行会话。
 */
export interface AgentdownSession<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  runtime: AgentRuntime;
  bridge: Bridge<TRawPacket, TSource>;
  protocol: RuntimeProtocol<TRawPacket>;
  surface: RunSurfaceOptions;
}

/**
 * preset 对外暴露的工厂接口。
 */
export interface AgentdownPreset<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  protocol: RuntimeProtocol<TRawPacket>;
  createRuntime(): AgentRuntime;
  createBridge(overrides?: AgentdownPresetOverrides<TRawPacket, TSource>): Bridge<TRawPacket, TSource>;
  createSession(overrides?: AgentdownPresetOverrides<TRawPacket, TSource>): AgentdownSession<TRawPacket, TSource>;
  getSurfaceOptions(overrides?: RunSurfaceOptions): RunSurfaceOptions;
}

/**
 * 合并基础 surface 配置和局部覆盖配置。
 */
function mergeSurfaceOptions(base: RunSurfaceOptions = {}, override: RunSurfaceOptions = {}): RunSurfaceOptions {
  return {
    ...base,
    ...override,
    performance: {
      ...(base.performance ?? {}),
      ...(override.performance ?? {})
    },
    aguiComponents: {
      ...(base.aguiComponents ?? {}),
      ...(override.aguiComponents ?? {})
    },
    builtinComponents: {
      ...(base.builtinComponents ?? {}),
      ...(override.builtinComponents ?? {})
    },
    renderers: {
      ...(base.renderers ?? {}),
      ...(override.renderers ?? {})
    },
    messageShells: {
      ...(base.messageShells ?? {}),
      ...(override.messageShells ?? {})
    }
  };
}

/**
 * 合并 preset 级和实例级 bridge 配置。
 */
function mergeBridgeOptions<TRawPacket, TSource>(
  base: PresetBridgeOptions<TRawPacket, TSource> = {},
  override: PresetBridgeOptions<TRawPacket, TSource> = {}
): PresetBridgeOptions<TRawPacket, TSource> {
  return {
    ...base,
    ...override,
    batch: {
      ...(base.batch ?? {}),
      ...(override.batch ?? {})
    },
    debug: {
      ...(base.debug ?? {}),
      ...(override.debug ?? {})
    },
    hooks: {
      ...(base.hooks ?? {}),
      ...(override.hooks ?? {})
    }
  };
}

/**
 * 定义一个可复用的 Agentdown preset。
 */
export function defineAgentdownPreset<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
>(
  options: AgentdownPresetOptions<TRawPacket, TSource>
): AgentdownPreset<TRawPacket, TSource> {
  const baseAssemblers = options.assemblers ?? {};
  const baseBridge = options.bridge ?? {};
  const baseSurface = options.surface ?? {};

  /**
   * 创建 preset 默认 runtime。
   */
  function createRuntime() {
    return createAgentRuntime();
  }

  /**
   * 获取合并后的 surface 渲染配置。
   */
  function getSurfaceOptions(overrides: RunSurfaceOptions = {}) {
    return mergeSurfaceOptions(baseSurface, overrides);
  }

  /**
   * 用当前 preset 配置创建 bridge，并支持局部覆盖。
   */
  function createBridgeWithOverrides(
    overrides: AgentdownPresetOverrides<TRawPacket, TSource> = {}
  ): Bridge<TRawPacket, TSource> {
    const runtime = overrides.runtime ?? createRuntime();
    const protocol = overrides.protocol ?? options.protocol;
    const bridgeOptions = mergeBridgeOptions(baseBridge, overrides.bridge);

    return createBridge<TRawPacket, TSource>({
      ...bridgeOptions,
      runtime,
      protocol,
      assemblers: {
        ...baseAssemblers,
        ...(overrides.assemblers ?? {})
      }
    });
  }

  /**
   * 一次性创建 runtime、bridge 和 surface 配置。
   */
  function createSession(
    overrides: AgentdownPresetOverrides<TRawPacket, TSource> = {}
  ): AgentdownSession<TRawPacket, TSource> {
    const runtime = overrides.runtime ?? createRuntime();
    const protocol = overrides.protocol ?? options.protocol;

    return {
      runtime,
      protocol,
      bridge: createBridgeWithOverrides({
        ...overrides,
        runtime,
        protocol
      }),
      surface: getSurfaceOptions(overrides.surface)
    };
  }

  return {
    protocol: options.protocol,
    createRuntime,
    createBridge: createBridgeWithOverrides,
    createSession,
    getSurfaceOptions
  };
}
