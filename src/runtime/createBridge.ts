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

function createSchedulerRunner(scheduler: BridgeOptions['scheduler']) {
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

  function handleError(error: BridgeError<TRawPacket>): never {
    lastError = error;
    phase = 'errored';
    options.hooks?.onError?.(error);
    throw error;
  }

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

  function enqueue(commands: RuntimeCommand[]) {
    pendingCommands.push(...commands);

    if (pendingCommands.length >= batchOptions.maxCommands) {
      flush('max-commands');
      return;
    }

    scheduleFlush();
  }

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

  function recordPacket(packet: TRawPacket) {
    if (!debugOptions.recordRawPackets) {
      return;
    }

    rawPackets.push(packet);

    if (debugOptions.maxEntries) {
      rawPackets.splice(0, Math.max(0, rawPackets.length - debugOptions.maxEntries));
    }
  }

  function recordMapped(commands: RuntimeCommand[]) {
    if (!debugOptions.recordMappedCommands) {
      return;
    }

    mappedCommands.push(commands);

    if (debugOptions.maxEntries) {
      mappedCommands.splice(0, Math.max(0, mappedCommands.length - debugOptions.maxEntries));
    }
  }

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

  function reset() {
    clearScheduling();
    pendingCommands.splice(0, pendingCommands.length);
    rawPackets.splice(0, rawPackets.length);
    mappedCommands.splice(0, mappedCommands.length);
    streamAssemblerById.clear();

    for (const assembler of Object.values(assemblers)) {
      assembler.reset?.();
    }

    runtime.reset();
    phase = 'idle';
    lastError = undefined;
    lastFlushAt = undefined;
  }

  function close() {
    flush('close');
    clearScheduling();
    phase = 'closed';
  }

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
