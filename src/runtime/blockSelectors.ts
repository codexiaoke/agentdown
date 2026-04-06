import type {
  AgentRuntime,
  RuntimeSnapshot,
  SurfaceBlock
} from './types';
import {
  getBlockConversationId,
  getBlockMessageId,
  getBlockTurnId
} from './chatSemantics';

/**
 * block selector 支持的输入源。
 *
 * 可以直接传：
 * - `AgentRuntime`
 * - `RuntimeSnapshot`
 */
export type RuntimeBlockSource = AgentRuntime | RuntimeSnapshot;

/**
 * 按 group 查询 block 时可附加的筛选条件。
 */
export interface RuntimeBlocksByGroupOptions {
  /** 只查询某个 slot 下的 block。 */
  slot?: string;
  /** 只保留指定 block.type。 */
  type?: string;
  /** 只保留指定 block.renderer。 */
  renderer?: string;
  /** 只保留指定 block.state。 */
  state?: SurfaceBlock['state'];
  /** 只保留关联到指定 nodeId 的 block。 */
  nodeId?: string | null;
}

/**
 * 按 messageId 查询 block 时可附加的筛选条件。
 */
export type RuntimeBlocksByMessageOptions = RuntimeBlocksByGroupOptions;

/**
 * 按 turnId 查询 block 时可附加的筛选条件。
 */
export type RuntimeBlocksByTurnOptions = RuntimeBlocksByGroupOptions;

/**
 * 按 conversationId 查询 block 时可附加的筛选条件。
 */
export type RuntimeBlocksByConversationOptions = RuntimeBlocksByGroupOptions;

/**
 * 判断当前输入是否为可读写的 runtime 实例。
 */
function isAgentRuntime(value: RuntimeBlockSource): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

/**
 * 从 runtime 或 snapshot 中读取当前可遍历的 block 列表。
 */
function readBlocks(
  source: RuntimeBlockSource,
  slot?: string
): SurfaceBlock[] {
  if (isAgentRuntime(source)) {
    return source.blocks(slot);
  }

  if (!slot) {
    return source.blocks;
  }

  return source.blocks.filter((block) => block.slot === slot);
}

/**
 * 判断某个 block 是否满足通用过滤条件。
 */
function matchesBlockOptions(
  block: SurfaceBlock,
  options: RuntimeBlocksByGroupOptions
): boolean {
  if (options.type !== undefined && block.type !== options.type) {
    return false;
  }

  if (options.renderer !== undefined && block.renderer !== options.renderer) {
    return false;
  }

  if (options.state !== undefined && block.state !== options.state) {
    return false;
  }

  if (options.nodeId !== undefined && (block.nodeId ?? null) !== options.nodeId) {
    return false;
  }

  return true;
}

/**
 * 按 id 从 runtime 或 snapshot 中读取单个 block。
 */
export function getRuntimeBlock(
  source: RuntimeBlockSource,
  id: string
): SurfaceBlock | undefined {
  if (isAgentRuntime(source)) {
    return source.block(id);
  }

  return source.blocks.find((block) => block.id === id);
}

/**
 * 按 groupId 从 runtime 或 snapshot 中读取一组 block。
 *
 * 返回顺序会保持 runtime 当前的实际渲染顺序，
 * 所以可以直接拿来做“提取这一轮消息内容”之类的逻辑。
 */
export function getBlocksByGroup(
  source: RuntimeBlockSource,
  groupId: string | null,
  options: RuntimeBlocksByGroupOptions = {}
): SurfaceBlock[] {
  return readBlocks(source, options.slot).filter((block) => {
    if ((block.groupId ?? null) !== groupId) {
      return false;
    }

    return matchesBlockOptions(block, options);
  });
}

/**
 * 按 messageId 从 runtime 或 snapshot 中读取一整条消息里的 block。
 *
 * 如果 block 尚未显式设置 `messageId`，会自动回退到 `groupId`，
 * 这样旧协议也能继续按消息维度查询。
 */
export function getBlocksByMessageId(
  source: RuntimeBlockSource,
  messageId: string | null,
  options: RuntimeBlocksByMessageOptions = {}
): SurfaceBlock[] {
  return readBlocks(source, options.slot).filter((block) => {
    if (getBlockMessageId(block) !== messageId) {
      return false;
    }

    return matchesBlockOptions(block, options);
  });
}

/**
 * 按 turnId 从 runtime 或 snapshot 中读取同一轮对话里的全部 block。
 *
 * 如果 block 尚未显式设置 `turnId`，会自动回退到 `groupId`。
 */
export function getBlocksByTurnId(
  source: RuntimeBlockSource,
  turnId: string | null,
  options: RuntimeBlocksByTurnOptions = {}
): SurfaceBlock[] {
  return readBlocks(source, options.slot).filter((block) => {
    if (getBlockTurnId(block) !== turnId) {
      return false;
    }

    return matchesBlockOptions(block, options);
  });
}

/**
 * 按 conversationId 从 runtime 或 snapshot 中读取整段会话里的 block。
 */
export function getBlocksByConversationId(
  source: RuntimeBlockSource,
  conversationId: string | null,
  options: RuntimeBlocksByConversationOptions = {}
): SurfaceBlock[] {
  return readBlocks(source, options.slot).filter((block) => {
    if (getBlockConversationId(block) !== conversationId) {
      return false;
    }

    return matchesBlockOptions(block, options);
  });
}
