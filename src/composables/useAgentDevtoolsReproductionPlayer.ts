import { computed, onScopeDispose, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter, type ShallowRef } from 'vue';
import {
  createAgentDevtoolsReproductionPlayer,
  type AgentDevtoolsReproductionPlayOptions,
  type AgentDevtoolsReproductionPlayer,
  type AgentDevtoolsReproductionStepResult,
  type CreateAgentDevtoolsReproductionPlayerOptions
} from '../devtools/reproductionPlayer';
import type {
  AgentDevtoolsReproductionInput,
  AgentDevtoolsReproductionPacketContext
} from '../devtools/reproduction';
import type {
  AgentRuntime,
  BridgeSnapshot,
  RuntimeSnapshot
} from '../runtime/types';

/**
 * `useAgentDevtoolsReproductionPlayer()` 暴露给页面层的响应式状态。
 */
export interface UseAgentDevtoolsReproductionPlayerResult<TRawPacket = unknown> {
  /** 当前底层 player 实例。 */
  player: ShallowRef<AgentDevtoolsReproductionPlayer<TRawPacket>>;
  /** 当前 player 使用的 runtime。 */
  runtime: ComputedRef<AgentRuntime>;
  /** 当前 runtime 快照。 */
  snapshot: ShallowRef<RuntimeSnapshot>;
  /** 当前 bridge 调试快照。 */
  bridgeSnapshot: ShallowRef<BridgeSnapshot<TRawPacket>>;
  /** 当前播放位置。 */
  position: ShallowRef<number>;
  /** 当前总 packet 数。 */
  total: ShallowRef<number>;
  /** 当前播放器状态。 */
  status: ShallowRef<ReturnType<AgentDevtoolsReproductionPlayer<TRawPacket>['status']>>;
  /** 当前刚执行过的 packet。 */
  current: ShallowRef<AgentDevtoolsReproductionPacketContext<TRawPacket> | null>;
  /** 当前是否处于自动播放中。 */
  playing: ComputedRef<boolean>;
  /** 重置回起点。 */
  reset: () => RuntimeSnapshot;
  /** 跳到指定 packet 位置。 */
  seek: (position: number) => RuntimeSnapshot;
  /** 单步推进。 */
  step: (count?: number) => AgentDevtoolsReproductionStepResult<TRawPacket>[];
  /** 自动播放。 */
  play: (options?: AgentDevtoolsReproductionPlayOptions<TRawPacket>) => Promise<void>;
  /** 暂停当前播放。 */
  pause: () => void;
}

/**
 * 为 reproduction player 提供一层 Vue 响应式包装。
 */
export function useAgentDevtoolsReproductionPlayer<TRawPacket = unknown>(
  input: MaybeRefOrGetter<AgentDevtoolsReproductionInput<TRawPacket>>,
  options: MaybeRefOrGetter<CreateAgentDevtoolsReproductionPlayerOptions<TRawPacket>>
): UseAgentDevtoolsReproductionPlayerResult<TRawPacket> {
  const initialPlayer = createAgentDevtoolsReproductionPlayer(toValue(input), toValue(options));
  const player = shallowRef(initialPlayer);
  const snapshot = shallowRef(initialPlayer.snapshot());
  const bridgeSnapshot = shallowRef(initialPlayer.bridgeSnapshot());
  const position = shallowRef(initialPlayer.position());
  const total = shallowRef(initialPlayer.total());
  const status = shallowRef(initialPlayer.status());
  const current = shallowRef(initialPlayer.current());
  let playAbortController: AbortController | null = null;

  /**
   * 同步 player 的当前位置、快照和调试信息。
   */
  function syncMeta() {
    snapshot.value = player.value.snapshot();
    bridgeSnapshot.value = player.value.bridgeSnapshot();
    position.value = player.value.position();
    total.value = player.value.total();
    status.value = player.value.status();
    current.value = player.value.current();
  }

  /**
   * 中断当前自动播放流程。
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
      player.value = createAgentDevtoolsReproductionPlayer(nextInput, nextOptions);
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
    bridgeSnapshot,
    position,
    total,
    status,
    current,
    playing: computed(() => status.value === 'playing'),
    /**
     * 把当前回放重置回起点。
     */
    reset() {
      pause();
      const nextSnapshot = player.value.reset();
      syncMeta();
      return nextSnapshot;
    },
    /**
     * 跳到指定位置。
     */
    seek(nextPosition: number) {
      pause();
      const nextSnapshot = player.value.seek(nextPosition);
      syncMeta();
      return nextSnapshot;
    },
    /**
     * 单步推进一条或多条 packet。
     */
    step(count = 1) {
      pause();
      const results = player.value.step(count);
      syncMeta();
      return results;
    },
    /**
     * 自动播放剩余 packet。
     */
    async play(playOptions: AgentDevtoolsReproductionPlayOptions<TRawPacket> = {}) {
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
     * 手动暂停当前自动播放。
     */
    pause
  };
}
