import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import { createAgentRuntime } from '../runtime/createAgentRuntime';
import type { AgentRuntime } from '../runtime/types';
import type { AgentdownRecordsAdapter } from '../persisted/adapter';
import type { BuiltinAgentdownRenderArchive, BuiltinAgentdownRenderRecord } from '../persisted/builtin';
import {
  restoreAgentdownRenderArchive,
  type AgentdownRenderInput,
  type RestoredAgentdownRenderArchiveResult,
  type RestoreAgentdownRenderArchiveOptions
} from '../persisted/restore';
import type { AgentdownRenderArchive, AgentdownRenderRecord } from '../persisted/types';
import { useRuntimeSnapshot, type UseRuntimeSnapshotResult } from './useRuntimeSnapshot';

/**
 * `useAgentdownRenderArchive()` 的输入配置。
 */
export interface UseAgentdownRenderArchiveOptions<
  TRecord extends AgentdownRenderRecord = BuiltinAgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive = BuiltinAgentdownRenderArchive
> {
  /** 当前要恢复的 archive / records / JSON 字符串。 */
  input: MaybeRefOrGetter<AgentdownRenderInput<TRecord, TArchive> | null | undefined>;
  /** 自定义 records adapter；不传时默认使用内置推荐结构。 */
  adapter?: MaybeRefOrGetter<RestoreAgentdownRenderArchiveOptions<TRecord>['adapter']>;
  /** 可选复用一个已有 runtime。 */
  runtime?: AgentRuntime;
  /** 当输入变化时是否先重置 runtime；默认 true。 */
  resetOnChange?: boolean;
}

/**
 * `useAgentdownRenderArchive()` 暴露给页面层的状态。
 */
export interface UseAgentdownRenderArchiveResult<
  TRecord extends AgentdownRenderRecord = BuiltinAgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive = BuiltinAgentdownRenderArchive
> {
  runtime: AgentRuntime;
  runtimeState: UseRuntimeSnapshotResult;
  restored: ShallowRef<RestoredAgentdownRenderArchiveResult<TRecord, TArchive> | null>;
  archive: ComputedRef<TArchive | null>;
  records: ComputedRef<TRecord[]>;
  metadata: ComputedRef<RestoredAgentdownRenderArchiveResult<TRecord, TArchive>['metadata']>;
  lastUserMessage: ComputedRef<string>;
  restore: (
    input?: AgentdownRenderInput<TRecord, TArchive> | null | undefined,
    options?: RestoreAgentdownRenderArchiveOptions<TRecord>
  ) => RestoredAgentdownRenderArchiveResult<TRecord, TArchive> | null;
  reset: () => void;
}

/**
 * 直接把 archive / records JSON 恢复成一个可交给 RunSurface 的 runtime。
 */
export function useAgentdownRenderArchive(
  options: UseAgentdownRenderArchiveOptions<BuiltinAgentdownRenderRecord, BuiltinAgentdownRenderArchive>
): UseAgentdownRenderArchiveResult<BuiltinAgentdownRenderRecord, BuiltinAgentdownRenderArchive>;
export function useAgentdownRenderArchive<
  TRecord extends AgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive<string, TRecord>
>(
  options: UseAgentdownRenderArchiveOptions<TRecord, TArchive>
): UseAgentdownRenderArchiveResult<TRecord, TArchive>;
export function useAgentdownRenderArchive<
  TRecord extends AgentdownRenderRecord,
  TArchive extends AgentdownRenderArchive<string, TRecord>
>(
  options: UseAgentdownRenderArchiveOptions<TRecord, TArchive>
): UseAgentdownRenderArchiveResult<TRecord, TArchive> {
  const runtime = options.runtime ?? createAgentRuntime();
  const runtimeState = useRuntimeSnapshot(runtime);
  const restored = shallowRef<RestoredAgentdownRenderArchiveResult<TRecord, TArchive> | null>(null);

  /**
   * 手动恢复一份输入到当前 runtime。
   */
  function restore(
    input: AgentdownRenderInput<TRecord, TArchive> | null | undefined = toValue(options.input),
    restoreOptions: RestoreAgentdownRenderArchiveOptions<TRecord> = {}
  ) {
    if (!input) {
      runtime.reset();
      runtimeState.refresh();
      restored.value = null;
      return null;
    }

    if (options.resetOnChange ?? true) {
      runtime.reset();
    }

    const nextRestored = restoreAgentdownRenderArchive(input, {
      ...(toValue(options.adapter) ? { adapter: toValue(options.adapter) as AgentdownRecordsAdapter<TRecord> } : {}),
      ...restoreOptions
    } as RestoreAgentdownRenderArchiveOptions<TRecord>);

    runtime.apply(nextRestored.commands);
    runtimeState.refresh();
    restored.value = nextRestored;
    return nextRestored;
  }

  /**
   * 手动清空当前 runtime 与恢复结果。
   */
  function reset() {
    runtime.reset();
    runtimeState.refresh();
    restored.value = null;
  }

  watch(
    [() => toValue(options.input), () => toValue(options.adapter)],
    () => {
      restore();
    },
    {
      immediate: true,
      deep: true
    }
  );

  return {
    runtime,
    runtimeState,
    restored,
    archive: computed(() => restored.value?.archive ?? null),
    records: computed(() => restored.value?.records ?? []),
    metadata: computed(() => restored.value?.metadata ?? {
      format: null,
      framework: null,
      conversationId: '',
      sessionId: '',
      runId: '',
      status: '',
      updatedAt: null,
      completedAt: null
    }),
    lastUserMessage: computed(() => restored.value?.lastUserMessage ?? ''),
    restore,
    reset
  };
}
