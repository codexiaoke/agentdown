import type {
  AgentRuntime,
  BlockInsertCommand,
  BlockPatchCommand,
  RuntimeCommand,
  RuntimeCommandHistoryEntry,
  RuntimeHistoryEntry,
  RuntimeIntent,
  RuntimeIntentHistoryEntry,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock
} from './types';
import { cloneValue, compactObject, createIdFactory, toArray } from './utils';

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
export function createAgentRuntime(): AgentRuntime {
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

  /**
   * 通知所有订阅者 runtime 已发生变化。
   */
  function notify() {
    for (const listener of listeners) {
      listener();
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
    for (const command of toArray(commands)) {
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
          throw new Error(`Runtime cannot apply "${command.type}" directly. Route stream commands through createBridge().`);
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
    const intent: RuntimeIntent = compactObject({
      ...intentInput,
      id: makeId('intent'),
      at: Date.now()
    });

    intentsList.push(intent);
    recordIntent(intent);
    notify();
    return cloneValue(intent);
  }

  /**
   * 导出当前 runtime 的完整快照。
   */
  function snapshot(): RuntimeSnapshot {
    return {
      nodes: nodes(),
      blocks: blocks(),
      intents: intents(),
      history: history()
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
    subscribe,
    reset
  };
}
