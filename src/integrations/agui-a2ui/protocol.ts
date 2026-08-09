import { EventType } from '@ag-ui/core';
import { A2uiMessageSchema, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2UI_SURFACE_RENDERER } from '../../a2ui';
import { cmd } from '../../runtime/defineProtocol';
import type {
  ProtocolContext,
  RuntimeCommand,
  RuntimeData,
  RuntimeProtocol
} from '../../runtime/types';
import type { AgUiEvent } from '../../adapters/agui';
import { createAgUiProtocol } from '../../adapters/agui';
import type { AgUiProtocol, AgUiProtocolOptions, AgUiStateStore } from '../../adapters/agui';
import { composeProtocols } from '../../runtime/composeProtocols';

const DEFAULT_CUSTOM_EVENT_NAMES = new Set(['a2ui', 'a2ui.message', 'a2ui.surface']);

export interface AgUiA2UiBlockIdContext {
  threadId: string;
  runId: string | null;
  surfaceId: string;
  event: AgUiEvent;
  context: ProtocolContext;
}

export interface AgUiA2UiProtocolOptions {
  slot?: string;
  /** 允许承载 A2UI 消息的 AG-UI CUSTOM name。 */
  customEventNames?: ReadonlySet<string>;
  /** RAW 默认禁用；只有 source 在此 allowlist 中才会被解析。 */
  rawEventSources?: ReadonlySet<string>;
  /** 完全接管从 AG-UI event 中提取 A2UI payload 的逻辑。 */
  extractMessages?: (
    event: AgUiEvent,
    context: ProtocolContext
  ) => unknown | ReadonlyArray<unknown> | null | undefined;
  /** 单个 Surface 保留的服务端消息上限。 */
  maxMessagesPerSurface?: number;
  resolveBlockId?: (input: AgUiA2UiBlockIdContext) => string;
}

export interface AgUiA2UiProtocol extends RuntimeProtocol<AgUiEvent> {
  /** 显式清理一个 thread 或全部 thread 的 Surface 历史。 */
  clearSurfaces: (threadId?: string) => void;
  getSurfaceMessages: (threadId: string, surfaceId: string) => readonly A2uiMessage[];
}

export interface AgUiA2UiCombinedProtocol extends RuntimeProtocol<AgUiEvent> {
  readonly agUi: AgUiProtocol;
  readonly a2ui: AgUiA2UiProtocol;
  readonly store: AgUiStateStore;
}

interface SurfaceHistory {
  threadId: string;
  surfaceId: string;
  messages: A2uiMessage[];
  createdAt: number;
}

function readSurfaceId(message: A2uiMessage): string {
  if ('createSurface' in message) return message.createSurface.surfaceId;
  if ('updateComponents' in message) return message.updateComponents.surfaceId;
  if ('updateDataModel' in message) return message.updateDataModel.surfaceId;
  return message.deleteSurface.surfaceId;
}

function normalizeCandidates(value: unknown): ReadonlyArray<unknown> {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && 'messages' in value) {
    const messages = (value as { messages?: unknown }).messages;
    if (Array.isArray(messages)) return messages;
  }
  return [value];
}

function parseMessages(value: unknown): A2uiMessage[] {
  return normalizeCandidates(value).map((candidate, index) => {
    const result = A2uiMessageSchema.safeParse(candidate);
    if (!result.success) {
      throw new Error(`Invalid A2UI message at index ${index}: ${result.error.message}`);
    }
    return result.data as A2uiMessage;
  });
}

function defaultExtractMessages(
  event: AgUiEvent,
  customEventNames: ReadonlySet<string>,
  rawEventSources: ReadonlySet<string>
): unknown {
  if (event.type === EventType.CUSTOM && customEventNames.has(event.name)) {
    return event.value;
  }
  if (
    event.type === EventType.RAW
    && event.source !== undefined
    && rawEventSources.has(event.source)
  ) {
    return event.event;
  }
  return undefined;
}

function surfaceKey(threadId: string, surfaceId: string): string {
  return `${threadId}\u0000${surfaceId}`;
}

function defaultBlockId(threadId: string, surfaceId: string): string {
  return `block:a2ui:${encodeURIComponent(threadId)}:${encodeURIComponent(surfaceId)}`;
}

