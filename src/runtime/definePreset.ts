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

type PresetBridgeOptions<TRawPacket, TSource> = Omit<
  BridgeOptions<TRawPacket, TSource>,
  'runtime' | 'protocol' | 'assemblers'
>;

export interface AgentdownPresetOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  protocol: RuntimeProtocol<TRawPacket>;
  assemblers?: Record<string, StreamAssembler>;
  bridge?: PresetBridgeOptions<TRawPacket, TSource>;
  surface?: RunSurfaceOptions;
}

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

export interface AgentdownSession<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  runtime: AgentRuntime;
  bridge: Bridge<TRawPacket, TSource>;
  protocol: RuntimeProtocol<TRawPacket>;
  surface: RunSurfaceOptions;
}

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

function mergeSurfaceOptions(base: RunSurfaceOptions = {}, override: RunSurfaceOptions = {}): RunSurfaceOptions {
  return {
    ...base,
    ...override,
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

export function defineAgentdownPreset<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
>(
  options: AgentdownPresetOptions<TRawPacket, TSource>
): AgentdownPreset<TRawPacket, TSource> {
  const baseAssemblers = options.assemblers ?? {};
  const baseBridge = options.bridge ?? {};
  const baseSurface = options.surface ?? {};

  function createRuntime() {
    return createAgentRuntime();
  }

  function getSurfaceOptions(overrides: RunSurfaceOptions = {}) {
    return mergeSurfaceOptions(baseSurface, overrides);
  }

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
