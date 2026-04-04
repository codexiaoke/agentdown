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

function normalizeNode(node: RuntimeNode): RuntimeNode {
  return compactObject({
    ...node,
    data: cloneValue(node.data ?? {})
  });
}

function normalizeBlock(block: SurfaceBlock): SurfaceBlock {
  return compactObject({
    ...block,
    data: cloneValue(block.data ?? {})
  });
}

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

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function recordCommand(command: RuntimeCommand) {
    const entry: RuntimeCommandHistoryEntry = {
      id: makeId('history'),
      kind: 'command',
      at: Date.now(),
      command: cloneValue(command)
    };

    historyEntries.push(entry);
  }

  function recordIntent(intent: RuntimeIntent) {
    const entry: RuntimeIntentHistoryEntry = {
      id: makeId('history'),
      kind: 'intent',
      at: intent.at,
      intent: cloneValue(intent)
    };

    historyEntries.push(entry);
  }

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

  function ensureSlot(slot: string) {
    if (!blockOrderBySlot.has(slot)) {
      blockOrderBySlot.set(slot, []);
      slotOrder.push(slot);
    }
  }

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

  function upsertBlock(block: SurfaceBlock) {
    placeBlock({
      type: 'block.insert',
      block
    });
  }

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

  function node(id: string): RuntimeNode | undefined {
    const value = nodesById.get(id);
    return value ? cloneValue(value) : undefined;
  }

  function nodes(): RuntimeNode[] {
    return nodeOrder
      .map((id) => nodesById.get(id))
      .filter((value): value is RuntimeNode => value !== undefined)
      .map((value) => cloneValue(value));
  }

  function block(id: string): SurfaceBlock | undefined {
    const value = blocksById.get(id);
    return value ? cloneValue(value) : undefined;
  }

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

  function children(nodeId: string): RuntimeNode[] {
    const ids = childIdsByParent.get(nodeId) ?? [];
    return ids
      .map((id) => nodesById.get(id))
      .filter((value): value is RuntimeNode => value !== undefined)
      .map((value) => cloneValue(value));
  }

  function intents(): RuntimeIntent[] {
    return intentsList.map((intent) => cloneValue(intent));
  }

  function history(): RuntimeHistoryEntry[] {
    return historyEntries.map((entry) => cloneValue(entry));
  }

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

  function snapshot(): RuntimeSnapshot {
    return {
      nodes: nodes(),
      blocks: blocks(),
      intents: intents(),
      history: history()
    };
  }

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
