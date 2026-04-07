import { computed, getCurrentScope, onScopeDispose, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import type {
  AgentRuntime,
  BridgeHooks,
  RuntimeCommand,
  RuntimeHistoryEntry,
  RuntimeSnapshot
} from '../runtime/types';
import type { EventActionExecutionRecord } from '../runtime/eventActions';
import { cloneValue, trimLog } from '../runtime/utils';
import {
  hasRuntimeSnapshotDiffChanges,
  resolveRuntimeSnapshotDiff,
  type ResolveRuntimeSnapshotDiffOptions,
  type RuntimeSnapshotDiff
} from '../devtools/runtimeSnapshotDiff';

/**
 * 原始事件列表里单条记录的结构。
 */
export interface AgentDevtoolsRawEventEntry<TRawPacket = unknown> {
  /** 这条记录自己的稳定 id。 */
  id: string;
  /** 当前在日志里的顺序号。 */
  order: number;
  /** 当前事件被 bridge 收到的时间戳。 */
  at: number;
  /** 当前事件名。 */
  eventName: string;
  /** 当前事件估算后的体积。 */
  size: number;
  /** 当前事件的一行摘要。 */
  preview: string;
  /** 当前原始事件本体。 */
  packet: TRawPacket;
}

/**
 * raw event 到 protocol command 的映射记录。
 */
export interface AgentDevtoolsProtocolTraceEntry<TRawPacket = unknown> {
  /** 这条 trace 自己的稳定 id。 */
  id: string;
  /** 当前在 trace 里的顺序号。 */
  order: number;
  /** 这组命令被协议映射完成的时间戳。 */
  at: number;
  /** 对应的原始事件顺序号。 */
  packetOrder: number | null;
  /** 当前事件名。 */
  eventName: string;
  /** 当前命令数量。 */
  commandCount: number;
  /** 当前命令类型列表。 */
  commandTypes: string[];
  /** 当前映射出的命令。 */
  commands: RuntimeCommand[];
  /** 当前原始事件本体。 */
  packet: TRawPacket;
}

/**
 * runtime snapshot 每次变化后的 diff 记录。
 */
export interface AgentDevtoolsSnapshotDiffEntry {
  /** 这条 diff 自己的稳定 id。 */
  id: string;
  /** 当前在 diff 日志里的顺序号。 */
  order: number;
  /** runtime 这次变化发生的时间戳。 */
  at: number;
  /** 当前 diff 关联的上游 trace 顺序号。 */
  traceOrder: number | null;
  /** 当前 diff 关联的原始事件顺序号。 */
  packetOrder: number | null;
  /** 这次 diff 最可能对应的事件名。 */
  eventName: string | null;
  /** 这次 diff 对应 trace 里的命令类型列表。 */
  commandTypes: string[];
  /** 这次 runtime 变化新增的 history 条目。 */
  historyEntries: RuntimeHistoryEntry[];
  /** 当前 diff 的计数汇总。 */
  summary: RuntimeSnapshotDiff['summary'];
  /** 完整 diff 结构。 */
  diff: RuntimeSnapshotDiff;
}

/**
 * Agent devtools 当前整体计数汇总。
 */
export interface AgentDevtoolsSummary {
  /** 当前保留的 raw event 数。 */
  rawEventCount: number;
  /** 当前保留的 protocol trace 数。 */
  protocolTraceCount: number;
  /** 当前保留的 side effect 数。 */
  sideEffectCount: number;
  /** 当前保留的 snapshot diff 数。 */
  snapshotDiffCount: number;
}

/**
 * 当前事件触发的一组非 UI side effect 日志。
 */
export interface AgentDevtoolsSideEffectEntry<TRawPacket = unknown> {
  /** 这条记录自己的稳定 id。 */
  id: string;
  /** 当前在 side effect 日志里的顺序号。 */
  order: number;
  /** 当前 side effect 被执行的时间戳。 */
  at: number;
  /** 对应的原始事件顺序号。 */
  packetOrder: number | null;
  /** 当前事件名。 */
  eventName: string | null;
  /** 当前命中的 action 数量。 */
  actionCount: number;
  /** 当前命中的 action key 列表。 */
  actionKeys: string[];
  /** 当前副作用对应的原始事件。 */
  packet: TRawPacket;
  /** 当前命中的副作用记录。 */
  actions: EventActionExecutionRecord<TRawPacket>[];
}

/**
 * 导出 devtools 状态时使用的可序列化结构。
 */
export interface AgentDevtoolsExport<TRawPacket = unknown> {
  /** 当前导出格式版本。 */
  schemaVersion: 1;
  /** 当前导出格式标识。 */
  format: 'agentdown.devtools/v1';
  /** 当前导出时间。 */
  generatedAt: string;
  /** 当前汇总信息。 */
  summary: AgentDevtoolsSummary;
  /** 最近保留的原始事件。 */
  rawEvents: AgentDevtoolsRawEventEntry<TRawPacket>[];
  /** 最近保留的 protocol trace。 */
  protocolTrace: AgentDevtoolsProtocolTraceEntry<TRawPacket>[];
  /** 最近保留的 side effect。 */
  sideEffects: AgentDevtoolsSideEffectEntry<TRawPacket>[];
  /** 最近保留的 runtime diff。 */
  snapshotDiffs: AgentDevtoolsSnapshotDiffEntry[];
}

/**
 * 导出的最小复现结构。
 *
 * 这份结构刻意只保留：
 * - 原始 packet 序列
 * - 关键 trace 摘要
 * - side effect 摘要
 * - 最近一次 runtime diff
 *
 * 方便复制、落盘、提 issue，或交给后续 replay / inspector 页面继续消费。
 */
export interface AgentDevtoolsReproductionExport<TRawPacket = unknown> {
  /** 当前导出格式版本。 */
  schemaVersion: 1;
  /** 当前导出格式标识。 */
  format: 'agentdown.devtools-repro/v1';
  /** 当前导出时间。 */
  generatedAt: string;
  /** 当前汇总信息。 */
  summary: AgentDevtoolsSummary;
  /** 最小复现所需的原始 packet 序列。 */
  packets: Array<{
    order: number;
    eventName: string;
    packet: TRawPacket;
  }>;
  /** 对应的协议映射摘要。 */
  trace: Array<{
    order: number;
    packetOrder: number | null;
    eventName: string;
    commandTypes: string[];
    commands: RuntimeCommand[];
  }>;
  /** 对应的非 UI side effect 摘要。 */
  sideEffects: Array<{
    order: number;
    packetOrder: number | null;
    eventName: string | null;
    actionKeys: string[];
  }>;
  /** 最近一次 runtime diff。 */
  latestSnapshotDiff: AgentDevtoolsSnapshotDiffEntry | null;
}

/**
 * `useAgentDevtools()` 的输入配置。
 */
export interface UseAgentDevtoolsOptions<TRawPacket = unknown>
  extends ResolveRuntimeSnapshotDiffOptions {
  /** 是否启用这套 devtools。 */
  enabled?: boolean;
  /** 各类日志最多保留多少条。 */
  maxEntries?: number;
  /** 原始事件摘要最多保留多少字符。 */
  eventPreviewChars?: number;
  /** 如何从原始事件里提取事件名。 */
  resolveEventName?: (packet: TRawPacket) => string;
}

/**
 * `useAgentDevtools()` 暴露给页面和 chat helper 的完整状态。
 */
export interface UseAgentDevtoolsResult<TRawPacket = unknown> {
  /** 当前是否启用日志采集。 */
  enabled: boolean;
  /** 原始事件日志。 */
  rawEvents: ShallowRef<AgentDevtoolsRawEventEntry<TRawPacket>[]>;
  /** raw event 到 command 的 trace 日志。 */
  protocolTrace: ShallowRef<AgentDevtoolsProtocolTraceEntry<TRawPacket>[]>;
  /** 非 UI side effect 日志。 */
  sideEffects: ShallowRef<AgentDevtoolsSideEffectEntry<TRawPacket>[]>;
  /** runtime snapshot diff 日志。 */
  snapshotDiffs: ShallowRef<AgentDevtoolsSnapshotDiffEntry[]>;
  /** 当前汇总信息。 */
  summary: ComputedRef<AgentDevtoolsSummary>;
  /** 需要传给 bridge 的 hooks。 */
  hooks: BridgeHooks<TRawPacket>;
  /** 开始观察某个 runtime。 */
  attachRuntime: (runtime: AgentRuntime) => void;
  /** 停止观察当前 runtime。 */
  detachRuntime: () => void;
  /** 手动记录一组 side effect。 */
  recordSideEffects: (
    packet: TRawPacket,
    actions: EventActionExecutionRecord<TRawPacket>[]
  ) => EventActionExecutionRecord<TRawPacket>[];
  /** 清空当前 devtools 日志。 */
  reset: () => void;
  /** 导出当前全部日志。 */
  exportSnapshot: () => AgentDevtoolsExport<TRawPacket>;
  /** 导出一份最小复现包。 */
  exportReproduction: () => AgentDevtoolsReproductionExport<TRawPacket>;
}

/**
 * 尝试从任意 packet 里提取一个可读事件名。
 */
function resolveFallbackEventName(packet: unknown): string {
  if (typeof packet === 'string' && packet.length > 0) {
    return 'string';
  }

  if (typeof packet === 'number' || typeof packet === 'boolean') {
    return typeof packet;
  }

  if (typeof packet === 'object' && packet !== null) {
    const record = packet as Record<string, unknown>;
    const candidateKeys = ['event', 'type', 'kind', 'name'];

    for (const key of candidateKeys) {
      const value = record[key];

      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    return 'object';
  }

  return 'unknown';
}

/**
 * 把原始事件收敛成一行更适合面板展示的摘要。
 */
function createEventPreview(packet: unknown, previewChars: number): string {
  let text = '';

  if (typeof packet === 'string') {
    text = packet;
  } else {
    try {
      text = JSON.stringify(packet);
    } catch {
      text = String(packet);
    }
  }

  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    return '(空事件)';
  }

  if (normalized.length <= previewChars) {
    return normalized;
  }

  return `${normalized.slice(0, previewChars)}...`;
}

/**
 * 粗略估算一条事件序列化后的大小。
 */
function estimateEventSize(packet: unknown): number {
  let text = '';

  if (typeof packet === 'string') {
    text = packet;
  } else {
    try {
      text = JSON.stringify(packet);
    } catch {
      text = String(packet);
    }
  }

  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(text).length;
  }

  return text.length;
}

