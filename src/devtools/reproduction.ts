import type { AgentDevtoolsReproductionExport } from '../composables/useAgentDevtools';
import { cloneValue } from '../runtime/utils';

/**
 * Devtools reproduction 支持的导入输入。
 */
export type AgentDevtoolsReproductionInput<TRawPacket = unknown> =
  | string
  | AgentDevtoolsReproductionExport<TRawPacket>;

/**
 * 单条 reproduction packet 在回放时暴露给外部的上下文。
 */
export interface AgentDevtoolsReproductionPacketContext<TRawPacket = unknown> {
  /** 当前 packet 在 reproduction 里的数组位置。 */
  index: number;
  /** 当前 packet 原始顺序号。 */
  order: number;
  /** 当前 packet 对应的事件名。 */
  eventName: string;
  /** 当前 packet 原始内容。 */
  packet: TRawPacket;
}

/**
 * 将 reproduction 转成 async iterable 回放源时的配置项。
 */
export interface CreateAgentDevtoolsReproductionStreamOptions<TRawPacket = unknown> {
  /** 所有 packet 的统一默认间隔。 */
  intervalMs?: number;
  /** 按 packet 动态决定下一条事件的播放间隔。 */
  resolveDelay?: (context: AgentDevtoolsReproductionPacketContext<TRawPacket>) => number;
  /** 外部可通过 signal 中断当前回放。 */
  signal?: AbortSignal;
}

/**
 * 判断一个值是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断一段数据是否已经是合法的 devtools reproduction。
 */
export function isAgentDevtoolsReproduction<TRawPacket = unknown>(
  value: unknown
): value is AgentDevtoolsReproductionExport<TRawPacket> {
  if (!isRecord(value)) {
    return false;
  }

  if (value.format !== 'agentdown.devtools-repro/v1' || value.schemaVersion !== 1) {
    return false;
  }

  if (!Array.isArray(value.packets)) {
    return false;
  }

  return value.packets.every((entry) =>
    isRecord(entry)
    && typeof entry.order === 'number'
    && typeof entry.eventName === 'string'
    && 'packet' in entry
  );
}

/**
 * 把 JSON 字符串或普通对象规范化成标准 reproduction 结构。
 */
export function parseAgentDevtoolsReproduction<TRawPacket = unknown>(
  input: AgentDevtoolsReproductionInput<TRawPacket>
): AgentDevtoolsReproductionExport<TRawPacket> {
  const parsed = typeof input === 'string'
    ? JSON.parse(input) as unknown
    : input;

  if (!isAgentDevtoolsReproduction<TRawPacket>(parsed)) {
    throw new Error('Invalid Agent Devtools reproduction payload.');
  }

  return cloneValue(parsed);
}

/**
 * 在需要延迟回放时等待指定毫秒数，并支持外部 abort。
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
 * 把一份 reproduction 转成可直接喂给 `useAsyncIterableBridge()` 的回放源。
 */
export async function* createAgentDevtoolsReproductionStream<TRawPacket = unknown>(
  input: AgentDevtoolsReproductionInput<TRawPacket>,
  options: CreateAgentDevtoolsReproductionStreamOptions<TRawPacket> = {}
): AsyncIterable<TRawPacket> {
  const reproduction = parseAgentDevtoolsReproduction(input);
  const defaultInterval = options.intervalMs ?? 0;

  for (const [index, entry] of reproduction.packets.entries()) {
    if (options.signal?.aborted) {
      throw new Error('Devtools reproduction playback aborted.');
    }

    const context: AgentDevtoolsReproductionPacketContext<TRawPacket> = {
      index,
      order: entry.order,
      eventName: entry.eventName,
      packet: cloneValue(entry.packet)
    };
    const resolvedDelay = options.resolveDelay?.(context) ?? defaultInterval;

    await waitWithAbort(resolvedDelay, options.signal);
    yield context.packet;
  }
}
