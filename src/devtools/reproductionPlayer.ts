import { createAgentRuntime } from '../runtime/createAgentRuntime';
import { createBridge } from '../runtime/createBridge';
import type {
  AgentRuntime,
  Bridge,
  BridgeHooks,
  BridgeSnapshot,
  RuntimeProtocol,
  RuntimeSnapshot,
  StreamAssembler
} from '../runtime/types';
import {
  parseAgentDevtoolsReproduction,
  type AgentDevtoolsReproductionInput,
  type AgentDevtoolsReproductionPacketContext
} from './reproduction';

/**
 * reproduction player 当前所处的回放状态。
 */
type AgentDevtoolsReproductionPlayerStatus = 'idle' | 'playing' | 'completed';

/**
 * 单步推进后暴露给外部的结果快照。
 */
export interface AgentDevtoolsReproductionStepResult<TRawPacket = unknown> {
  /** 当前推进到的 packet 下标，基于 1。 */
  index: number;
  /** 当前刚刚执行的 packet。 */
  entry: AgentDevtoolsReproductionPacketContext<TRawPacket>;
  /** 当前 runtime 快照。 */
  snapshot: RuntimeSnapshot;
  /** 当前 bridge 调试快照。 */
  bridgeSnapshot: BridgeSnapshot<TRawPacket>;
}

/**
 * 自动播放 reproduction 时的控制参数。
 */
export interface AgentDevtoolsReproductionPlayOptions<TRawPacket = unknown> {
  /** 每一步之间的默认延迟。 */
  intervalMs?: number;
  /** 外部可通过 signal 中断当前播放。 */
  signal?: AbortSignal;
  /** 每一步完成后触发一次回调。 */
  onStep?: (result: AgentDevtoolsReproductionStepResult<TRawPacket>) => void;
}

/**
 * 创建 reproduction player 时需要的配置。
 */
export interface CreateAgentDevtoolsReproductionPlayerOptions<TRawPacket = unknown> {
  /** 当前 packet 序列要使用的协议映射。 */
  protocol: RuntimeProtocol<TRawPacket>;
  /** 当前协议依赖的 assembler 集合。 */
  assemblers?: Record<string, StreamAssembler>;
  /** 当前回放要复用的 runtime；不传时自动创建。 */
  runtime?: AgentRuntime;
  /** 当前回放额外需要的 bridge hooks。 */
  hooks?: BridgeHooks<TRawPacket>;
  /** 是否保留 bridge 调试日志。 */
  debug?: {
    recordRawPackets?: boolean;
    recordMappedCommands?: boolean;
    maxEntries?: number;
  };
}

/**
 * 可编程的 reproduction packet 回放播放器。
 */
export interface AgentDevtoolsReproductionPlayer<TRawPacket = unknown> {
  /** 当前驱动 runtime 的 bridge。 */
  readonly bridge: Bridge<TRawPacket>;
  /** 当前回放所使用的 runtime。 */
  readonly runtime: AgentRuntime;
  /** 返回完整 packet 序列。 */
  packets(): AgentDevtoolsReproductionPacketContext<TRawPacket>[];
  /** 返回当前已经执行到的 packet。 */
  current(): AgentDevtoolsReproductionPacketContext<TRawPacket> | null;
  /** 返回已经执行过的 packet 列表。 */
  played(): AgentDevtoolsReproductionPacketContext<TRawPacket>[];
  /** 当前已经执行到第几条 packet。 */
  position(): number;
  /** 当前总 packet 数。 */
  total(): number;
  /** 当前播放器状态。 */
  status(): AgentDevtoolsReproductionPlayerStatus;
  /** 当前 runtime 快照。 */
  snapshot(): RuntimeSnapshot;
  /** 当前 bridge 调试快照。 */
  bridgeSnapshot(): BridgeSnapshot<TRawPacket>;
  /** 回到起点。 */
  reset(): RuntimeSnapshot;
  /** 直接跳到指定位置。 */
  seek(position: number): RuntimeSnapshot;
  /** 单步推进一条或多条 packet。 */
  step(count?: number): AgentDevtoolsReproductionStepResult<TRawPacket>[];
  /** 自动播放剩余 packet。 */
  play(options?: AgentDevtoolsReproductionPlayOptions<TRawPacket>): Promise<void>;
}

/**
 * 在自动播放时等待指定毫秒数，并支持外部 abort。
 */
function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }

  if (signal?.aborted) {
    return Promise.reject(new Error('Devtools reproduction playback aborted.'));
  }

  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', handleAbort);
      reject(new Error('Devtools reproduction playback aborted.'));
    }

    signal?.addEventListener('abort', handleAbort, {
      once: true
    });
  });
}

