import type {
  AgentRuntime,
  AgentRuntimeLimits,
  AgentRuntimeOptions,
  AgentRuntimeStats,
  BlockInsertCommand,
  BlockPatchCommand,
  RuntimeCommand,
  RuntimeCommandHistoryEntry,
  RuntimeHistoryEntry,
  RuntimeIntent,
  RuntimeIntentHistoryEntry,
  RuntimeNode,
  RuntimeSnapshot,
  RuntimeSnapshotOptions,
  SurfaceBlock
} from './types';
import { cloneValue, compactObject, createIdFactory, toArray } from './utils';

/**
 * 默认容量足以承载长对话，同时避免失控的数据源无限占用内存。
 */
export const DEFAULT_AGENT_RUNTIME_LIMITS = Object.freeze({
  maxNodes: 10_000,
  maxBlocks: 20_000,
  maxIntents: 2_000,
  maxHistoryEntries: 5_000
}) satisfies Readonly<AgentRuntimeLimits>;

/**
 * runtime 容量达到上限时抛出的稳定错误类型。
 */
export class AgentRuntimeLimitError extends Error {
  readonly code = 'AGENTDOWN_RUNTIME_LIMIT_EXCEEDED';

  constructor(
    readonly resource: 'nodes' | 'blocks',
    readonly limit: number,
    readonly attempted: number
  ) {
    super(`Agentdown runtime ${resource} limit exceeded: attempted ${attempted}, limit ${limit}.`);
    this.name = 'AgentRuntimeLimitError';
  }
}

/**
 * 规范化单个容量配置，并尽早拒绝模糊或无效的值。
 */
function resolveLimit(
  value: number | false | undefined,
  fallback: number,
  name: keyof AgentRuntimeLimits
): number | false {
  if (value === false) {
    return false;
  }

  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Agentdown runtime limit "${name}" must be a non-negative safe integer or false.`);
  }

  return value;
}

/**
 * 解析完整 runtime 容量配置。
 */
function resolveLimits(options: AgentRuntimeOptions | undefined): AgentRuntimeLimits {
  return {
    maxNodes: resolveLimit(options?.limits?.maxNodes, DEFAULT_AGENT_RUNTIME_LIMITS.maxNodes, 'maxNodes'),
    maxBlocks: resolveLimit(options?.limits?.maxBlocks, DEFAULT_AGENT_RUNTIME_LIMITS.maxBlocks, 'maxBlocks'),
    maxIntents: resolveLimit(options?.limits?.maxIntents, DEFAULT_AGENT_RUNTIME_LIMITS.maxIntents, 'maxIntents'),
    maxHistoryEntries: resolveLimit(
      options?.limits?.maxHistoryEntries,
      DEFAULT_AGENT_RUNTIME_LIMITS.maxHistoryEntries,
      'maxHistoryEntries'
    )
  };
}

/**
 * 判断未知值是否为可承载 runtime 数据的普通记录。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 校验必填字符串，阻止自定义协议绕过 TypeScript 后写入畸形状态。
 */
function assertString(value: unknown, path: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Agentdown runtime command requires a non-empty string at "${path}".`);
  }
}

/**
 * 在任何状态变更前校验一条 runtime 命令的基本结构。
 */
function validateRuntimeCommand(command: unknown, index: number): asserts command is RuntimeCommand {
  if (!isRecord(command)) {
    throw new TypeError(`Agentdown runtime command at index ${index} must be an object.`);
  }

  assertString(command.type, `commands[${index}].type`);

  switch (command.type) {
    case 'node.upsert':
      if (!isRecord(command.node)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires "node".`);
      }
      assertString(command.node.id, `commands[${index}].node.id`);
      assertString(command.node.type, `commands[${index}].node.type`);
      if (!isRecord(command.node.data)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires object "node.data".`);
      }
      return;
    case 'node.patch':
      assertString(command.id, `commands[${index}].id`);
      if (!isRecord(command.patch)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires "patch".`);
      }
      if (command.patch.data !== undefined && !isRecord(command.patch.data)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires object "patch.data".`);
      }
      return;
    case 'node.remove':
    case 'block.remove':
      assertString(command.id, `commands[${index}].id`);
      return;
    case 'block.insert':
    case 'block.upsert':
      if (!isRecord(command.block)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires "block".`);
      }
      assertString(command.block.id, `commands[${index}].block.id`);
      assertString(command.block.slot, `commands[${index}].block.slot`);
      assertString(command.block.type, `commands[${index}].block.type`);
      assertString(command.block.renderer, `commands[${index}].block.renderer`);
      if (!['draft', 'stable', 'settled'].includes(String(command.block.state))) {
        throw new TypeError(`Agentdown runtime command at index ${index} has invalid "block.state".`);
      }
      if (!isRecord(command.block.data)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires object "block.data".`);
      }
      return;
    case 'block.patch':
      assertString(command.id, `commands[${index}].id`);
      if (!isRecord(command.patch)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires "patch".`);
      }
      if (command.patch.data !== undefined && !isRecord(command.patch.data)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires object "patch.data".`);
      }
      return;
    case 'event.record':
      if (!isRecord(command.event)) {
        throw new TypeError(`Agentdown runtime command at index ${index} requires object "event".`);
      }
      return;
    case 'stream.open':
    case 'stream.delta':
    case 'stream.close':
    case 'stream.abort':
      throw new TypeError(`Runtime cannot apply "${command.type}" directly. Route stream commands through createBridge().`);
    default:
      throw new TypeError(`Agentdown runtime command at index ${index} has unsupported type "${command.type}".`);
  }
}

