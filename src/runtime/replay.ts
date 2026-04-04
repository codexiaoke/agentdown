import { createAgentRuntime } from './createAgentRuntime';
import type {
  AgentRuntime,
  RuntimeHistoryEntry,
  RuntimeIntent,
  RuntimeSnapshot,
  SurfaceBlock
} from './types';
import { cloneValue } from './utils';

type TranscriptRole = 'assistant' | 'user' | 'system';
type TranscriptSource = AgentRuntime | RuntimeSnapshot;
type ReplayStatus = 'idle' | 'playing' | 'completed';

export interface RuntimeTranscriptMessage {
  id: string;
  slot: string;
  groupId?: string | null;
  role: TranscriptRole;
  blockIds: string[];
  blockKinds: string[];
  blocks: SurfaceBlock[];
  text: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface RuntimeTranscript {
  format: 'agentdown.transcript/v0';
  exportedAt: number;
  snapshot: RuntimeSnapshot;
  history: RuntimeHistoryEntry[];
  messages: RuntimeTranscriptMessage[];
}

export interface CreateRuntimeTranscriptOptions {
  slot?: string;
}

export interface ReplayRuntimeHistoryOptions {
  runtime?: AgentRuntime;
  upto?: number;
  includeIntents?: boolean;
}

export interface RuntimeReplayStepResult {
  index: number;
  entry: RuntimeHistoryEntry;
  snapshot: RuntimeSnapshot;
}

export interface RuntimeReplayPlayOptions {
  intervalMs?: number;
  signal?: AbortSignal;
  onStep?: (result: RuntimeReplayStepResult) => void;
}

export interface RuntimeReplayPlayer {
  readonly runtime: AgentRuntime;
  history(): RuntimeHistoryEntry[];
  current(): RuntimeHistoryEntry | null;
  played(): RuntimeHistoryEntry[];
  position(): number;
  total(): number;
  status(): ReplayStatus;
  snapshot(): RuntimeSnapshot;
  reset(): RuntimeSnapshot;
  seek(position: number): RuntimeSnapshot;
  step(count?: number): RuntimeReplayStepResult[];
  play(options?: RuntimeReplayPlayOptions): Promise<void>;
}

function isAgentRuntime(value: AgentRuntime | RuntimeSnapshot): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

function resolveSnapshot(input: TranscriptSource): RuntimeSnapshot {
  return isAgentRuntime(input) ? input.snapshot() : cloneValue(input);
}

function resolveHistory(input: TranscriptSource): RuntimeHistoryEntry[] {
  return isAgentRuntime(input) ? input.history() : cloneValue(input.history);
}

function resolveBlockRole(block: SurfaceBlock, snapshot: RuntimeSnapshot): TranscriptRole {
  const blockRole = (block.data as { role?: unknown }).role;

  if (blockRole === 'user' || blockRole === 'assistant' || blockRole === 'system') {
    return blockRole;
  }

  const node = block.nodeId
    ? snapshot.nodes.find((candidate) => candidate.id === block.nodeId)
    : undefined;

  if (node?.type === 'user') {
    return 'user';
  }

  if (node?.type === 'system') {
    return 'system';
  }

  return 'assistant';
}

function extractBlockText(block: SurfaceBlock): string {
  if (typeof block.content === 'string' && block.content.trim().length > 0) {
    return block.content;
  }

  const data = block.data as {
    text?: unknown;
    title?: unknown;
    message?: unknown;
  };

  if (typeof data.text === 'string' && data.text.trim().length > 0) {
    return data.text;
  }

  if (typeof data.title === 'string' && data.title.trim().length > 0) {
    return data.title;
  }

  if (typeof data.message === 'string' && data.message.trim().length > 0) {
    return data.message;
  }

  return '';
}

/**
 * 把当前 snapshot 的 block 序列整理成更适合导出或展示的消息 transcript。
 * 分组规则和 RunSurface 保持一致：按 slot / groupId / role 做连续聚合。
 */
export function createRuntimeTranscriptMessages(
  input: TranscriptSource,
  options: CreateRuntimeTranscriptOptions = {}
): RuntimeTranscriptMessage[] {
  const snapshot = resolveSnapshot(input);
  const blocks = snapshot.blocks.filter((block) => options.slot ? block.slot === options.slot : true);
  const messages: RuntimeTranscriptMessage[] = [];

  for (const block of blocks) {
    const role = resolveBlockRole(block, snapshot);
    const previous = messages[messages.length - 1];

    if (
      previous
      && previous.slot === block.slot
      && previous.role === role
      && (previous.groupId ?? null) === (block.groupId ?? null)
    ) {
      previous.blocks.push(block);
      previous.blockIds.push(block.id);
      previous.blockKinds.push(block.type);
      previous.text = [previous.text, extractBlockText(block)].filter(Boolean).join('\n\n');

      if (block.createdAt !== undefined) {
        previous.createdAt = previous.createdAt === undefined
          ? block.createdAt
          : Math.min(previous.createdAt, block.createdAt);
      }

      if (block.updatedAt !== undefined) {
        previous.updatedAt = previous.updatedAt === undefined
          ? block.updatedAt
          : Math.max(previous.updatedAt, block.updatedAt);
      }

      continue;
    }

    messages.push({
      id: block.groupId ? `${block.groupId}:${messages.length}` : block.id,
      slot: block.slot,
      ...(block.groupId !== undefined ? { groupId: block.groupId } : {}),
      role,
      blockIds: [block.id],
      blockKinds: [block.type],
      blocks: [block],
      text: extractBlockText(block),
      ...(block.createdAt !== undefined ? { createdAt: block.createdAt } : {}),
      ...(block.updatedAt !== undefined ? { updatedAt: block.updatedAt } : {})
    });
  }

  return messages;
}

/**
 * 导出一份可序列化 transcript。
 * 当前实现会保留完整 snapshot、history，以及按消息聚合后的 messages 视图。
 */
export function createRuntimeTranscript(
  input: TranscriptSource,
  options: CreateRuntimeTranscriptOptions = {}
): RuntimeTranscript {
  const snapshot = resolveSnapshot(input);

  return {
    format: 'agentdown.transcript/v0',
    exportedAt: Date.now(),
    snapshot,
    history: resolveHistory(input),
    messages: createRuntimeTranscriptMessages(snapshot, options)
  };
}

function replayIntent(runtime: AgentRuntime, intent: RuntimeIntent, includeIntents: boolean) {
  if (!includeIntents) {
    return;
  }

  runtime.emitIntent({
    type: intent.type,
    ...(intent.nodeId !== undefined ? { nodeId: intent.nodeId } : {}),
    ...(intent.blockId !== undefined ? { blockId: intent.blockId } : {}),
    payload: intent.payload
  });
}

function applyReplayEntry(
  runtime: AgentRuntime,
  entry: RuntimeHistoryEntry,
  includeIntents: boolean
) {
  if (entry.kind === 'command') {
    runtime.apply(entry.command);
    return;
  }

  replayIntent(runtime, entry.intent, includeIntents);
}

/**
 * 按 history 顺序重建 runtime。
 * 适合导入 transcript、生成最终快照，或做不需要播放器控制的离线 replay。
 */
export function replayRuntimeHistory(
  history: RuntimeHistoryEntry[],
  options: ReplayRuntimeHistoryOptions = {}
): AgentRuntime {
  const runtime = options.runtime ?? createAgentRuntime();
  const includeIntents = options.includeIntents ?? true;
  const upto = Math.max(0, Math.min(options.upto ?? history.length, history.length));

  runtime.reset();

  for (const entry of history.slice(0, upto)) {
    applyReplayEntry(runtime, entry, includeIntents);
  }

  return runtime;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', abortListener);
      resolve();
    }, ms);

    const abortListener = () => {
      globalThis.clearTimeout(timer);
      reject(new Error('Replay aborted.'));
    };

    signal?.addEventListener('abort', abortListener, { once: true });
  });
}

