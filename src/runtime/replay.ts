import { createAgentRuntime } from './createAgentRuntime';
import type {
  AgentRuntime,
  RuntimeHistoryEntry,
  RuntimeIntent,
  RuntimeSnapshot,
  SurfaceBlock
} from './types';
import { cloneValue } from './utils';

/**
 * transcript 消息支持的角色类型。
 */
type TranscriptRole = 'assistant' | 'user' | 'system';

/**
 * transcript 构建函数支持的输入源。
 */
type TranscriptSource = AgentRuntime | RuntimeSnapshot;

/**
 * replay player 当前所处的回放状态。
 */
type ReplayStatus = 'idle' | 'playing' | 'completed';

/**
 * transcript 中按消息粒度聚合后的记录。
 */
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

/**
 * transcript 中抽取出的工具调用摘要。
 */
export interface RuntimeTranscriptTool {
  id: string;
  nodeId?: string;
  blockId?: string;
  slot?: string;
  groupId?: string | null;
  role?: TranscriptRole;
  title?: string;
  message?: string;
  status?: string;
  renderer?: string;
  result?: unknown;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: number;
  endedAt?: number;
}

/**
 * transcript 中抽取出的产物摘要。
 */
export interface RuntimeTranscriptArtifact {
  id: string;
  blockId: string;
  slot: string;
  groupId?: string | null;
  role: TranscriptRole;
  title?: string;
  message?: string;
  artifactId?: string;
  artifactKind?: string;
  label?: string;
  href?: string;
  refId?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * transcript 中抽取出的审批摘要。
 */
export interface RuntimeTranscriptApproval {
  id: string;
  blockId: string;
  slot: string;
  groupId?: string | null;
  role: TranscriptRole;
  title?: string;
  message?: string;
  approvalId?: string;
  status?: string;
  refId?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 可序列化导入导出的完整 transcript 结构。
 */
export interface RuntimeTranscript {
  format: 'agentdown.transcript/v0';
  exportedAt: number;
  snapshot: RuntimeSnapshot;
  history: RuntimeHistoryEntry[];
  messages: RuntimeTranscriptMessage[];
  tools: RuntimeTranscriptTool[];
  artifacts: RuntimeTranscriptArtifact[];
  approvals: RuntimeTranscriptApproval[];
}

/**
 * 构建 transcript 时的附加过滤选项。
 */
export interface CreateRuntimeTranscriptOptions {
  slot?: string;
}

/**
 * 基于 history 进行离线 replay 时的配置。
 */
export interface ReplayRuntimeHistoryOptions {
  runtime?: AgentRuntime;
  upto?: number;
  includeIntents?: boolean;
}

/**
 * 单步回放后返回的结果快照。
 */
export interface RuntimeReplayStepResult {
  index: number;
  entry: RuntimeHistoryEntry;
  snapshot: RuntimeSnapshot;
}

/**
 * 自动播放 replay 时的控制参数。
 */
export interface RuntimeReplayPlayOptions {
  intervalMs?: number;
  signal?: AbortSignal;
  onStep?: (result: RuntimeReplayStepResult) => void;
}

/**
 * 可编程回放 runtime history 的播放器接口。
 */
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

/**
 * 判断输入是否为运行中的 AgentRuntime 实例。
 */
function isAgentRuntime(value: AgentRuntime | RuntimeSnapshot): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

/**
 * 从 runtime 或 snapshot 中取出一份可安全修改的 snapshot 副本。
 */
function resolveSnapshot(input: TranscriptSource): RuntimeSnapshot {
  return isAgentRuntime(input) ? input.snapshot() : cloneValue(input);
}

/**
 * 从 runtime 或 snapshot 中取出对应 history。
 */
function resolveHistory(input: TranscriptSource): RuntimeHistoryEntry[] {
  return isAgentRuntime(input) ? input.history() : cloneValue(input.history);
}

/**
 * 根据 slot 过滤 transcript 里需要参与导出的 block。
 */
function resolveTranscriptBlocks(
  snapshot: RuntimeSnapshot,
  options: CreateRuntimeTranscriptOptions
): SurfaceBlock[] {
  return snapshot.blocks.filter((block) => options.slot ? block.slot === options.slot : true);
}

/**
 * 把未知值安全转换成普通对象。
 */
function resolveRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * 判断对象上的某个字段是否为数组。
 */
function hasArrayField(record: Record<string, unknown>, key: string): boolean {
  return Array.isArray(record[key]);
}

/**
 * 从一组候选值中读取第一个非空字符串。
 */
function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

/**
 * 推断一个 surface block 所属的角色。
 */
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

/**
 * 提取 block 最适合展示在 transcript 文本摘要里的文字内容。
 */
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
 * 基于 block 和可选 node 信息生成一条 tool transcript 记录。
 */
function createToolEntryFromBlock(
  block: SurfaceBlock,
  snapshot: RuntimeSnapshot,
  node?: RuntimeSnapshot['nodes'][number]
): RuntimeTranscriptTool {
  const blockData = resolveRecord(block.data);
  const nodeData = resolveRecord(node?.data);
  const title = readString(blockData.title, node?.title);
  const message = readString(blockData.message, node?.message);
  const status = readString(blockData.status, node?.status);
  const result = blockData.result !== undefined
    ? blockData.result
    : nodeData.result !== undefined
      ? nodeData.result
      : undefined;
  const updatedAt =
    block.updatedAt !== undefined || node?.updatedAt !== undefined
      ? Math.max(block.updatedAt ?? 0, node?.updatedAt ?? 0) || undefined
      : undefined;

  return {
    id: block.nodeId ?? block.id,
    ...(block.nodeId ? { nodeId: block.nodeId } : {}),
    blockId: block.id,
    slot: block.slot,
    ...(block.groupId !== undefined ? { groupId: block.groupId } : {}),
    role: resolveBlockRole(block, snapshot),
    ...(title !== undefined ? { title } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(status !== undefined ? { status } : {}),
    renderer: block.renderer,
    ...(result !== undefined ? { result } : {}),
    ...(block.createdAt !== undefined ? { createdAt: block.createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(node?.startedAt !== undefined ? { startedAt: node.startedAt } : {}),
    ...(node?.endedAt !== undefined ? { endedAt: node.endedAt } : {})
  };
}

/**
 * 提取 transcript 中的 tool 摘要。
 * 优先从 tool node 建模，再用关联 block 补足 slot / group / renderer 等 UI 信息。
 */
function createRuntimeTranscriptTools(
  snapshot: RuntimeSnapshot,
  blocks: SurfaceBlock[]
): RuntimeTranscriptTool[] {
  const tools: RuntimeTranscriptTool[] = [];
  const seen = new Set<string>();
  const blocksByNodeId = new Map<string, SurfaceBlock[]>();

  for (const block of blocks) {
    if (!block.nodeId) {
      continue;
    }

    const bucket = blocksByNodeId.get(block.nodeId) ?? [];
    bucket.push(block);
    blocksByNodeId.set(block.nodeId, bucket);
  }

  for (const node of snapshot.nodes) {
    if (node.type !== 'tool') {
      continue;
    }

    const relatedBlocks = blocksByNodeId.get(node.id) ?? [];
    const primaryBlock =
      relatedBlocks.find((candidate) => candidate.type === 'tool')
      ?? relatedBlocks[0];

    if (primaryBlock) {
      tools.push(createToolEntryFromBlock(primaryBlock, snapshot, node));
      seen.add(primaryBlock.id);
      continue;
    }

    if (blocks.length !== snapshot.blocks.length) {
      continue;
    }

    const nodeData = resolveRecord(node.data);
    const title = readString(node.title);
    const message = readString(node.message);
    const status = readString(node.status);

    tools.push({
      id: node.id,
      nodeId: node.id,
      ...(title !== undefined ? { title } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(nodeData.result !== undefined ? { result: nodeData.result } : {}),
      ...(node.startedAt !== undefined ? { startedAt: node.startedAt } : {}),
      ...(node.updatedAt !== undefined ? { updatedAt: node.updatedAt } : {}),
      ...(node.endedAt !== undefined ? { endedAt: node.endedAt } : {})
    });
  }

  for (const block of blocks) {
    if (block.type !== 'tool' || seen.has(block.id)) {
      continue;
    }

    tools.push(createToolEntryFromBlock(block, snapshot));
  }

  return tools;
}

/**
 * 提取 transcript 中的 artifact 摘要。
 * 这类 block 本身就是 UI 语义单元，所以直接按 block 导出。
 */
function createRuntimeTranscriptArtifacts(
  snapshot: RuntimeSnapshot,
  blocks: SurfaceBlock[]
): RuntimeTranscriptArtifact[] {
  return blocks
    .filter((block) => {
      const data = resolveRecord(block.data);
      return block.type === 'artifact' || data.kind === 'artifact';
    })
    .map((block) => {
      const data = resolveRecord(block.data);
      const artifactId = readString(data.artifactId);
      const title = readString(data.title);
      const message = readString(data.message);
      const artifactKind = readString(data.artifactKind);
      const label = readString(data.label);
      const href = readString(data.href);
      const refId = readString(data.refId);

      return {
        id: artifactId ?? block.id,
        blockId: block.id,
        slot: block.slot,
        ...(block.groupId !== undefined ? { groupId: block.groupId } : {}),
        role: resolveBlockRole(block, snapshot),
        ...(title !== undefined ? { title } : {}),
        ...(message !== undefined ? { message } : {}),
        ...(artifactId ? { artifactId } : {}),
        ...(artifactKind !== undefined ? { artifactKind } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(href !== undefined ? { href } : {}),
        ...(refId !== undefined ? { refId } : {}),
        ...(block.createdAt !== undefined ? { createdAt: block.createdAt } : {}),
        ...(block.updatedAt !== undefined ? { updatedAt: block.updatedAt } : {})
      };
    });
}

/**
 * 提取 transcript 中的 approval 摘要。
 */
function createRuntimeTranscriptApprovals(
  snapshot: RuntimeSnapshot,
  blocks: SurfaceBlock[]
): RuntimeTranscriptApproval[] {
  return blocks
    .filter((block) => {
      const data = resolveRecord(block.data);
      return block.type === 'approval' || data.kind === 'approval';
    })
    .map((block) => {
      const data = resolveRecord(block.data);
      const approvalId = readString(data.approvalId);
      const title = readString(data.title);
      const message = readString(data.message);
      const status = readString(data.status);
      const refId = readString(data.refId);

      return {
        id: approvalId ?? block.id,
        blockId: block.id,
        slot: block.slot,
        ...(block.groupId !== undefined ? { groupId: block.groupId } : {}),
        role: resolveBlockRole(block, snapshot),
        ...(title !== undefined ? { title } : {}),
        ...(message !== undefined ? { message } : {}),
        ...(approvalId ? { approvalId } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(refId !== undefined ? { refId } : {}),
        ...(block.createdAt !== undefined ? { createdAt: block.createdAt } : {}),
        ...(block.updatedAt !== undefined ? { updatedAt: block.updatedAt } : {})
      };
    });
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
  const blocks = resolveTranscriptBlocks(snapshot, options);
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
  const blocks = resolveTranscriptBlocks(snapshot, options);

  return {
    format: 'agentdown.transcript/v0',
    exportedAt: Date.now(),
    snapshot,
    history: resolveHistory(input),
    messages: createRuntimeTranscriptMessages(snapshot, options),
    tools: createRuntimeTranscriptTools(snapshot, blocks),
    artifacts: createRuntimeTranscriptArtifacts(snapshot, blocks),
    approvals: createRuntimeTranscriptApprovals(snapshot, blocks)
  };
}

/**
 * 校验一个对象是否已经是完整 transcript。
 * 适合导入时先做轻量判断，或在应用层做类型守卫。
 */
export function isRuntimeTranscript(value: unknown): value is RuntimeTranscript {
  const record = resolveRecord(value);
  const snapshot = resolveRecord(record.snapshot);

  return record.format === 'agentdown.transcript/v0'
    && hasArrayField(record, 'history')
    && hasArrayField(record, 'messages')
    && hasArrayField(record, 'tools')
    && hasArrayField(record, 'artifacts')
    && hasArrayField(record, 'approvals')
    && hasArrayField(snapshot, 'nodes')
    && hasArrayField(snapshot, 'blocks')
    && hasArrayField(snapshot, 'intents');
}

/**
 * 把 JSON 字符串或普通对象规范化成 transcript。
 * 如果导入内容缺少 messages / tools / artifacts / approvals，会基于 snapshot 自动补齐。
 */
export function parseRuntimeTranscript(
  input: string | RuntimeTranscript | Record<string, unknown>,
  options: CreateRuntimeTranscriptOptions = {}
): RuntimeTranscript {
  let value: unknown = input;

  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error('Transcript JSON 解析失败。');
    }
  }

  const record = resolveRecord(value);
  const snapshotRecord = resolveRecord(record.snapshot);

  if (
    !hasArrayField(snapshotRecord, 'nodes')
    || !hasArrayField(snapshotRecord, 'blocks')
    || !hasArrayField(snapshotRecord, 'intents')
  ) {
    throw new Error('Transcript snapshot 结构无效。');
  }

  const historySource = hasArrayField(record, 'history')
    ? (record.history as RuntimeHistoryEntry[])
    : hasArrayField(snapshotRecord, 'history')
      ? (snapshotRecord.history as RuntimeHistoryEntry[])
      : null;

  if (!historySource) {
    throw new Error('Transcript history 缺失。');
  }

  const snapshot: RuntimeSnapshot = {
    nodes: cloneValue(snapshotRecord.nodes as RuntimeSnapshot['nodes']),
    blocks: cloneValue(snapshotRecord.blocks as RuntimeSnapshot['blocks']),
    intents: cloneValue(snapshotRecord.intents as RuntimeSnapshot['intents']),
    history: cloneValue(historySource)
  };

  const history = cloneValue(historySource);
  const blocks = resolveTranscriptBlocks(snapshot, options);
  const shouldRebuildViews = options.slot !== undefined;

  return {
    format: 'agentdown.transcript/v0',
    exportedAt: typeof record.exportedAt === 'number' ? record.exportedAt : Date.now(),
    snapshot,
    history,
    messages: !shouldRebuildViews && hasArrayField(record, 'messages')
      ? cloneValue(record.messages as RuntimeTranscriptMessage[])
      : createRuntimeTranscriptMessages(snapshot, options),
    tools: !shouldRebuildViews && hasArrayField(record, 'tools')
      ? cloneValue(record.tools as RuntimeTranscriptTool[])
      : createRuntimeTranscriptTools(snapshot, blocks),
    artifacts: !shouldRebuildViews && hasArrayField(record, 'artifacts')
      ? cloneValue(record.artifacts as RuntimeTranscriptArtifact[])
      : createRuntimeTranscriptArtifacts(snapshot, blocks),
    approvals: !shouldRebuildViews && hasArrayField(record, 'approvals')
      ? cloneValue(record.approvals as RuntimeTranscriptApproval[])
      : createRuntimeTranscriptApprovals(snapshot, blocks)
  };
}

/**
 * 选择是否把某条 intent 重新派发到目标 runtime。
 */
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

/**
 * 对单条 history entry 执行 command 或 intent 回放。
 */
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

/**
 * 按给定间隔等待一段时间，并支持通过 signal 中断。
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', abortListener);
      resolve();
    }, ms);

    /**
     * 在回放中断时清理定时器并拒绝等待。
     */
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

  /**
   * 把 player 重置到初始状态。
   */
  function reset() {
    runtime.reset();
    playedEntries.splice(0, playedEntries.length);
    cursor = 0;
    currentEntry = null;
    replayStatus = 'idle';
    return runtime.snapshot();
  }

  /**
   * 按顺序推进指定数量的 history entry。
   */
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