/**
 * 规范化节点结构，并确保 data 可安全复用。
 */
function normalizeNode(node: RuntimeNode): RuntimeNode {
  return compactObject({
    ...node,
    data: cloneValue(node.data ?? {})
  });
}

/**
 * 规范化 block 结构，并确保 data 可安全复用。
 */
function normalizeBlock(block: SurfaceBlock): SurfaceBlock {
  return compactObject({
    ...block,
    data: cloneValue(block.data ?? {})
  });
}

/**
 * 生成节点 patch 之后的完整节点对象。
 */
function normalizeNodePatch(node: RuntimeNode, patch: Partial<RuntimeNode>): RuntimeNode {
  const next = compactObject({
    ...node,
    ...patch,
    id: node.id,
    data: {
      ...(node.data ?? {}),
      ...cloneValue(patch.data ?? {})
    }
  });

  return next;
}

/**
 * 生成 block patch 之后的完整 block 对象。
 */
function normalizeBlockPatch(block: SurfaceBlock, patch: Partial<SurfaceBlock>): SurfaceBlock {
  const next = compactObject({
    ...block,
    ...patch,
    id: block.id,
    data: {
      ...(block.data ?? {}),
      ...cloneValue(patch.data ?? {})
    }
  });

  return next;
}

/**
 * 在有序 ID 列表中插入或移动某个元素。
 */
function insertIntoOrder(order: string[], id: string, beforeId?: string, afterId?: string) {
  const filtered = order.filter((current) => current !== id);

  if (beforeId) {
    const beforeIndex = filtered.indexOf(beforeId);

    if (beforeIndex >= 0) {
      filtered.splice(beforeIndex, 0, id);
      return filtered;
    }
  }

  if (afterId) {
    const afterIndex = filtered.indexOf(afterId);

    if (afterIndex >= 0) {
      filtered.splice(afterIndex + 1, 0, id);
      return filtered;
    }
  }

  filtered.push(id);
  return filtered;
}

/**
 * 创建一个纯命令驱动的响应式 runtime。
 */
