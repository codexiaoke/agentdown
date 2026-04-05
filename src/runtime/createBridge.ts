import { createAgentRuntime } from './createAgentRuntime';
import type {
  AssemblerContext,
  Bridge,
  BridgeError,
  BridgeOptions,
  BridgeSnapshot,
  BridgeStatus,
  RuntimeCommand,
  StreamAssembler
} from './types';
import { coalesceStreamDeltas, createIdFactory, isAsyncIterable, isIterable, toArray, toAsyncIterable, trimLog } from './utils';

/**
 * 构造带阶段信息的 bridge 错误对象。
 */
function createBridgeError<TRawPacket>(
  stage: BridgeError<TRawPacket>['stage'],
  message: string,
  extra: {
    packet?: TRawPacket;
    command?: RuntimeCommand;
    cause?: unknown;
  } = {}
): BridgeError<TRawPacket> {
  const error = new Error(message) as BridgeError<TRawPacket>;
  error.name = 'AgentdownBridgeError';
  error.stage = stage;

  if (extra.packet !== undefined) {
    error.packet = extra.packet;
  }

  if (extra.command !== undefined) {
    error.command = extra.command;
  }

  if (extra.cause !== undefined) {
    error.cause = extra.cause;
  }

  return error;
}

/**
 * 把 scheduler 配置统一转换成可执行调度器。
 */
function createSchedulerRunner(scheduler: BridgeOptions['scheduler']) {
  /**
   * 根据当前调度策略安排一次 flush。
   */
  return function schedule(flush: () => void): void | (() => void) {
    if (scheduler === 'sync') {
      flush();
      return undefined;
    }

    if (scheduler === 'microtask' || scheduler === undefined) {
      queueMicrotask(flush);
      return undefined;
    }

    if (scheduler === 'animation-frame') {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        const frameId = globalThis.requestAnimationFrame(() => flush());
        return () => globalThis.cancelAnimationFrame(frameId);
      }

      const timeoutId = globalThis.setTimeout(flush, 16);
      return () => globalThis.clearTimeout(timeoutId);
    }

    return scheduler(flush);
  };
}

/**
 * 创建一个负责消费 packet、展开 stream、批量 flush 的 bridge。
 */
