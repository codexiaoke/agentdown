import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import type {
  AgentRuntime,
  RuntimeHistoryEntry,
  RuntimeIntent,
  RuntimeNode,
  RuntimeSnapshot,
  SurfaceBlock
} from '../runtime/types';

/**
 * `useRuntimeSnapshot()` 返回的响应式状态集合。
 */
export interface UseRuntimeSnapshotResult {
  runtime: ShallowRef<AgentRuntime>;
  snapshot: ShallowRef<RuntimeSnapshot>;
  nodes: ComputedRef<RuntimeNode[]>;
  blocks: ComputedRef<SurfaceBlock[]>;
  intents: ComputedRef<RuntimeIntent[]>;
  history: ComputedRef<RuntimeHistoryEntry[]>;
  refresh: () => RuntimeSnapshot;
}

/**
 * 把 AgentRuntime 包成 Vue 可追踪的 snapshot。
 * 这样在组件里不需要自己手写 subscribe / unsubscribe。
 */
export function useRuntimeSnapshot(
  input: MaybeRefOrGetter<AgentRuntime>
): UseRuntimeSnapshotResult {
  const initialRuntime = toValue(input);
  const runtime = shallowRef(initialRuntime);
  const snapshot = shallowRef(initialRuntime.snapshot());

  watch(
    () => toValue(input),
    (nextRuntime, _, onCleanup) => {
      runtime.value = nextRuntime;

      /**
       * 把 runtime 的最新快照同步回 Vue 状态。
       */
      const sync = () => {
        snapshot.value = nextRuntime.snapshot();
      };

      sync();
      const unsubscribe = nextRuntime.subscribe(sync);
      onCleanup(unsubscribe);
    },
    {
      immediate: true
    }
  );

  return {
    runtime,
    snapshot,
    nodes: computed(() => snapshot.value.nodes),
    blocks: computed(() => snapshot.value.blocks),
    intents: computed(() => snapshot.value.intents),
    history: computed(() => snapshot.value.history),
    /**
     * 主动拉取一次最新 snapshot。
     */
    refresh() {
      const nextSnapshot = runtime.value.snapshot();
      snapshot.value = nextSnapshot;
      return nextSnapshot;
    }
  };
}