export function createAgentRuntime(options: AgentRuntimeOptions = {}): AgentRuntime {
  const limits = resolveLimits(options);
  const makeId = createIdFactory();
  const listeners = new Set<() => void>();
  const nodesById = new Map<string, RuntimeNode>();
  const nodeOrder: string[] = [];
  const childIdsByParent = new Map<string, string[]>();

  const blocksById = new Map<string, SurfaceBlock>();
  const blockOrderBySlot = new Map<string, string[]>();
  const slotOrder: string[] = [];

  const intentsList: RuntimeIntent[] = [];
  const historyEntries: RuntimeHistoryEntry[] = [];
  let revision = 0;
  let droppedIntentCount = 0;
  let droppedHistoryEntryCount = 0;

  /**
   * 保留数组尾部最近的数据，并返回本次丢弃条数。
   */
  function retainLatest<T>(items: T[], limit: number | false): number {
    if (limit === false || items.length <= limit) {
      return 0;
    }

    const dropped = items.length - limit;
    items.splice(0, dropped);
    return dropped;
  }

  /**
   * 通过宿主钩子报告订阅者异常；诊断钩子自身也不能破坏 runtime。
   */
  function reportListenerError(error: unknown) {
    if (options.onListenerError) {
      try {
        options.onListenerError(error, { revision });
        return;
      } catch (diagnosticError) {
        globalThis.console?.error?.('[Agentdown] runtime listener error handler failed.', diagnosticError);
      }
    }

    globalThis.console?.error?.('[Agentdown] runtime listener failed.', error);
  }

  /**
   * 通知所有订阅者 runtime 已发生变化。
   */
  function notify() {
    revision += 1;

    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  /**
   * 记录一条命令到 history。
   */
  function recordCommand(command: RuntimeCommand) {
    const entry: RuntimeCommandHistoryEntry = {
      id: makeId('history'),
      kind: 'command',
      at: Date.now(),
      command: cloneValue(command)
    };

    historyEntries.push(entry);
    droppedHistoryEntryCount += retainLatest(historyEntries, limits.maxHistoryEntries);
  }

  /**
   * 记录一条 intent 到 history。
   */
  function recordIntent(intent: RuntimeIntent) {
    const entry: RuntimeIntentHistoryEntry = {
      id: makeId('history'),
      kind: 'intent',
      at: intent.at,
      intent: cloneValue(intent)
    };

    historyEntries.push(entry);
    droppedHistoryEntryCount += retainLatest(historyEntries, limits.maxHistoryEntries);
  }

  /**
   * 克隆并预校验整批命令，同时在写入前计算最终资源占用。
   */
  function prepareCommands(input: RuntimeCommand | RuntimeCommand[]): RuntimeCommand[] {
    const source = toArray(input) as unknown[];
    const prepared = source.map((command, index) => {
      validateRuntimeCommand(command, index);
      return cloneValue(command);
    });
    const projectedNodeIds = new Set(nodesById.keys());
    const projectedBlockIds = new Set(blocksById.keys());

    for (const command of prepared) {
      switch (command.type) {
        case 'node.upsert':
          projectedNodeIds.add(command.node.id);
          break;
        case 'node.patch':
          projectedNodeIds.add(command.id);
          break;
        case 'node.remove':
          projectedNodeIds.delete(command.id);
          break;
        case 'block.insert':
        case 'block.upsert':
          projectedBlockIds.add(command.block.id);
          break;
        case 'block.patch':
          projectedBlockIds.add(command.id);
          break;
        case 'block.remove':
          projectedBlockIds.delete(command.id);
          break;
        case 'event.record':
          break;
        case 'stream.open':
        case 'stream.delta':
        case 'stream.close':
        case 'stream.abort':
          throw new TypeError(`Runtime cannot apply "${command.type}" directly. Route stream commands through createBridge().`);
      }
    }

    if (limits.maxNodes !== false && projectedNodeIds.size > limits.maxNodes) {
      throw new AgentRuntimeLimitError('nodes', limits.maxNodes, projectedNodeIds.size);
    }

    if (limits.maxBlocks !== false && projectedBlockIds.size > limits.maxBlocks) {
      throw new AgentRuntimeLimitError('blocks', limits.maxBlocks, projectedBlockIds.size);
    }

    return prepared;
  }

  /**
   * 创建或更新一个节点，并维护父子关系索引。
   */
  function upsertNode(node: RuntimeNode) {
    const existing = nodesById.get(node.id);
    const normalized = existing ? normalizeNodePatch(existing, node) : normalizeNode(node);
    const previousParentId = existing?.parentId ?? null;
    const nextParentId = normalized.parentId ?? null;

    nodesById.set(node.id, normalized);

    if (!existing) {
      nodeOrder.push(node.id);
    }

    if (previousParentId && previousParentId !== nextParentId) {
      const previousChildren = childIdsByParent.get(previousParentId) ?? [];
      childIdsByParent.set(
        previousParentId,
        previousChildren.filter((childId) => childId !== node.id)
      );
    }

    if (nextParentId) {
      const nextChildren = childIdsByParent.get(nextParentId) ?? [];

      if (!nextChildren.includes(node.id)) {
        childIdsByParent.set(nextParentId, [...nextChildren, node.id]);
      }
    }
  }

  /**
   * 局部更新一个节点；若节点不存在则按 patch 信息创建。
   */
  function patchNode(id: string, patch: Partial<RuntimeNode>) {
    const existing = nodesById.get(id);

    if (!existing) {
      upsertNode({
        id,
        type: patch.type ?? 'node',
        data: cloneValue(patch.data ?? {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.message ? { message: patch.message } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {}),
        ...(patch.endedAt !== undefined ? { endedAt: patch.endedAt } : {})
      });
      return;
    }

    upsertNode(normalizeNodePatch(existing, patch));
  }

  /**
   * 删除一个节点，并同步清理排序和父子索引。
   */
  function removeNode(id: string) {
    const existing = nodesById.get(id);

    if (!existing) {
      return;
    }

    nodesById.delete(id);

    const orderIndex = nodeOrder.indexOf(id);

    if (orderIndex >= 0) {
      nodeOrder.splice(orderIndex, 1);
    }

    if (existing.parentId) {
      const siblings = childIdsByParent.get(existing.parentId) ?? [];
      childIdsByParent.set(
        existing.parentId,
        siblings.filter((childId) => childId !== id)
      );
    }

    childIdsByParent.delete(id);
  }

  /**
   * 确保指定 slot 已经建立排序容器。
   */
  function ensureSlot(slot: string) {
    if (!blockOrderBySlot.has(slot)) {
      blockOrderBySlot.set(slot, []);
      slotOrder.push(slot);
    }
  }

  /**
   * 按插入顺序把 block 放进对应 slot。
   */
  function placeBlock(command: BlockInsertCommand) {
    const normalized = normalizeBlock(command.block);
    const previous = blocksById.get(normalized.id);
    const previousSlot = previous?.slot;

    blocksById.set(normalized.id, normalized);
    ensureSlot(normalized.slot);

    if (previousSlot && previousSlot !== normalized.slot) {
      const previousOrder = blockOrderBySlot.get(previousSlot) ?? [];
      blockOrderBySlot.set(
        previousSlot,
        previousOrder.filter((blockId) => blockId !== normalized.id)
      );
    }

    const slotOrderList = blockOrderBySlot.get(normalized.slot) ?? [];
    blockOrderBySlot.set(
      normalized.slot,
      insertIntoOrder(slotOrderList, normalized.id, command.beforeId, command.afterId)
    );
  }

  /**
   * 创建或覆盖一个 block。
   */
  function upsertBlock(block: SurfaceBlock) {
    placeBlock({
      type: 'block.insert',
      block
    });
  }

  /**
   * 局部更新一个 block；若 block 不存在则按 patch 信息创建。
   */
  function patchBlock(id: string, patch: BlockPatchCommand['patch']) {
    const existing = blocksById.get(id);

    if (!existing) {
      upsertBlock({
        id,
        slot: patch.slot ?? 'main',
        type: patch.type ?? 'block',
        renderer: patch.renderer ?? patch.type ?? 'block',
        state: patch.state ?? 'stable',
        data: cloneValue(patch.data ?? {}),
        ...(patch.nodeId !== undefined ? { nodeId: patch.nodeId } : {}),
        ...(patch.groupId !== undefined ? { groupId: patch.groupId } : {}),
        ...(patch.conversationId !== undefined ? { conversationId: patch.conversationId } : {}),
        ...(patch.turnId !== undefined ? { turnId: patch.turnId } : {}),
        ...(patch.messageId !== undefined ? { messageId: patch.messageId } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.createdAt !== undefined ? { createdAt: patch.createdAt } : {}),
        ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {})
      });
      return;
    }

    const next = normalizeBlockPatch(existing, patch);

    if (next.slot !== existing.slot) {
      const previousOrder = blockOrderBySlot.get(existing.slot) ?? [];
      blockOrderBySlot.set(
        existing.slot,
        previousOrder.filter((blockId) => blockId !== id)
      );
      ensureSlot(next.slot);
      const nextOrder = blockOrderBySlot.get(next.slot) ?? [];
      blockOrderBySlot.set(next.slot, [...nextOrder, id]);
    }

    blocksById.set(id, next);
  }

  /**
   * 删除一个 block，并从 slot 排序里移除。
   */
  function removeBlock(id: string) {
    const existing = blocksById.get(id);

    if (!existing) {
      return;
    }

    blocksById.delete(id);

    const order = blockOrderBySlot.get(existing.slot) ?? [];
    blockOrderBySlot.set(
      existing.slot,
      order.filter((blockId) => blockId !== id)
    );
  }

  /**
   * 应用一条或多条 runtime 命令。
   */
  function apply(commands: RuntimeCommand | RuntimeCommand[]) {
    const prepared = prepareCommands(commands);

    if (prepared.length === 0) {
      return;
    }

    for (const command of prepared) {
      switch (command.type) {
        case 'node.upsert':
          upsertNode(command.node);
          break;
        case 'node.patch':
          patchNode(command.id, command.patch);
          break;
        case 'node.remove':
          removeNode(command.id);
          break;
        case 'block.insert':
          placeBlock(command);
          break;
        case 'block.upsert':
          upsertBlock(command.block);
          break;
        case 'block.patch':
          patchBlock(command.id, command.patch);
          break;
        case 'block.remove':
          removeBlock(command.id);
          break;
        case 'event.record':
          break;
        case 'stream.open':
        case 'stream.delta':
        case 'stream.close':
        case 'stream.abort':
          break;
      }

      recordCommand(command);
    }

    notify();
  }

  /**
   * 按 ID 读取单个节点。
   */
  function node(id: string): RuntimeNode | undefined {
    const value = nodesById.get(id);
    return value ? cloneValue(value) : undefined;
  }

  /**
   * 按插入顺序读取全部节点。
   */
  function nodes(): RuntimeNode[] {
    return nodeOrder
      .map((id) => nodesById.get(id))
      .filter((value): value is RuntimeNode => value !== undefined)
      .map((value) => cloneValue(value));
  }

  /**
   * 按 ID 读取单个 block。
   */
  function block(id: string): SurfaceBlock | undefined {
    const value = blocksById.get(id);
    return value ? cloneValue(value) : undefined;
  }

  /**
   * 读取指定 slot 或全部 slot 下的 block。
   */
  function blocks(slot?: string): SurfaceBlock[] {
    if (slot) {
      const order = blockOrderBySlot.get(slot) ?? [];
      return order
        .map((id) => blocksById.get(id))
        .filter((value): value is SurfaceBlock => value !== undefined)
        .map((value) => cloneValue(value));
    }

    return slotOrder.flatMap((slotKey) => blocks(slotKey));
  }

  /**
   * 读取某个节点的直接子节点列表。
   */
  function children(nodeId: string): RuntimeNode[] {
    const ids = childIdsByParent.get(nodeId) ?? [];
    return ids
      .map((id) => nodesById.get(id))
      .filter((value): value is RuntimeNode => value !== undefined)
      .map((value) => cloneValue(value));
  }

  /**
   * 返回当前收集到的所有 intent。
   */
  function intents(): RuntimeIntent[] {
    return intentsList.map((intent) => cloneValue(intent));
  }

  /**
   * 返回完整 history 列表。
   */
  function history(): RuntimeHistoryEntry[] {
    return historyEntries.map((entry) => cloneValue(entry));
  }

  /**
   * 创建并记录一条新的 intent。
   */
  function emitIntent(intentInput: Omit<RuntimeIntent, 'id' | 'at'>): RuntimeIntent {
    if (!isRecord(intentInput)) {
      throw new TypeError('Agentdown runtime intent must be an object.');
    }

    assertString(intentInput.type, 'intent.type');

    if (!isRecord(intentInput.payload)) {
      throw new TypeError('Agentdown runtime intent payload must be an object.');
    }

    const intent: RuntimeIntent = compactObject({
      ...cloneValue(intentInput),
      id: makeId('intent'),
      at: Date.now()
    });

    intentsList.push(intent);
    droppedIntentCount += retainLatest(intentsList, limits.maxIntents);
    recordIntent(intent);
    notify();
    return cloneValue(intent);
  }

  /**
   * 导出当前 runtime 的完整快照。
   */
  function snapshot(snapshotOptions: RuntimeSnapshotOptions = {}): RuntimeSnapshot {
    return {
      nodes: nodes(),
      blocks: blocks(),
      intents: snapshotOptions.includeIntents === false ? [] : intents(),
      history: snapshotOptions.includeHistory === false ? [] : history()
    };
  }

  /**
   * 返回无需复制大对象的即时容量统计。
   */
  function stats(): AgentRuntimeStats {
    return {
      revision,
      nodeCount: nodesById.size,
      blockCount: blocksById.size,
      intentCount: intentsList.length,
      historyEntryCount: historyEntries.length,
      droppedIntentCount,
      droppedHistoryEntryCount
    };
  }

  /**
   * 把 runtime 恢复到初始空状态。
   */
  function reset() {
    nodesById.clear();
    nodeOrder.splice(0, nodeOrder.length);
    childIdsByParent.clear();
    blocksById.clear();
    blockOrderBySlot.clear();
    slotOrder.splice(0, slotOrder.length);
    intentsList.splice(0, intentsList.length);
    historyEntries.splice(0, historyEntries.length);
    droppedIntentCount = 0;
    droppedHistoryEntryCount = 0;
    notify();
  }

  /**
   * 订阅 runtime 变化，并返回取消订阅函数。
   */
  function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  return {
    apply,
    node,
    nodes,
    block,
    blocks,
    children,
    intents,
    history,
    emitIntent,
    snapshot,
    stats,
    subscribe,
    reset
  };
}
