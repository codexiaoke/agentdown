import type {
  RuntimeCommand,
  RuntimeSnapshot
} from '../runtime/types';
import type { RuntimeSnapshotDiff } from './runtimeSnapshotDiff';

/**
 * 解析命令目标 block 时可用的补充配置。
 */
export interface ResolveRuntimeCommandTargetBlockIdsOptions {
  /** 当命令本身无法直接推出 block id 时可使用的回退结果。 */
  fallbackBlockIds?: string[];
}

/**
 * 解析 diff 目标 block 时可用的补充配置。
 */
export interface ResolveRuntimeSnapshotDiffTargetBlockIdsOptions {
  /** 是否把 removed block 也放进结果里。 */
  includeRemoved?: boolean;
}

/**
 * 对一组 block id 去重并保持原始顺序。
 */
function dedupeBlockIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      continue;
    }

    seen.add(id);
    next.push(id);
  }

  return next;
}

/**
 * 根据 node id 反查当前 snapshot 里关联的 block。
 */
function resolveNodeLinkedBlockIds(snapshot: RuntimeSnapshot, nodeId: string): string[] {
  return snapshot.blocks
    .filter((block) => block.nodeId === nodeId)
    .map((block) => block.id);
}

/**
 * 从一条 runtime command 推断最可能关联到哪些 block。
 *
 * 常见规则：
 * - block 命令：直接返回 block id
 * - node 命令：返回当前 snapshot 中挂在该 nodeId 下的 block
 * - stream / event 命令：使用外部传入的 fallback block ids
 */
export function resolveRuntimeCommandTargetBlockIds(
  command: RuntimeCommand,
  snapshot: RuntimeSnapshot,
  options: ResolveRuntimeCommandTargetBlockIdsOptions = {}
): string[] {
  switch (command.type) {
    case 'block.insert':
    case 'block.upsert':
      return dedupeBlockIds([command.block.id]);
    case 'block.patch':
    case 'block.remove':
      return dedupeBlockIds([command.id]);
    case 'node.upsert':
      return resolveNodeLinkedBlockIds(snapshot, command.node.id);
    case 'node.patch':
    case 'node.remove':
      return resolveNodeLinkedBlockIds(snapshot, command.id);
    case 'stream.open':
    case 'stream.delta':
    case 'stream.close':
    case 'stream.abort':
    case 'event.record':
      return dedupeBlockIds(options.fallbackBlockIds ?? []);
    default:
      return [];
  }
}

/**
 * 从一次 snapshot diff 推断当前最值得高亮的 block。
 *
 * 默认优先返回：
 * - 新增 block
 * - 更新 block
 * 如有需要，也可以把 removed block 一并带上。
 */
export function resolveRuntimeSnapshotDiffTargetBlockIds(
  diff: RuntimeSnapshotDiff,
  options: ResolveRuntimeSnapshotDiffTargetBlockIdsOptions = {}
): string[] {
  return dedupeBlockIds([
    ...diff.blocks.added.map((item) => item.id),
    ...diff.blocks.updated.map((item) => item.current.id),
    ...(options.includeRemoved
      ? diff.blocks.removed.map((item) => item.id)
      : [])
  ]);
}