export function createBridge<TRawPacket = unknown, TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>>(
  options: BridgeOptions<TRawPacket, TSource>
): Bridge<TRawPacket, TSource> {
  const runtime = options.runtime ?? createAgentRuntime();
  const protocol = options.protocol;
  const transport = options.transport;
  const assemblers = options.assemblers ?? {};
  const runScheduler = createSchedulerRunner(options.scheduler);
  const batchOptions = {
    maxCommands: options.batch?.maxCommands ?? 200,
    maxLatencyMs: options.batch?.maxLatencyMs ?? 16,
    coalesceStreamDeltas: options.batch?.coalesceStreamDeltas ?? true
  };
  const debugOptions = {
    recordRawPackets: options.debug?.recordRawPackets ?? false,
    recordMappedCommands: options.debug?.recordMappedCommands ?? false,
    maxEntries: options.debug?.maxEntries
  };
  const makeId = createIdFactory();
  const assemblerContext: AssemblerContext = {
    now: () => Date.now(),
    makeId
  };
  const protocolContext = {
    now: () => Date.now(),
    makeId
  };
  const pendingCommands: RuntimeCommand[] = [];
  const rawPackets: TRawPacket[] = [];
  const mappedCommands: RuntimeCommand[][] = [];
  const streamAssemblerById = new Map<string, string>();

  let phase: BridgeStatus['phase'] = 'idle';
  let scheduled = false;
  let scheduleCleanup: void | (() => void);
  let latencyTimer: number | undefined;
  let lastFlushAt: number | undefined;
  let lastError: BridgeError<TRawPacket> | undefined;

  /**
   * 清理当前已注册的调度器和延迟 flush 定时器。
   */
  function clearScheduling() {
    scheduled = false;

    if (scheduleCleanup) {
      scheduleCleanup();
      scheduleCleanup = undefined;
    }

    if (latencyTimer !== undefined) {
      globalThis.clearTimeout(latencyTimer);
      latencyTimer = undefined;
    }
  }

  /**
   * 统一记录 bridge 错误并抛出。
   */
  function handleError(error: BridgeError<TRawPacket>): never {
    lastError = error;
    phase = 'errored';
    options.hooks?.onError?.(error);
    throw error;
  }

  /**
   * 在批量阈值或延迟阈值内安排下一次 flush。
   */
  function scheduleFlush() {
    if (pendingCommands.length === 0) {
      return;
    }

    if (!scheduled) {
      scheduled = true;
      scheduleCleanup = runScheduler(() => {
        scheduled = false;
        scheduleCleanup = undefined;
        flush('scheduled');
      });
    }

    if (batchOptions.maxLatencyMs > 0 && latencyTimer === undefined) {
      latencyTimer = globalThis.setTimeout(() => {
        latencyTimer = undefined;
        flush('max-latency');
      }, batchOptions.maxLatencyMs);
    }
  }

  /**
   * 把一批命令放入待 flush 队列。
   */
  function enqueue(commands: RuntimeCommand[]) {
    pendingCommands.push(...commands);

    if (pendingCommands.length >= batchOptions.maxCommands) {
      flush('max-commands');
      return;
    }

    scheduleFlush();
  }

  /**
   * 根据 streamId 找到当前正在处理它的 assembler。
   */
  function resolveAssembler(command: Extract<RuntimeCommand, { type: 'stream.delta' | 'stream.close' | 'stream.abort' }>): StreamAssembler {
    const assemblerName = streamAssemblerById.get(command.streamId);

    if (!assemblerName) {
      handleError(
        createBridgeError('stream', `No active stream session for "${command.streamId}".`, {
          command
        })
      );
    }

    const assembler = assemblers[assemblerName];

    if (!assembler) {
      handleError(
        createBridgeError('stream', `Assembler "${assemblerName}" is not registered.`, {
          command
        })
      );
    }

    return assembler;
  }

  /**
   * 展开一条命令，必要时交给 assembler 继续转换。
   */
  function expandCommand(command: RuntimeCommand): RuntimeCommand[] {
    switch (command.type) {
      case 'stream.open': {
        if (streamAssemblerById.has(command.streamId)) {
          handleError(
            createBridgeError('stream', `Stream "${command.streamId}" is already open.`, {
              command
            })
          );
        }

        const assembler = assemblers[command.assembler];

        if (!assembler) {
          handleError(
            createBridgeError('stream', `Assembler "${command.assembler}" is not registered.`, {
              command
            })
          );
        }

        streamAssemblerById.set(command.streamId, command.assembler);
        return toArray(assembler.open(command, assemblerContext));
      }
      case 'stream.delta':
        return toArray(resolveAssembler(command).delta(command, assemblerContext));
      case 'stream.close': {
        const expanded = toArray(resolveAssembler(command).close(command, assemblerContext));
        streamAssemblerById.delete(command.streamId);
        return expanded;
      }
      case 'stream.abort': {
        const assembler = resolveAssembler(command);
        const expanded = toArray(assembler.abort?.(command, assemblerContext));
        streamAssemblerById.delete(command.streamId);
        return expanded.filter((value): value is RuntimeCommand => value !== undefined);
      }
      default:
        return [command];
    }
  }

  /**
   * 对待执行命令做合并和 stream 展开。
   */
  function normalizeQueuedCommands() {
    const commands = batchOptions.coalesceStreamDeltas
      ? coalesceStreamDeltas(pendingCommands)
      : [...pendingCommands];

    pendingCommands.splice(0, pendingCommands.length);
    const expanded: RuntimeCommand[] = [];

    for (const command of commands) {
      expanded.push(...expandCommand(command));
    }

    return expanded;
  }

  /**
   * 记录一条原始 packet 调试日志。
   */
  function recordPacket(packet: TRawPacket) {
    if (!debugOptions.recordRawPackets) {
      return;
    }

    rawPackets.push(packet);

    if (debugOptions.maxEntries) {
      rawPackets.splice(0, Math.max(0, rawPackets.length - debugOptions.maxEntries));
    }
  }

  /**
   * 记录一组映射后的命令调试日志。
   */
  function recordMapped(commands: RuntimeCommand[]) {
    if (!debugOptions.recordMappedCommands) {
      return;
    }

    mappedCommands.push(commands);

    if (debugOptions.maxEntries) {
      mappedCommands.splice(0, Math.max(0, mappedCommands.length - debugOptions.maxEntries));
    }
  }

  /**
   * 处理单条 packet：协议映射、调试记录、入队等待 flush。
   */
  function pushPacket(packet: TRawPacket) {
    options.hooks?.onPacket?.(packet);
    recordPacket(packet);

    let commands: RuntimeCommand[];

    try {
      commands = toArray(protocol.map({ packet, context: protocolContext }));
    } catch (cause) {
      handleError(
        createBridgeError('protocol', 'Protocol mapping failed.', {
          packet,
          cause
        })
      );
    }

    options.hooks?.onMapped?.(commands, packet);
    recordMapped(commands);
    enqueue(commands);
  }

  /**
   * 把当前待处理命令真正应用到 runtime。
   */
  function flush(reason = 'manual') {
    if (pendingCommands.length === 0) {
      clearScheduling();
      return;
    }

    clearScheduling();

    let expanded: RuntimeCommand[];

    try {
      expanded = normalizeQueuedCommands();
      if (expanded.length > 0) {
        runtime.apply(expanded);
      }
    } catch (cause) {
      handleError(
        createBridgeError('flush', `Bridge flush failed (${reason}).`, {
          cause
        })
      );
    }

    lastFlushAt = Date.now();
    phase = 'idle';
    options.hooks?.onFlush?.(expanded ?? []);
  }

  /**
   * 持续消费 transport 或 iterable source。
   */
  async function consume(source: TSource, consumeOptions: { signal?: AbortSignal } = {}) {
    phase = 'consuming';
    const signal = consumeOptions.signal ?? new AbortController().signal;

    const iterable = transport
      ? transport.connect(source, { signal })
      : isAsyncIterable<TRawPacket>(source)
        ? source
        : isIterable<TRawPacket>(source)
          ? toAsyncIterable(source)
          : handleError(
              createBridgeError('consume', 'Bridge consume requires a transport or an iterable source.')
            );

    try {
      for await (const packet of iterable) {
        if (signal.aborted) {
          break;
        }

        pushPacket(packet);
      }

      flush('consume-complete');
      phase = 'idle';
    } catch (cause) {
      handleError(
        createBridgeError('consume', 'Bridge consume failed.', {
          cause
        })
      );
    }
  }

  /**
   * 清空 bridge 状态、调试日志和 assembler 会话。
   */
  function reset() {
    clearScheduling();
    pendingCommands.splice(0, pendingCommands.length);
    rawPackets.splice(0, rawPackets.length);
    mappedCommands.splice(0, mappedCommands.length);
    streamAssemblerById.clear();

    protocol.reset?.();

    for (const assembler of Object.values(assemblers)) {
      assembler.reset?.();
    }

    runtime.reset();
    phase = 'idle';
    lastError = undefined;
    lastFlushAt = undefined;
  }

  /**
   * 关闭当前 bridge，后续不再继续消费。
   */
  function close() {
    flush('close');
    clearScheduling();
    protocol.reset?.();
    phase = 'closed';
  }

  /**
   * 返回 bridge 当前运行状态。
   */
  function status(): BridgeStatus {
    return {
      phase,
      scheduled,
      pendingCommandCount: pendingCommands.length,
      activeStreamCount: streamAssemblerById.size,
      ...(lastFlushAt !== undefined ? { lastFlushAt } : {}),
      ...(lastError ? { lastError } : {})
    };
  }

  /**
   * 返回 bridge 当前调试快照。
   */
  function snapshot(): BridgeSnapshot<TRawPacket> {
    return {
      status: status(),
      rawPackets: trimLog([...rawPackets], debugOptions.maxEntries),
      mappedCommands: trimLog([...mappedCommands], debugOptions.maxEntries)
    };
  }

  return {
    runtime,
    protocol,
    push(packet) {
      for (const item of Array.isArray(packet) ? packet : [packet]) {
        pushPacket(item);
      }
    },
    consume,
    flush,
    reset,
    close,
    status,
    snapshot
  };
}
