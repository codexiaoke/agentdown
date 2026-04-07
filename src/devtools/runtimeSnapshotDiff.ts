import type {
  RuntimeIntent,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';

/**
 * runtime diff 里统一使用的内容摘要长度配置。
 */
export interface ResolveRuntimeSnapshotDiffOptions {
  /** 文本摘要最多保留多少字符。 */
  previewChars?: number;
}

/**
 * block 在 diff 面板里展示的最小预览结构。
 */
export interface RuntimeSnapshotBlockPreview {
  /** block id。 */
  id: string;
  /** 当前 block 类型。 */
  type: string;
  /** 当前 renderer key。 */
  renderer: string;
  /** 当前 block 状态。 */
  state: SurfaceBlock['state'];
  /** 当前所在 slot。 */
  slot: string;
  /** 当前所属消息 id。 */
  messageId: string | null;
  /** 当前所属 group id。 */
  groupId: string | null;
  /** 当前文字摘要。 */
  contentPreview: string;
}

/**
 * node 在 diff 面板里展示的最小预览结构。
 */
export interface RuntimeSnapshotNodePreview {
  /** node id。 */
  id: string;
  /** node 类型。 */
  type: string;
  /** node 标题。 */
  title: string | null;
  /** node 状态。 */
  status: string | null;
  /** node 父节点 id。 */
  parentId: string | null;
}

/**
 * intent 在 diff 面板里展示的最小预览结构。
 */
export interface RuntimeSnapshotIntentPreview {
  /** intent id。 */
  id: string;
  /** intent 类型。 */
  type: string;
  /** 关联 node id。 */
  nodeId: string | null;
  /** 关联 block id。 */
  blockId: string | null;
  /** 触发时间。 */
  at: number;
}

/**
 * 一条“更新前后” diff 记录的通用结构。
 */
export interface RuntimeSnapshotUpdatedEntry<TPreview> {
  /** 当前实体 id。 */
  id: string;
  /** 更新前预览。 */
  previous: TPreview;
  /** 更新后预览。 */
  current: TPreview;
}

/**
 * runtime snapshot diff 的计数汇总。
 */
export interface RuntimeSnapshotDiffSummary {
  /** 新增 node 数。 */
  addedNodeCount: number;
  /** 更新 node 数。 */
  updatedNodeCount: number;
  /** 删除 node 数。 */
  removedNodeCount: number;
  /** 新增 block 数。 */
  addedBlockCount: number;
  /** 更新 block 数。 */
  updatedBlockCount: number;
  /** 删除 block 数。 */
  removedBlockCount: number;
  /** 新增 intent 数。 */
  addedIntentCount: number;
  /** 删除 intent 数。 */
  removedIntentCount: number;
  /** history 条目数量变化。 */
  historyDelta: number;
}

/**
 * 一次完整 runtime snapshot 对比后的结构化结果。
 */
export interface RuntimeSnapshotDiff {
  /** 本次 diff 的计数汇总。 */
  summary: RuntimeSnapshotDiffSummary;
  /** node 变化明细。 */
  nodes: {
    /** 新增 node。 */
    added: RuntimeSnapshotNodePreview[];
    /** 更新 node。 */
    updated: RuntimeSnapshotUpdatedEntry<RuntimeSnapshotNodePreview>[];
    /** 删除 node。 */
    removed: RuntimeSnapshotNodePreview[];
  };
  /** block 变化明细。 */
  blocks: {
    /** 新增 block。 */
    added: RuntimeSnapshotBlockPreview[];
    /** 更新 block。 */
    updated: RuntimeSnapshotUpdatedEntry<RuntimeSnapshotBlockPreview>[];
    /** 删除 block。 */
    removed: RuntimeSnapshotBlockPreview[];
  };
  /** intent 变化明细。 */
  intents: {
    /** 新增 intent。 */
    added: RuntimeSnapshotIntentPreview[];
    /** 删除 intent。 */
    removed: RuntimeSnapshotIntentPreview[];
  };
}

/**
 * 把任意字符串整理成稳定的单行摘要。
 */
function createPreviewText(value: string | undefined, previewChars: number): string {
  const normalized = (value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return '(空)';
  }

  if (normalized.length <= previewChars) {
    return normalized;
  }

  return `${normalized.slice(0, previewChars)}...`;
}

/**
 * 把 block 收敛成适合 diff 面板展示的最小预览。
 */
function createBlockPreview(
  block: SurfaceBlock,
  previewChars: number
): RuntimeSnapshotBlockPreview {
  return {
    id: block.id,
    type: block.type,
    renderer: block.renderer,
    state: block.state,
    slot: block.slot,
    messageId: block.messageId ?? null,
    groupId: block.groupId ?? null,
    contentPreview: createPreviewText(block.content, previewChars)
  };
}

/**
 * 把 node 收敛成适合 diff 面板展示的最小预览。
 */
function createNodePreview(node: RuntimeNode): RuntimeSnapshotNodePreview {
  return {
    id: node.id,
    type: node.type,
    title: node.title ?? null,
    status: node.status ?? null,
    parentId: node.parentId ?? null
  };
}

/**
 * 把 intent 收敛成适合 diff 面板展示的最小预览。
 */
function createIntentPreview(intent: RuntimeIntent): RuntimeSnapshotIntentPreview {
  return {
    id: intent.id,
    type: intent.type,
    nodeId: intent.nodeId ?? null,
    blockId: intent.blockId ?? null,
    at: intent.at
  };
}

/**
 * 用 JSON 序列化判断两个 runtime 实体是否真的发生变化。
 *
 * 这条逻辑是 devtools 专用路径，
 * 优先保证简单、稳定和可读，而不是追求最极致的 diff 性能。
 */
function hasRecordChanged(previous: unknown, current: unknown): boolean {
  return JSON.stringify(previous) !== JSON.stringify(current);
}

/**
 * 把列表转换成以 id 为键的索引表。
 */
function createRecordMap<TItem extends { id: string }>(
  items: TItem[]
): Map<string, TItem> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * 对一组带 id 的实体执行新增 / 更新 / 删除比对。
 */
function resolveRecordChanges<
  TItem extends { id: string },
  TPreview
>(
  previousItems: TItem[],
  nextItems: TItem[],
  createPreview: (item: TItem) => TPreview
): {
  added: TPreview[];
  updated: RuntimeSnapshotUpdatedEntry<TPreview>[];
  removed: TPreview[];
} {
  const previousMap = createRecordMap(previousItems);
  const nextMap = createRecordMap(nextItems);
  const added: TPreview[] = [];
  const updated: RuntimeSnapshotUpdatedEntry<TPreview>[] = [];
  const removed: TPreview[] = [];

  for (const item of nextItems) {
    const previous = previousMap.get(item.id);

    if (!previous) {
      added.push(createPreview(item));
      continue;
    }

    if (hasRecordChanged(previous, item)) {
      updated.push({
        id: item.id,
        previous: createPreview(previous),
        current: createPreview(item)
      });
    }
  }

  for (const item of previousItems) {
    if (!nextMap.has(item.id)) {
      removed.push(createPreview(item));
    }
  }

  return {
    added,
    updated,
    removed
  };
}

/**
 * 判断这次 diff 是否真的包含可见变化。
 */
export function hasRuntimeSnapshotDiffChanges(
  diff: RuntimeSnapshotDiff
): boolean {
  return diff.summary.addedNodeCount > 0
    || diff.summary.updatedNodeCount > 0
    || diff.summary.removedNodeCount > 0
    || diff.summary.addedBlockCount > 0
    || diff.summary.updatedBlockCount > 0
    || diff.summary.removedBlockCount > 0
    || diff.summary.addedIntentCount > 0
    || diff.summary.removedIntentCount > 0
    || diff.summary.historyDelta !== 0;
}

/**
 * 对比前后两份 runtime snapshot，并生成面向 devtools 的结构化 diff。
 */
export function resolveRuntimeSnapshotDiff(
  previousSnapshot: RuntimeSnapshot,
  nextSnapshot: RuntimeSnapshot,
  options: ResolveRuntimeSnapshotDiffOptions = {}
): RuntimeSnapshotDiff {
  const previewChars = Math.max(32, options.previewChars ?? 96);
  const nodeChanges = resolveRecordChanges(
    previousSnapshot.nodes,
    nextSnapshot.nodes,
    createNodePreview
  );
  const blockChanges = resolveRecordChanges(
    previousSnapshot.blocks,
    nextSnapshot.blocks,
    (block) => createBlockPreview(block, previewChars)
  );
  const intentChanges = resolveRecordChanges(
    previousSnapshot.intents,
    nextSnapshot.intents,
    createIntentPreview
  );

  return {
    summary: {
      addedNodeCount: nodeChanges.added.length,
      updatedNodeCount: nodeChanges.updated.length,
      removedNodeCount: nodeChanges.removed.length,
      addedBlockCount: blockChanges.added.length,
      updatedBlockCount: blockChanges.updated.length,
      removedBlockCount: blockChanges.removed.length,
      addedIntentCount: intentChanges.added.length,
      removedIntentCount: intentChanges.removed.length,
      historyDelta: nextSnapshot.history.length - previousSnapshot.history.length
    },
    nodes: nodeChanges,
    blocks: blockChanges,
    intents: {
      added: intentChanges.added,
      removed: intentChanges.removed
    }
  };
}