/**
 * 提供一个可编程 replay player。
 * 它内部维护一个独立 runtime，支持 reset / seek / step / play。
 */
export function createRuntimeReplayPlayer(
  history: RuntimeHistoryEntry[],
  options: ReplayRuntimeHistoryOptions = {}
): RuntimeReplayPlayer {
  const runtime = options.runtime ?? createAgentRuntime();
  const includeIntents = options.includeIntents ?? true;
  const sourceHistory = cloneValue(history);
  const playedEntries: RuntimeHistoryEntry[] = [];
  let cursor = 0;
  let currentEntry: RuntimeHistoryEntry | null = null;
  let replayStatus: ReplayStatus = 'idle';

  function reset() {
    runtime.reset();
    playedEntries.splice(0, playedEntries.length);
    cursor = 0;
    currentEntry = null;
    replayStatus = 'idle';
    return runtime.snapshot();
  }

  function step(count = 1): RuntimeReplayStepResult[] {
    const results: RuntimeReplayStepResult[] = [];
    const maxCount = Math.max(0, count);

    for (let offset = 0; offset < maxCount && cursor < sourceHistory.length; offset += 1) {
      const entry = sourceHistory[cursor]!;
      applyReplayEntry(runtime, entry, includeIntents);
      playedEntries.push(entry);
      cursor += 1;
      currentEntry = entry;

      results.push({
        index: cursor,
        entry,
        snapshot: runtime.snapshot()
      });
    }

    if (cursor >= sourceHistory.length) {
      replayStatus = 'completed';
    }

    return results;
  }

  return {
    runtime,
    history() {
      return cloneValue(sourceHistory);
    },
    current() {
      return currentEntry ? cloneValue(currentEntry) : null;
    },
    played() {
      return cloneValue(playedEntries);
    },
    position() {
      return cursor;
    },
    total() {
      return sourceHistory.length;
    },
    status() {
      return replayStatus;
    },
    snapshot() {
      return runtime.snapshot();
    },
    reset,
    seek(position: number) {
      reset();
      step(position);
      return runtime.snapshot();
    },
    step,
    async play(playOptions: RuntimeReplayPlayOptions = {}) {
      const intervalMs = playOptions.intervalMs ?? 320;

      if (cursor >= sourceHistory.length) {
        replayStatus = 'completed';
        return;
      }

      replayStatus = 'playing';

      try {
        while (cursor < sourceHistory.length) {
          if (playOptions.signal?.aborted) {
            break;
          }

          const [result] = step(1);

          if (!result) {
            break;
          }

          playOptions.onStep?.(result);

          if (cursor >= sourceHistory.length) {
            replayStatus = 'completed';
            break;
          }

          await delay(intervalMs, playOptions.signal);
        }
      } catch {
        replayStatus = cursor >= sourceHistory.length ? 'completed' : 'idle';
      }
    }
  };
}
