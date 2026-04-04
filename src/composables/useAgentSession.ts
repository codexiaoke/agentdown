import { computed, onScopeDispose, shallowRef, type ComputedRef, type ShallowRef } from 'vue';
import { parseRuntimeTranscript } from '../runtime/replay';
import type {
  AgentdownPreset,
  AgentdownPresetOverrides,
  AgentdownSession
} from '../runtime/definePreset';
import type {
  CreateRuntimeTranscriptOptions,
  ReplayRuntimeHistoryOptions,
  RuntimeTranscript
} from '../runtime/replay';
import type {
  ConsumeOptions
} from '../runtime/types';
import { useRuntimeReplayPlayer, type UseRuntimeReplayPlayerResult } from './useRuntimeReplayPlayer';
import { useRuntimeSnapshot, type UseRuntimeSnapshotResult } from './useRuntimeSnapshot';
import { useRuntimeTranscript, type UseRuntimeTranscriptResult } from './useRuntimeTranscript';

/**
 * 当前激活 transcript 的来源标签。
 */
export type AgentSessionTranscriptSource = 'exported' | 'imported' | 'custom';

/**
 * `useAgentSession()` 的可选行为配置。
 */
export interface UseAgentSessionOptions<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> {
  overrides?: AgentdownPresetOverrides<TRawPacket, TSource>;
  transcript?: CreateRuntimeTranscriptOptions;
  replay?: ReplayRuntimeHistoryOptions;
  closeBridgeOnScopeDispose?: boolean;
}

/**
 * `useAgentSession()` 返回的会话级能力集合。
 */
export interface UseAgentSessionResult<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
> extends AgentdownSession<TRawPacket, TSource> {
  runtimeState: UseRuntimeSnapshotResult;
  transcriptState: UseRuntimeTranscriptResult;
  replay: UseRuntimeReplayPlayerResult;
  exportedTranscript: ComputedRef<RuntimeTranscript>;
  activeTranscript: ShallowRef<RuntimeTranscript>;
  importedTranscript: ShallowRef<RuntimeTranscript | null>;
  activeTranscriptSource: ShallowRef<AgentSessionTranscriptSource>;
  useExportedTranscript: () => RuntimeTranscript;
  useImportedTranscript: () => RuntimeTranscript | null;
  loadTranscript: (transcript: RuntimeTranscript, source?: AgentSessionTranscriptSource) => RuntimeTranscript;
  importTranscript: (
    input: string | RuntimeTranscript | Record<string, unknown>,
    source?: Extract<AgentSessionTranscriptSource, 'imported' | 'custom'>
  ) => RuntimeTranscript;
  clearImportedTranscript: () => void;
  downloadTranscript: (transcript?: RuntimeTranscript, filename?: string) => RuntimeTranscript;
  push: (packet: TRawPacket | TRawPacket[]) => void;
  flush: (reason?: string) => void;
  consume: (source: TSource, options?: ConsumeOptions) => Promise<void>;
  reset: () => void;
  close: () => void;
}

/**
 * 页面级高阶 composable。
 * 直接基于 preset 生成 runtime / bridge / surface，并顺手接好 transcript 与 replay。
 */
export function useAgentSession<
  TRawPacket = unknown,
  TSource = AsyncIterable<TRawPacket> | Iterable<TRawPacket>
>(
  preset: AgentdownPreset<TRawPacket, TSource>,
  options: UseAgentSessionOptions<TRawPacket, TSource> = {}
): UseAgentSessionResult<TRawPacket, TSource> {
  const session = preset.createSession(options.overrides);
  const runtimeState = useRuntimeSnapshot(session.runtime);
  const transcriptState = useRuntimeTranscript(session.runtime, options.transcript ?? {});
  const exportedTranscript = computed(() => transcriptState.transcript.value);
  const activeTranscript = shallowRef(exportedTranscript.value);
  const importedTranscript = shallowRef<RuntimeTranscript | null>(null);
  const activeTranscriptSource = shallowRef<AgentSessionTranscriptSource>('exported');
  const replay = useRuntimeReplayPlayer(() => activeTranscript.value, options.replay ?? {});

  /**
   * 切回当前 runtime 实时导出的 transcript。
   */
  function useExportedTranscript() {
    const nextTranscript = exportedTranscript.value;
    activeTranscript.value = nextTranscript;
    activeTranscriptSource.value = 'exported';
    return nextTranscript;
  }

  /**
   * 显式设置当前要使用的 transcript。
   */
  function loadTranscript(
    transcript: RuntimeTranscript,
    source: AgentSessionTranscriptSource = 'custom'
  ) {
    activeTranscript.value = transcript;
    activeTranscriptSource.value = source;
    return transcript;
  }

  /**
   * 使用最近一次导入的 transcript 作为当前视图源。
   */
  function useImportedTranscript() {
    if (!importedTranscript.value) {
      return null;
    }

    return loadTranscript(importedTranscript.value, 'imported');
  }

  /**
   * 解析并载入外部 transcript 内容。
   */
  function importTranscript(
    input: string | RuntimeTranscript | Record<string, unknown>,
    source: Extract<AgentSessionTranscriptSource, 'imported' | 'custom'> = 'imported'
  ) {
    const nextTranscript = parseRuntimeTranscript(input, options.transcript ?? {});

    if (source === 'imported') {
      importedTranscript.value = nextTranscript;
    }

    return loadTranscript(nextTranscript, source);
  }

  /**
   * 清空当前缓存的导入 transcript。
   */
  function clearImportedTranscript() {
    importedTranscript.value = null;

    if (activeTranscriptSource.value === 'imported') {
      useExportedTranscript();
    }
  }

  /**
   * 下载当前激活的 transcript JSON。
   */
  function downloadTranscript(
    transcript: RuntimeTranscript = activeTranscript.value,
    filename?: string
  ) {
    const blob = new Blob([JSON.stringify(transcript, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename
      ?? (
        activeTranscriptSource.value === 'imported'
          ? 'agentdown-transcript-imported.json'
          : 'agentdown-transcript.json'
      );
    link.click();
    URL.revokeObjectURL(url);

    return transcript;
  }

  /**
   * 手动向 session bridge 推入一个或多个 packet。
   */
  function push(packet: TRawPacket | TRawPacket[]) {
    session.bridge.push(packet);
  }

  /**
   * 手动结束当前一批 packet。
   */
  function flush(reason?: string) {
    session.bridge.flush(reason);
  }

  /**
   * 直接消费一个外部数据源。
   */
  async function consume(source: TSource, consumeOptions?: ConsumeOptions) {
    await session.bridge.consume(source, consumeOptions);
  }

  /**
   * 重置 bridge 和 runtime，并保持 transcript 视图同步。
   */
  function reset() {
    session.bridge.reset();
    runtimeState.refresh();

    if (activeTranscriptSource.value === 'exported') {
      useExportedTranscript();
    }
  }

  /**
   * 关闭当前 session 相关资源。
   */
  function close() {
    replay.pause();
    session.bridge.close();
  }

  onScopeDispose(() => {
    replay.pause();

    if (options.closeBridgeOnScopeDispose ?? true) {
      session.bridge.close();
    }
  });

  return {
    ...session,
    runtimeState,
    transcriptState,
    replay,
    exportedTranscript,
    activeTranscript,
    importedTranscript,
    activeTranscriptSource,
    useExportedTranscript,
    useImportedTranscript,
    loadTranscript,
    importTranscript,
    clearImportedTranscript,
    downloadTranscript,
    push,
    flush,
    consume,
    reset,
    close
  };
}
