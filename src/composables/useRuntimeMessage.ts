import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import {
  getRuntimeMessage,
  getRuntimeMessagesByConversationId,
  getRuntimeMessagesByTurnId,
  type RuntimeMessageQueryOptions,
  type RuntimeMessageSource
} from '../runtime/messageSelectors';
import type {
  RuntimeTranscriptMessage
} from '../runtime/replay';
import type {
  AgentRuntime,
  RuntimeSnapshot
} from '../runtime/types';

/**
 * `useRuntimeMessage()` / `useRuntimeMessagesByTurnId()` 支持的输入源。
 */
type RuntimeMessageComposableSource = RuntimeMessageSource;

/**
 * `useRuntimeMessage()` 的响应式返回结构。
 */
export interface UseRuntimeMessageResult {
  /** 当前同步后的 runtime 快照。 */
  snapshot: ShallowRef<RuntimeSnapshot>;
  /** 当前命中的整条消息。 */
  message: ComputedRef<RuntimeTranscriptMessage | undefined>;
  /** 主动拉取一次最新消息。 */
  refresh: () => RuntimeTranscriptMessage | undefined;
}

/**
 * `useRuntimeMessagesByTurnId()` 的响应式返回结构。
 */
export interface UseRuntimeMessagesResult {
  /** 当前同步后的 runtime 快照。 */
  snapshot: ShallowRef<RuntimeSnapshot>;
  /** 当前命中的消息列表。 */
  messages: ComputedRef<RuntimeTranscriptMessage[]>;
  /** 主动拉取一次最新消息列表。 */
  refresh: () => RuntimeTranscriptMessage[];
}

/**
 * `useRuntimeMessagesByConversationId()` 的响应式返回结构。
 */
export type UseRuntimeMessagesByConversationIdResult = UseRuntimeMessagesResult;

/**
 * `useRuntimeMessagesByTurnId()` 的响应式返回结构。
 */
export type UseRuntimeMessagesByTurnIdResult = UseRuntimeMessagesResult;

/**
 * 判断当前输入是否为可订阅的 runtime 实例。
 */
function isAgentRuntime(value: RuntimeMessageComposableSource): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

/**
 * 把 runtime 或 snapshot 统一解析成快照。
 */
function resolveRuntimeSnapshot(source: RuntimeMessageComposableSource): RuntimeSnapshot {
  return isAgentRuntime(source)
    ? source.snapshot()
    : source;
}

/**
 * 把 runtime 或 snapshot 绑定成一个可复用的响应式快照容器。
 */
function useRuntimeSnapshotRef(
  input: MaybeRefOrGetter<RuntimeMessageComposableSource>
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
 * 为“按某种语义 id 查询消息列表”的 composable 生成统一实现。
 */
function createRuntimeMessagesQueryResult(
  input: MaybeRefOrGetter<RuntimeMessageComposableSource>,
  id: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeMessageQueryOptions>,
  selector: (
    snapshot: RuntimeSnapshot,
    value: string | null,
    resolvedOptions: RuntimeMessageQueryOptions
  ) => RuntimeTranscriptMessage[]
): UseRuntimeMessagesResult {
  const snapshot = useRuntimeSnapshotRef(input);

  return {
    snapshot,
    messages: computed(() => selector(snapshot.value, toValue(id), toValue(options))),
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
 * 基于 runtime 或 snapshot 响应式读取一条完整消息。
 *
 * 适合：
 * - 读取某一条 assistant 消息的完整文本
 * - 从消息层取出 `blocks`、`text` 和 `role`
 */
export function useRuntimeMessage(
  input: MaybeRefOrGetter<RuntimeMessageComposableSource>,
  messageId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeMessageQueryOptions> = {}
): UseRuntimeMessageResult {
  const snapshot = useRuntimeSnapshotRef(input);

  return {
    snapshot,
    message: computed(() => getRuntimeMessage(snapshot.value, toValue(messageId), toValue(options))),
    /**
     * 主动同步一次最新快照，并返回当前消息。
     */
    refresh() {
      snapshot.value = resolveRuntimeSnapshot(toValue(input));
      return getRuntimeMessage(snapshot.value, toValue(messageId), toValue(options));
    }
  };
}

/**
 * 基于 runtime 或 snapshot 响应式读取同一 turnId 下的消息列表。
 */
export function useRuntimeMessagesByTurnId(
  input: MaybeRefOrGetter<RuntimeMessageComposableSource>,
  turnId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeMessageQueryOptions> = {}
): UseRuntimeMessagesByTurnIdResult {
  return createRuntimeMessagesQueryResult(input, turnId, options, getRuntimeMessagesByTurnId);
}

/**
 * 基于 runtime 或 snapshot 响应式读取同一 conversationId 下的消息列表。
 */
export function useRuntimeMessagesByConversationId(
  input: MaybeRefOrGetter<RuntimeMessageComposableSource>,
  conversationId: MaybeRefOrGetter<string | null>,
  options: MaybeRefOrGetter<RuntimeMessageQueryOptions> = {}
): UseRuntimeMessagesByConversationIdResult {
  return createRuntimeMessagesQueryResult(
    input,
    conversationId,
    options,
    getRuntimeMessagesByConversationId
  );
}