/**
 * 统一向某个日志 ref 追加一条新记录，并裁剪最大长度。
 */
function appendLogEntry<TItem>(
  target: ShallowRef<TItem[]>,
  value: TItem,
  maxEntries: number
): void {
  target.value = trimLog([...target.value, value], maxEntries);
}

/**
 * 创建一套可复用的 Agent devtools 状态。
 *
 * 这套能力同时覆盖三件事：
 * - 收集原始事件
 * - 收集 protocol trace
 * - 订阅 runtime snapshot 并生成 diff
 */
export function useAgentDevtools<TRawPacket = unknown>(
  options: UseAgentDevtoolsOptions<TRawPacket> = {}
): UseAgentDevtoolsResult<TRawPacket> {
  const enabled = options.enabled ?? true;
  const maxEntries = Math.max(20, options.maxEntries ?? 120);
  const eventPreviewChars = Math.max(48, options.eventPreviewChars ?? 160);
  const rawEvents = shallowRef<AgentDevtoolsRawEventEntry<TRawPacket>[]>([]);
  const protocolTrace = shallowRef<AgentDevtoolsProtocolTraceEntry<TRawPacket>[]>([]);
  const sideEffects = shallowRef<AgentDevtoolsSideEffectEntry<TRawPacket>[]>([]);
  const snapshotDiffs = shallowRef<AgentDevtoolsSnapshotDiffEntry[]>([]);
  let rawEventOrder = 0;
  let traceOrder = 0;
  let sideEffectOrder = 0;
  let diffOrder = 0;
  let activeRuntime: AgentRuntime | null = null;
  let previousSnapshot: RuntimeSnapshot | null = null;
  let unsubscribeRuntime: (() => void) | null = null;
  let latestPacketContext: {
    order: number;
    eventName: string;
  } | null = null;
  let latestTraceContext: {
    order: number;
    packetOrder: number | null;
    eventName: string;
    commandTypes: string[];
  } | null = null;

  /**
   * 关闭当前 runtime 订阅。
   */
  function detachRuntime() {
    unsubscribeRuntime?.();
    unsubscribeRuntime = null;
    activeRuntime = null;
    previousSnapshot = null;
    latestTraceContext = null;
  }

  /**
   * 重新把内部计数和日志清零。
   */
  function reset() {
    rawEvents.value = [];
    protocolTrace.value = [];
    sideEffects.value = [];
    snapshotDiffs.value = [];
    rawEventOrder = 0;
    traceOrder = 0;
    sideEffectOrder = 0;
    diffOrder = 0;
    latestPacketContext = null;
    latestTraceContext = null;

    if (activeRuntime) {
      previousSnapshot = activeRuntime.snapshot();
    }
  }

  /**
   * 把当前 runtime 绑定进 devtools，并开始监听 snapshot 变化。
   */
  function attachRuntime(runtime: AgentRuntime) {
    detachRuntime();
    activeRuntime = runtime;
    previousSnapshot = runtime.snapshot();

    unsubscribeRuntime = runtime.subscribe(() => {
      if (!activeRuntime || !previousSnapshot) {
        return;
      }

      const nextSnapshot = activeRuntime.snapshot();
      const diffOptions = options.previewChars === undefined
        ? {}
        : {
            previewChars: options.previewChars
          };
      const diff = resolveRuntimeSnapshotDiff(previousSnapshot, nextSnapshot, diffOptions);
      const historyDelta = nextSnapshot.history.length - previousSnapshot.history.length;
      const appendedHistory = historyDelta > 0
        ? cloneValue(nextSnapshot.history.slice(nextSnapshot.history.length - historyDelta))
        : [];
      const traceContext = latestTraceContext
        ? cloneValue(latestTraceContext)
        : null;
      previousSnapshot = nextSnapshot;
      latestTraceContext = null;

      if (!enabled || !hasRuntimeSnapshotDiffChanges(diff)) {
        return;
      }

      diffOrder += 1;
      appendLogEntry(snapshotDiffs, {
        id: `snapshot-diff:${diffOrder}`,
        order: diffOrder,
        at: Date.now(),
        traceOrder: traceContext?.order ?? null,
        packetOrder: traceContext?.packetOrder ?? null,
        eventName: traceContext?.eventName ?? null,
        commandTypes: traceContext?.commandTypes ?? [],
        historyEntries: appendedHistory,
        summary: diff.summary,
        diff
      }, maxEntries);
    });
  }

  /**
   * 导出当前整套 devtools 状态，方便复制最小复现。
   */
  function exportSnapshot(): AgentDevtoolsExport<TRawPacket> {
    return {
      schemaVersion: 1,
      format: 'agentdown.devtools/v1',
      generatedAt: new Date().toISOString(),
      summary: {
        rawEventCount: rawEvents.value.length,
        protocolTraceCount: protocolTrace.value.length,
        sideEffectCount: sideEffects.value.length,
        snapshotDiffCount: snapshotDiffs.value.length
      },
      rawEvents: cloneValue(rawEvents.value),
      protocolTrace: cloneValue(protocolTrace.value),
      sideEffects: cloneValue(sideEffects.value),
      snapshotDiffs: cloneValue(snapshotDiffs.value)
    };
  }

  /**
   * 导出一份更适合做最小复现的精简包。
   */
  function exportReproduction(): AgentDevtoolsReproductionExport<TRawPacket> {
    return {
      schemaVersion: 1,
      format: 'agentdown.devtools-repro/v1',
      generatedAt: new Date().toISOString(),
      summary: {
        rawEventCount: rawEvents.value.length,
        protocolTraceCount: protocolTrace.value.length,
        sideEffectCount: sideEffects.value.length,
        snapshotDiffCount: snapshotDiffs.value.length
      },
      packets: cloneValue(rawEvents.value.map((entry) => ({
        order: entry.order,
        eventName: entry.eventName,
        packet: entry.packet
      }))),
      trace: cloneValue(protocolTrace.value.map((entry) => ({
        order: entry.order,
        packetOrder: entry.packetOrder,
        eventName: entry.eventName,
        commandTypes: entry.commandTypes,
        commands: entry.commands
      }))),
      sideEffects: cloneValue(sideEffects.value.map((entry) => ({
        order: entry.order,
        packetOrder: entry.packetOrder,
        eventName: entry.eventName,
        actionKeys: entry.actionKeys
      }))),
      latestSnapshotDiff: snapshotDiffs.value.length > 0
        ? cloneValue(snapshotDiffs.value[snapshotDiffs.value.length - 1] ?? null)
        : null
    };
  }

  /**
   * 记录一组非 UI side effect，方便 devtools 单独展示。
   */
  function recordSideEffects(
    packet: TRawPacket,
    actions: EventActionExecutionRecord<TRawPacket>[]
  ): EventActionExecutionRecord<TRawPacket>[] {
    if (actions.length === 0) {
      return actions;
    }

    const packetContext = latestPacketContext;
    const eventName = actions[0]?.eventName
      ?? packetContext?.eventName
      ?? (
        options.resolveEventName
          ? options.resolveEventName(packet)
          : resolveFallbackEventName(packet)
      );

    if (!enabled) {
      return actions;
    }

    sideEffectOrder += 1;
    appendLogEntry(sideEffects, {
      id: `side-effect:${sideEffectOrder}`,
      order: sideEffectOrder,
      at: Date.now(),
      packetOrder: packetContext?.order ?? null,
      eventName: eventName ?? null,
      actionCount: actions.length,
      actionKeys: actions.map((item) => item.key),
      packet: cloneValue(packet),
      actions: cloneValue(actions)
    }, maxEntries);

    return actions;
  }

  /**
   * 给 bridge 提供原始事件与协议映射的采集 hooks。
   */
  const hooks: BridgeHooks<TRawPacket> = {
    onPacket(packet) {
      const eventName = options.resolveEventName
        ? options.resolveEventName(packet)
        : resolveFallbackEventName(packet);

      rawEventOrder += 1;
      latestPacketContext = {
        order: rawEventOrder,
        eventName
      };

      if (!enabled) {
        return;
      }

      appendLogEntry(rawEvents, {
        id: `raw-event:${rawEventOrder}`,
        order: rawEventOrder,
        at: Date.now(),
        eventName,
        size: estimateEventSize(packet),
        preview: createEventPreview(packet, eventPreviewChars),
        packet: cloneValue(packet)
      }, maxEntries);
    },
    onMapped(commands, packet) {
      traceOrder += 1;
      const packetContext = latestPacketContext;
      const eventName = packetContext?.eventName
        ?? (
          options.resolveEventName
            ? options.resolveEventName(packet)
            : resolveFallbackEventName(packet)
        );
      latestTraceContext = {
        order: traceOrder,
        packetOrder: packetContext?.order ?? null,
        eventName,
        commandTypes: commands.map((command) => command.type)
      };

      if (!enabled) {
        return;
      }

      appendLogEntry(protocolTrace, {
        id: `protocol-trace:${traceOrder}`,
        order: traceOrder,
        at: Date.now(),
        packetOrder: packetContext?.order ?? null,
        eventName,
        commandCount: commands.length,
        commandTypes: commands.map((command) => command.type),
        commands: cloneValue(commands),
        packet: cloneValue(packet)
      }, maxEntries);
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      detachRuntime();
    });
  }

  return {
    enabled,
    rawEvents,
    protocolTrace,
    sideEffects,
    snapshotDiffs,
    summary: computed(() => ({
      rawEventCount: rawEvents.value.length,
      protocolTraceCount: protocolTrace.value.length,
        sideEffectCount: sideEffects.value.length,
        snapshotDiffCount: snapshotDiffs.value.length
      })),
    hooks,
    attachRuntime,
    detachRuntime,
    recordSideEffects,
    reset,
    exportSnapshot,
    exportReproduction
  };
}