/** 把明确承载 A2UI 的 AG-UI 扩展事件映射成可持续更新的 Runtime block。 */
export function createAgUiA2UiProtocol(
  options: AgUiA2UiProtocolOptions = {}
): AgUiA2UiProtocol {
  const histories = new Map<string, SurfaceHistory>();
  const customEventNames = options.customEventNames ?? DEFAULT_CUSTOM_EVENT_NAMES;
  const rawEventSources = options.rawEventSources ?? new Set<string>();
  const maxMessages = options.maxMessagesPerSurface ?? 256;
  let activeThreadId: string | null = null;
  let activeRunId: string | null = null;

  if (!Number.isInteger(maxMessages) || maxMessages <= 0) {
    throw new Error('maxMessagesPerSurface must be a positive integer.');
  }

  function clearSurfaces(threadId?: string) {
    if (threadId === undefined) {
      histories.clear();
      return;
    }
    for (const [key, history] of histories) {
      if (history.threadId === threadId) histories.delete(key);
    }
  }

  return {
    map({ packet: event, context }): RuntimeCommand[] {
      if (event.type === EventType.RUN_STARTED) {
        activeThreadId = event.threadId;
        activeRunId = event.runId;
      }

      const payload = options.extractMessages
        ? options.extractMessages(event, context)
        : defaultExtractMessages(event, customEventNames, rawEventSources);
      const messages = parseMessages(payload);
      if (messages.length === 0) {
        if (
          (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR)
          && event.runId === activeRunId
        ) {
          activeRunId = null;
        }
        return [];
      }

      const threadId = activeThreadId ?? 'unscoped';
      const at = typeof event.timestamp === 'number' ? event.timestamp : context.now();
      const commands: RuntimeCommand[] = [];

      for (const message of messages) {
        const surfaceId = readSurfaceId(message);
        const key = surfaceKey(threadId, surfaceId);
        const previous = histories.get(key);
        const blockIdContext: AgUiA2UiBlockIdContext = {
          threadId,
          runId: activeRunId,
          surfaceId,
          event,
          context
        };
        const blockId = options.resolveBlockId?.(blockIdContext)
          ?? defaultBlockId(threadId, surfaceId);

        if ('deleteSurface' in message) {
          histories.delete(key);
          commands.push(cmd.block.remove(blockId));
          continue;
        }

        const nextMessages = 'createSurface' in message
          ? [message]
          : [...(previous?.messages ?? []), message];
        if (nextMessages.length > maxMessages) {
          throw new Error(
            `A2UI surface ${surfaceId} exceeds ${maxMessages} retained messages.`
          );
        }

        const history: SurfaceHistory = {
          threadId,
          surfaceId,
          messages: nextMessages,
          createdAt: 'createSurface' in message ? at : (previous?.createdAt ?? at)
        };
        histories.set(key, history);
        commands.push(cmd.block.upsert({
          id: blockId,
          slot: options.slot ?? 'main',
          type: 'a2ui',
          renderer: A2UI_SURFACE_RENDERER,
          state: 'stable',
          nodeId: activeRunId,
          conversationId: threadId,
          turnId: activeRunId,
          messageId: `message:a2ui:${surfaceId}`,
          data: { surfaceId, messages: nextMessages } as RuntimeData,
          createdAt: history.createdAt,
          updatedAt: at
        }));
      }

      return commands;
    },
    reset() {
      // Bridge 会在每次新 run 前 reset；Surface 历史必须继续保留。
      activeRunId = null;
    },
    clearSurfaces,
    getSurfaceMessages(threadId, surfaceId) {
      return histories.get(surfaceKey(threadId, surfaceId))?.messages ?? [];
    }
  };
}

/** 创建可被 chat helper 观察的“纯 AG-UI + 可选 A2UI 扩展”组合协议。 */
export function createAgUiA2UiCombinedProtocol(options: {
  agUi?: AgUiProtocolOptions;
  a2ui?: AgUiA2UiProtocolOptions;
  a2uiProtocol?: AgUiA2UiProtocol;
} = {}): AgUiA2UiCombinedProtocol {
  const agUi = createAgUiProtocol(options.agUi);
  const a2ui = options.a2uiProtocol ?? createAgUiA2UiProtocol(options.a2ui);
  return Object.assign(composeProtocols(agUi, a2ui), {
    agUi,
    a2ui,
    store: agUi.store
  });
}