/**
 * 创建一个可以直接 step / play 的 reproduction player。
 */
export function createAgentDevtoolsReproductionPlayer<TRawPacket = unknown>(
  input: AgentDevtoolsReproductionInput<TRawPacket>,
  options: CreateAgentDevtoolsReproductionPlayerOptions<TRawPacket>
): AgentDevtoolsReproductionPlayer<TRawPacket> {
  const reproduction = parseAgentDevtoolsReproduction(input);
  const runtime = options.runtime ?? createAgentRuntime();
  const bridge = createBridge<TRawPacket>({
    runtime,
    protocol: options.protocol,
    scheduler: 'sync',
    ...(options.assemblers ? { assemblers: options.assemblers } : {}),
    ...(options.hooks ? { hooks: options.hooks } : {}),
    debug: {
      recordRawPackets: options.debug?.recordRawPackets ?? true,
      recordMappedCommands: options.debug?.recordMappedCommands ?? true,
      maxEntries: options.debug?.maxEntries ?? 40
    }
  });
  const packets = reproduction.packets.map((entry, index) => ({
    index,
    order: entry.order,
    eventName: entry.eventName,
    packet: entry.packet
  }));
  let cursor = 0;
  let playbackStatus: AgentDevtoolsReproductionPlayerStatus = packets.length === 0
    ? 'completed'
    : 'idle';

  /**
   * 根据当前 cursor 同步播放状态。
   */
  function syncStatus() {
    playbackStatus = cursor >= packets.length
      ? 'completed'
      : 'idle';
  }

  return {
    bridge,
    runtime,
    /**
     * 返回当前完整 packet 序列。
     */
    packets() {
      return [...packets];
    },
    /**
     * 返回当前已经播放到的最后一条 packet。
     */
    current() {
      return cursor > 0 ? packets[cursor - 1] ?? null : null;
    },
    /**
     * 返回当前已经播放过的 packet 列表。
     */
    played() {
      return packets.slice(0, cursor);
    },
    /**
     * 返回当前已经播放到第几条 packet。
     */
    position() {
      return cursor;
    },
    /**
     * 返回当前总 packet 数。
     */
    total() {
      return packets.length;
    },
    /**
     * 返回当前播放器状态。
     */
    status() {
      return playbackStatus;
    },
    /**
     * 返回当前 runtime 快照。
     */
    snapshot() {
      return runtime.snapshot();
    },
    /**
     * 返回当前 bridge 调试快照。
     */
    bridgeSnapshot() {
      return bridge.snapshot();
    },
    /**
     * 把当前回放重置回起点。
     */
    reset() {
      bridge.reset();
      cursor = 0;
      playbackStatus = packets.length === 0 ? 'completed' : 'idle';
      return runtime.snapshot();
    },
    /**
     * 直接回放到指定位置。
     */
    seek(position: number) {
      this.reset();
      this.step(position);
      return runtime.snapshot();
    },
    /**
     * 单步推进一条或多条 packet。
     */
    step(count = 1) {
      const results: AgentDevtoolsReproductionStepResult<TRawPacket>[] = [];

      for (let index = 0; index < count; index += 1) {
        const nextPacket = packets[cursor];

        if (!nextPacket) {
          syncStatus();
          break;
        }

        bridge.push(nextPacket.packet);
        bridge.flush('devtools-reproduction-step');
        cursor += 1;

        const result: AgentDevtoolsReproductionStepResult<TRawPacket> = {
          index: cursor,
          entry: nextPacket,
          snapshot: runtime.snapshot(),
          bridgeSnapshot: bridge.snapshot()
        };

        results.push(result);
      }

      syncStatus();
      return results;
    },
    /**
     * 按固定节奏自动播放剩余 packet。
     */
    async play(playOptions: AgentDevtoolsReproductionPlayOptions<TRawPacket> = {}) {
      if (cursor >= packets.length) {
        playbackStatus = 'completed';
        return;
      }

      playbackStatus = 'playing';

      try {
        while (cursor < packets.length) {
          if (playOptions.signal?.aborted) {
            throw new Error('Devtools reproduction playback aborted.');
          }

          const [result] = this.step(1);

          if (result) {
            playOptions.onStep?.(result);
          }

          if (cursor >= packets.length) {
            playbackStatus = 'completed';
            return;
          }

          await waitWithAbort(playOptions.intervalMs ?? 220, playOptions.signal);
        }
      } finally {
        if (playbackStatus !== 'completed') {
          syncStatus();
        }
      }
    }
  };
}
