import { computed, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import {
  createRuntimeReplayPlayer,
} from '../runtime/replay';
import type {
  ReplayRuntimeHistoryOptions,
  RuntimeReplayPlayOptions,
  RuntimeReplayPlayer,
  RuntimeReplayStepResult,
  RuntimeTranscript
} from '../runtime/replay';
import type {
  AgentRuntime,
  RuntimeHistoryEntry,
  RuntimeSnapshot
} from '../runtime/types';

/**
 * `useRuntimeReplayPlayer()` 支持的回放输入。
 */
type ReplaySource = RuntimeHistoryEntry[] | RuntimeTranscript;

/**
 * `useRuntimeReplayPlayer()` 暴露给页面层的控制状态。
 */
export interface UseRuntimeReplayPlayerResult {
  player: ShallowRef<RuntimeReplayPlayer>;
  runtime: ComputedRef<AgentRuntime>;
  snapshot: ShallowRef<RuntimeSnapshot>;
  position: ShallowRef<number>;
  total: ShallowRef<number>;
  status: ShallowRef<ReturnType<RuntimeReplayPlayer['status']>>;
  current: ShallowRef<RuntimeHistoryEntry | null>;
  playing: ComputedRef<boolean>;
  reset: () => RuntimeSnapshot;
  seek: (position: number) => RuntimeSnapshot;
  step: (count?: number) => RuntimeReplayStepResult[];
  play: (options?: RuntimeReplayPlayOptions) => Promise<void>;
  pause: () => void;
}

/**
 * 从 transcript 或 history 数组中提取统一的 history 列表。
 */
function resolveReplayHistory(source: ReplaySource): RuntimeHistoryEntry[] {
  return Array.isArray(source) ? source : source.history;
}

/**
 * 提供一个响应式 replay player 包装层。
 * 适合接时间轴控制条、回放按钮和导入 transcript 的预览页。
 */
export function useRuntimeReplayPlayer(
  input: MaybeRefOrGetter<ReplaySource>,
  options: MaybeRefOrGetter<ReplayRuntimeHistoryOptions> = {}
): UseRuntimeReplayPlayerResult {
  const initialPlayer = createRuntimeReplayPlayer(resolveReplayHistory(toValue(input)), toValue(options));
  const player = shallowRef(initialPlayer);
  const snapshot = shallowRef(initialPlayer.snapshot());
  const position = shallowRef(initialPlayer.position());
  const total = shallowRef(initialPlayer.total());
  const status = shallowRef(initialPlayer.status());
  const current = shallowRef(initialPlayer.current());
  let playAbortController: AbortController | null = null;

  /**
   * 同步 player 的当前位置、快照和状态信息。
   */
  function syncMeta() {
    snapshot.value = player.value.snapshot();
    position.value = player.value.position();
    total.value = player.value.total();
    status.value = player.value.status();
    current.value = player.value.current();
  }

  /**
   * 中断当前播放流程，并把状态刷新回最新值。
   */
  function pause() {
    playAbortController?.abort();
    playAbortController = null;
    syncMeta();
  }

  watch(
    [() => toValue(input), () => toValue(options)],
    ([nextInput, nextOptions]) => {
      pause();
      player.value = createRuntimeReplayPlayer(resolveReplayHistory(nextInput), nextOptions);
      syncMeta();
    },
    {
      immediate: true
    }
  );

  onScopeDispose(() => {
    pause();
  });

  return {
    player,
    runtime: computed(() => player.value.runtime),
    snapshot,
    position,
    total,
    status,
    current,
    playing: computed(() => status.value === 'playing'),
    /**
     * 回到回放起点。
     */
    reset() {
      pause();
      const nextSnapshot = player.value.reset();
      syncMeta();
      return nextSnapshot;
    },
    /**
     * 直接跳到指定 history 位置。
     */
    seek(nextPosition: number) {
      pause();
      const nextSnapshot = player.value.seek(nextPosition);
      syncMeta();
      return nextSnapshot;
    },
    /**
     * 单步推进回放。
     */
    step(count = 1) {
      pause();
      const results = player.value.step(count);
      syncMeta();
      return results;
    },
    /**
     * 以定时节奏自动播放剩余 history。
     */
    async play(playOptions: RuntimeReplayPlayOptions = {}) {
      pause();
      playAbortController = new AbortController();
      const playPromise = player.value.play({
        ...playOptions,
        signal: playAbortController.signal,
        onStep: (result) => {
          syncMeta();
          playOptions.onStep?.(result);
        }
      });

      syncMeta();

      try {
        await playPromise;
      } finally {
        playAbortController = null;
        syncMeta();
      }
    },
    /**
     * 手动暂停当前回放。
     */
    pause
  };
}
