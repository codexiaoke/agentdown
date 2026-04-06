import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import {
  getBlocksByConversationId,
  getBlocksByGroup,
  getBlocksByMessageId,
  getBlocksByTurnId,
  getRuntimeBlock,
  type RuntimeBlockSource,
  type RuntimeBlocksByConversationOptions,
  type RuntimeBlocksByGroupOptions,
  type RuntimeBlocksByMessageOptions,
  type RuntimeBlocksByTurnOptions
} from '../runtime/blockSelectors';
import type {
  AgentRuntime,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';

/**
 * `useRuntimeBlock()` / `useRuntimeBlocksByGroup()` 支持的输入源。
 */
type RuntimeBlockComposableSource = RuntimeBlockSource;

/**
 * `useRuntimeBlock()` 的响应式返回结构。
 */
export interface UseRuntimeBlockResult {
  /** 当前同步后的 runtime 快照。 */
  snapshot: ShallowRef<RuntimeSnapshot>;
  /** 当前命中的 block。 */
  block: ComputedRef<SurfaceBlock | undefined>;
  /** 主动拉取一次最新 block。 */
  refresh: () => SurfaceBlock | undefined;
}

/**
 * `useRuntimeBlocksByGroup()` 的响应式返回结构。
 */
export interface UseRuntimeBlocksByGroupResult {
  /** 当前同步后的 runtime 快照。 */
  snapshot: ShallowRef<RuntimeSnapshot>;
  /** 当前 groupId 下命中的 block 列表。 */
  blocks: ComputedRef<SurfaceBlock[]>;
  /** 主动拉取一次最新 block 列表。 */
  refresh: () => SurfaceBlock[];
}

/**
 * `useRuntimeBlocksByMessageId()` 的响应式返回结构。
 */
export type UseRuntimeBlocksByMessageIdResult = UseRuntimeBlocksByGroupResult;

/**
 * `useRuntimeBlocksByTurnId()` 的响应式返回结构。
 */
export type UseRuntimeBlocksByTurnIdResult = UseRuntimeBlocksByGroupResult;

/**
 * `useRuntimeBlocksByConversationId()` 的响应式返回结构。
 */
export type UseRuntimeBlocksByConversationIdResult = UseRuntimeBlocksByGroupResult;

/**
 * 判断当前输入是否为可订阅的 runtime 实例。
 */
function isAgentRuntime(value: RuntimeBlockComposableSource): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

/**
 * 把 runtime 或 snapshot 统一解析成快照。
 */
function resolveRuntimeSnapshot(source: RuntimeBlockComposableSource): RuntimeSnapshot {
  return isAgentRuntime(source)
    ? source.snapshot()
    : source;
}

/**
 * 把 runtime 或 snapshot 绑定成一个可复用的响应式快照容器。
 */
function useRuntimeSnapshotRef(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>
): ShallowRef<RuntimeSnapshot> {
  const snapshot = shallowRef(resolveRuntimeSnapshot(toValue(input)));

  watch(
    () => toValue(input),
    (nextSource, _, onCleanup) => {
      if (isAgentRuntime(nextSource)) {
        const sync = () => {
          snapshot.value = nextSource.snapshot();
        };

        sync();
        const unsubscribe = nextSource.subscribe(sync);
        onCleanup(unsubscribe);
        return;
      }

      snapshot.value = nextSource;
    },
    {
      immediate: true
    }
  );

  return snapshot;
}

/**
 * 为“按某种语义 id 查询 block 列表”的 composable 生成统一实现。
 */
function createRuntimeBlocksQueryResult<TOptions extends RuntimeBlocksByGroupOptions>(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>,
  id: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<TOptions>,
  selector: (
    snapshot: RuntimeSnapshot,
    value: string | null,
    resolvedOptions: TOptions
  ) => SurfaceBlock[]
): UseRuntimeBlocksByGroupResult {
  const snapshot = useRuntimeSnapshotRef(input);

  return {
    snapshot,
    blocks: computed(() => selector(snapshot.value, toValue(id), toValue(options))),
    /**
     * 主动同步一次最新快照，并返回当前查询结果。
     */
    refresh() {
      snapshot.value = resolveRuntimeSnapshot(toValue(input));
      return selector(snapshot.value, toValue(id), toValue(options));
    }
  };
}

/**
 * 基于 runtime 或 snapshot 响应式读取单个 block。
 *
 * 适合：
 * - 按固定 block id 订阅某个工具卡片
 * - 在页面里读取某一条消息的最新内容
 */
export function useRuntimeBlock(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>,
  id: MaybeRefOrGetter<string>
): UseRuntimeBlockResult {
  const snapshot = useRuntimeSnapshotRef(input);

  return {
    snapshot,
    block: computed(() => getRuntimeBlock(snapshot.value, toValue(id))),
    /**
     * 主动同步一次最新快照，并返回当前 block。
     */
    refresh() {
      snapshot.value = resolveRuntimeSnapshot(toValue(input));
      return getRuntimeBlock(snapshot.value, toValue(id));
    }
  };
}

/**
 * 基于 runtime 或 snapshot 响应式读取同一 groupId 下的一组 block。
 *
 * 适合：
 * - 提取一轮消息里的全部文本 / 工具卡片
 * - 聚合同一个 turn 下的可见内容
 */
export function useRuntimeBlocksByGroup(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>,
  groupId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeBlocksByGroupOptions> = {}
): UseRuntimeBlocksByGroupResult {
  return createRuntimeBlocksQueryResult(input, groupId, options, getBlocksByGroup);
}

/**
 * 基于 runtime 或 snapshot 响应式读取同一 messageId 下的一组 block。
 *
 * 适合：
 * - 拿到一条 assistant / user 消息里的所有内容块
 * - 提取“同一条消息内”的文本、工具卡片和 artifact
 */
export function useRuntimeBlocksByMessageId(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>,
  messageId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeBlocksByMessageOptions> = {}
): UseRuntimeBlocksByMessageIdResult {
  return createRuntimeBlocksQueryResult(input, messageId, options, getBlocksByMessageId);
}

/**
 * 基于 runtime 或 snapshot 响应式读取同一 turnId 下的一组 block。
 *
 * 适合：
 * - 一问一答 round 级别聚合
 * - 把某一轮中的用户输入和 assistant 输出一起取出来
 */
export function useRuntimeBlocksByTurnId(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>,
  turnId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeBlocksByTurnOptions> = {}
): UseRuntimeBlocksByTurnIdResult {
  return createRuntimeBlocksQueryResult(input, turnId, options, getBlocksByTurnId);
}

/**
 * 基于 runtime 或 snapshot 响应式读取同一 conversationId 下的一组 block。
 */
export function useRuntimeBlocksByConversationId(
  input: MaybeRefOrGetter<RuntimeBlockComposableSource>,
  conversationId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeBlocksByConversationOptions> = {}
): UseRuntimeBlocksByConversationIdResult {
  return createRuntimeBlocksQueryResult(input, conversationId, options, getBlocksByConversationId);
}
