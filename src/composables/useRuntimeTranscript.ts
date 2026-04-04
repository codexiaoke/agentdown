import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { createRuntimeTranscript } from '../runtime/replay';
import type {
  CreateRuntimeTranscriptOptions,
  RuntimeTranscript
} from '../runtime/replay';
import type { AgentRuntime, RuntimeSnapshot } from '../runtime/types';

/**
 * `useRuntimeTranscript()` 支持的输入源。
 */
type TranscriptSource = AgentRuntime | RuntimeSnapshot;

/**
 * `useRuntimeTranscript()` 返回的响应式导出状态。
 */
export interface UseRuntimeTranscriptResult {
  snapshot: ShallowRef<RuntimeSnapshot>;
  transcript: ComputedRef<RuntimeTranscript>;
  refresh: () => RuntimeTranscript;
}

/**
 * 判断输入是否为可订阅的 runtime 实例。
 */
function isAgentRuntime(value: TranscriptSource): value is AgentRuntime {
  return typeof (value as AgentRuntime).apply === 'function';
}

/**
 * 基于 runtime 或 snapshot 生成响应式 transcript。
 * 适合接导出按钮、会话摘要、回放入口这类 UI。
 */
export function useRuntimeTranscript(
  input: MaybeRefOrGetter<TranscriptSource>,
  options: MaybeRefOrGetter<CreateRuntimeTranscriptOptions> = {}
): UseRuntimeTranscriptResult {
  const initialSource = toValue(input);
  const snapshot = shallowRef(
    isAgentRuntime(initialSource)
      ? initialSource.snapshot()
      : initialSource
  );

  watch(
    () => toValue(input),
    (nextSource, _, onCleanup) => {
      if (isAgentRuntime(nextSource)) {
        /**
         * 把 runtime 导出的最新快照同步到本地 transcript 源。
         */
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

  const transcript = computed(() => createRuntimeTranscript(snapshot.value, toValue(options)));

  return {
    snapshot,
    transcript,
    /**
     * 立即重新生成一次 transcript。
     */
    refresh() {
      const nextSource = toValue(input);

      if (isAgentRuntime(nextSource)) {
        snapshot.value = nextSource.snapshot();
      } else {
        snapshot.value = nextSource;
      }

      return transcript.value;
    }
  };
}
