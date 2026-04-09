<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  cmd,
  createMarkdownAssembler,
  RunSurface,
  type RunSurfacePerformanceOptions,
  type RuntimeSnapshot,
  type SurfaceBlock,
  useAsyncIterableBridge
} from '../../index';
import BuiltinAguiCard from '../components/BuiltinAguiCard.vue';
import { createLongDocumentSource } from '../fixtures/longDocumentFixture';
import {
  markdownStreamingPreset,
  type MarkdownStreamingPacket
} from '../presets/markdownStreamingPreset';

/**
 * benchmark 页面提供给脚本与控制台调用的全局 API。
 */
interface StreamingBenchmarkGlobalApi {
  ready: boolean;
  run: (options?: Partial<StreamingBenchmarkRunOptions>) => Promise<StreamingBenchmarkResult>;
  getLastResult: () => StreamingBenchmarkResult | null;
}

/**
 * 单次流式基准可调的输入参数。
 */
interface StreamingBenchmarkRunOptions {
  /**
   * 长文阅读章节数量。
   */
  readingSections: number;
  /**
   * 每个流式 chunk 包含多少个字符。
   */
  chunkSize: number;
  /**
   * chunk 间隔毫秒数。
   */
  delayMs: number;
  /**
   * surface 使用哪套性能预设。
   */
  surfacePreset: StreamingBenchmarkSurfacePresetId;
}

/**
 * surface 性能预设的稳定 id。
 */
type StreamingBenchmarkSurfacePresetId = 'default' | 'optimized' | 'stress';

/**
 * surface 性能预设的完整结构。
 */
interface StreamingBenchmarkSurfacePreset {
  id: StreamingBenchmarkSurfacePresetId;
  label: string;
  performance: RunSurfacePerformanceOptions;
}

/**
 * benchmark 期间累计的长任务统计。
 */
interface StreamingBenchmarkLongTaskSummary {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

/**
 * benchmark 期间累计的帧间隔统计。
 */
interface StreamingBenchmarkFrameSummary {
  sampleCount: number;
  maxDeltaMs: number;
  framesOver16Ms: number;
  framesOver33Ms: number;
  framesOver50Ms: number;
}

/**
 * benchmark 运行期间观察到的峰值指标。
 */
interface StreamingBenchmarkPeakSummary {
  domNodeCount: number;
  mountedGroupCount: number;
  mountedBlockCount: number;
  runtimeBlockCount: number;
  draftBlockCount: number;
  stableBlockCount: number;
  settledBlockCount: number;
  historyEntryCount: number;
  usedHeapMb: number | null;
}

/**
 * benchmark 结束时冻结下来的最终状态。
 */
interface StreamingBenchmarkFinalSummary {
  domNodeCount: number;
  mountedGroupCount: number;
  mountedBlockCount: number;
  runtimeBlockCount: number;
  assistantBlockCount: number;
  draftBlockCount: number;
  stableBlockCount: number;
  settledBlockCount: number;
  historyEntryCount: number;
  usedHeapMb: number | null;
}

/**
 * benchmark 关注的关键时间点。
 */
interface StreamingBenchmarkTimingSummary {
  firstAssistantBlockMs: number | null;
  firstVisibleContentMs: number | null;
  firstStableBlockMs: number | null;
  firstSettledBlockMs: number | null;
  streamCompletedMs: number | null;
  surfaceStableMs: number | null;
}

/**
 * benchmark 最终导出的完整结构。
 */
interface StreamingBenchmarkResult {
  schemaVersion: 1;
  generatedAt: string;
  environment: {
    userAgent: string;
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
  };
  scenario: {
    readingSections: number;
    sourceLength: number;
    chunkSize: number;
    chunkCount: number;
    delayMs: number;
    surfacePreset: StreamingBenchmarkSurfacePreset;
  };
  timing: StreamingBenchmarkTimingSummary;
  peaks: StreamingBenchmarkPeakSummary;
  final: StreamingBenchmarkFinalSummary;
  longTasks: StreamingBenchmarkLongTaskSummary;
  frames: StreamingBenchmarkFrameSummary;
}

/**
 * 记录当前一次 benchmark 的可变状态。
 */
interface StreamingBenchmarkCollector {
  startedAt: number;
  timing: StreamingBenchmarkTimingSummary;
  peaks: StreamingBenchmarkPeakSummary;
  longTasks: StreamingBenchmarkLongTaskSummary;
  frames: StreamingBenchmarkFrameSummary;
}

declare global {
  interface Window {
    __AGENTDOWN_STREAMING_BENCHMARK__?: StreamingBenchmarkGlobalApi;
  }
}

const RUN_ID = 'run:streaming-benchmark';
const STREAM_ID = 'stream:streaming-benchmark';
const USER_GROUP_ID = 'turn:user:streaming-benchmark';
const ASSISTANT_GROUP_ID = 'turn:assistant:streaming-benchmark';
const USER_MESSAGE_ID = 'message:user:streaming-benchmark';
const ASSISTANT_MESSAGE_ID = 'message:assistant:streaming-benchmark';

/**
 * benchmark 页面允许选择的 surface 性能预设。
 */
const SURFACE_PRESETS: Record<StreamingBenchmarkSurfacePresetId, StreamingBenchmarkSurfacePreset> = {
  default: {
    id: 'default',
    label: '默认',
    performance: {
      groupWindow: 80,
      groupWindowStep: 40,
      lazyMount: true,
      lazyMountMargin: '720px 0px',
      textSlabChars: 1600
    }
  },
  optimized: {
    id: 'optimized',
    label: '推荐优化',
    performance: {
      groupWindow: 80,
      groupWindowStep: 40,
      lazyMount: true,
      lazyMountMargin: '900px 0px',
      textSlabChars: 1200
    }
  },
  stress: {
    id: 'stress',
    label: '极限压力',
    performance: {
      groupWindow: false,
      lazyMount: false,
      textSlabChars: 640
    }
  }
};

/**
 * 当前 benchmark 的默认输入。
 */
const DEFAULT_OPTIONS: StreamingBenchmarkRunOptions = {
  readingSections: 24,
  chunkSize: 24,
  delayMs: 0,
  surfacePreset: 'optimized'
};

const runtime = markdownStreamingPreset.createRuntime();
const snapshot = shallowRef<RuntimeSnapshot>(runtime.snapshot());
const rendererHostRef = ref<HTMLElement | null>(null);
const running = ref(false);
const failureMessage = ref<string | null>(null);
const lastResult = ref<StreamingBenchmarkResult | null>(null);
const activeOptions = ref<StreamingBenchmarkRunOptions>(DEFAULT_OPTIONS);

/**
 * benchmark 页里 AGUI 指令使用的组件映射。
 */
const aguiComponents = {
  DemoBuiltinCard: BuiltinAguiCard
};

const surfaceOptions = computed(() => {
  return {
    ...markdownStreamingPreset.getSurfaceOptions(),
    performance: SURFACE_PRESETS[activeOptions.value.surfacePreset].performance,
    aguiComponents,
    messageActions: {
      assistant: {
        enabled: false
      },
      user: {
        enabled: false
      }
    }
  };
});

const resultJson = computed(() => {
  return lastResult.value ? JSON.stringify(lastResult.value, null, 2) : '';
});

const {
  start,
  reset
} = useAsyncIterableBridge<MarkdownStreamingPacket>({
  runtime,
  protocol: markdownStreamingPreset.protocol,
  assemblers: {
    markdown: createMarkdownAssembler()
  }
});

let unsubscribe: (() => void) | null = runtime.subscribe(() => {
  snapshot.value = runtime.snapshot();
});

/**
 * 读取 hash query，方便脚本和手工页面共用一套参数入口。
 */
function readHashQuery(): URLSearchParams {
  const rawHash = window.location.hash.replace(/^#/, '');
  const query = rawHash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

/**
 * 把输入值解析成一个受保护的正整数。
 */
function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 解析 surface 预设 id，不合法时回退到默认值。
 */
function parseSurfacePresetId(value: string | null): StreamingBenchmarkSurfacePresetId {
  if (value === 'default' || value === 'optimized' || value === 'stress') {
    return value;
  }

  return DEFAULT_OPTIONS.surfacePreset;
}

/**
 * 规范化外部传入的 benchmark 配置。
 */
function normalizeRunOptions(options: Partial<StreamingBenchmarkRunOptions> = {}): StreamingBenchmarkRunOptions {
  return {
    readingSections: Math.max(1, options.readingSections ?? DEFAULT_OPTIONS.readingSections),
    chunkSize: Math.max(1, options.chunkSize ?? DEFAULT_OPTIONS.chunkSize),
    delayMs: Math.max(0, options.delayMs ?? DEFAULT_OPTIONS.delayMs),
    surfacePreset: options.surfacePreset ?? DEFAULT_OPTIONS.surfacePreset
  };
}

/**
 * 从当前地址栏 query 中读取一份初始配置。
 */
function readInitialRunOptions(): StreamingBenchmarkRunOptions {
  const params = readHashQuery();

  return normalizeRunOptions({
    readingSections: parsePositiveInteger(params.get('readingSections'), DEFAULT_OPTIONS.readingSections),
    chunkSize: parsePositiveInteger(params.get('chunkSize'), DEFAULT_OPTIONS.chunkSize),
    delayMs: parsePositiveInteger(params.get('delayMs'), DEFAULT_OPTIONS.delayMs),
    surfacePreset: parseSurfacePresetId(params.get('surfacePreset'))
  });
}

/**
 * 生成用于本轮基准的长文档 markdown 源码。
 */
function createBenchmarkSource(options: StreamingBenchmarkRunOptions): string {
  return createLongDocumentSource({
    readingSectionCount: options.readingSections,
    includeRawHtml: false
  });
}

/**
 * 按固定 chunk 大小拆分 markdown 文本，模拟后端逐段推送。
 */
function splitIntoChunks(source: string, chunkSize: number): string[] {
  const characters = Array.from(source);
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(''));
  }

  return chunks;
}

/**
 * 延迟指定毫秒数，用来模拟后端 chunk 间隔。
 */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * 预先插入一条用户消息，让 benchmark 更接近日常对话场景。
 */
function seedConversation(): void {
  runtime.apply(cmd.message.text({
    id: 'block:user:streaming-benchmark',
    role: 'user',
    text: '请输出一份结构完整、包含标题、列表、表格和代码块的长文档说明。',
    groupId: USER_GROUP_ID,
    messageId: USER_MESSAGE_ID,
    at: Date.now()
  }));
}

/**
 * 逐段产出流式 packet，走真实 markdown assembler 主链。
 */
async function* createPacketStream(
  source: string,
  options: StreamingBenchmarkRunOptions
): AsyncIterable<MarkdownStreamingPacket> {
  yield {
    event: 'RunStarted',
    runId: RUN_ID,
    title: 'Streaming Benchmark'
  };

  yield {
    event: 'ContentOpen',
    streamId: STREAM_ID,
    slot: 'main',
    groupId: ASSISTANT_GROUP_ID
  };

  for (const chunk of splitIntoChunks(source, options.chunkSize)) {
    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }

    yield {
      event: 'ContentDelta',
      streamId: STREAM_ID,
      text: chunk
    };
  }

  yield {
    event: 'ContentClose',
    streamId: STREAM_ID
  };

  yield {
    event: 'RunCompleted',
    runId: RUN_ID
  };
}

/**
 * 判断一个 surface block 是否已经包含肉眼可见的内容。
 */
function hasVisibleContent(block: SurfaceBlock): boolean {
  if (typeof block.content === 'string' && block.content.trim().length > 0) {
    return true;
  }

  return block.type !== 'markdown' && block.type !== 'text' && block.type !== 'html';
}

/**
 * 统计当前 runtime 里 assistant 对应的 block 数量。
 */
function getAssistantBlocks(currentSnapshot: RuntimeSnapshot): SurfaceBlock[] {
  return currentSnapshot.blocks.filter((block) => block.groupId === ASSISTANT_GROUP_ID || block.messageId === ASSISTANT_MESSAGE_ID);
}

/**
 * 把 block 按生命周期状态统计成简单计数结构。
 */
function countBlockStates(blocks: SurfaceBlock[]): {
  draft: number;
  stable: number;
  settled: number;
} {
  return blocks.reduce(
    (summary, block) => {
      if (block.state === 'draft') {
        summary.draft += 1;
      } else if (block.state === 'stable') {
        summary.stable += 1;
      } else if (block.state === 'settled') {
        summary.settled += 1;
      }

      return summary;
    },
    {
      draft: 0,
      stable: 0,
      settled: 0
    }
  );
}

/**
 * 统计当前 surface 容器里的真实 DOM 元素数量。
 */
function countDomNodes(): number {
  const root = rendererHostRef.value?.querySelector('.agentdown-run-surface');

  if (!root) {
    return 0;
  }

  return root.querySelectorAll('*').length + 1;
}

/**
 * 统计当前页面上实际挂载的消息 group 数量。
 */
function countMountedGroups(): number {
  return rendererHostRef.value?.querySelectorAll('.agentdown-run-surface-group').length ?? 0;
}

/**
 * 统计当前页面上实际挂载的 surface block 数量。
 */
function countMountedBlocks(): number {
  return rendererHostRef.value?.querySelectorAll('.agentdown-run-surface-block').length ?? 0;
}

/**
 * 读取 Chromium 暴露的 JS heap，用于观测大致内存压力。
 */
function readUsedHeapMb(): number | null {
  const performanceWithMemory = window.performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
    };
  };
  const usedBytes = performanceWithMemory.memory?.usedJSHeapSize;

  if (!usedBytes) {
    return null;
  }

  return usedBytes / (1024 * 1024);
}

/**
 * 等待下一个动画帧，给渲染和 DOM 提交留出结算时间。
 */
function waitForAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

/**
 * 生成一份新的 collector，用来累计本轮基准的峰值与时间点。
 */
function createCollector(startedAt: number): StreamingBenchmarkCollector {
  return {
    startedAt,
    timing: {
      firstAssistantBlockMs: null,
      firstVisibleContentMs: null,
      firstStableBlockMs: null,
      firstSettledBlockMs: null,
      streamCompletedMs: null,
      surfaceStableMs: null
    },
    peaks: {
      domNodeCount: 0,
      mountedGroupCount: 0,
      mountedBlockCount: 0,
      runtimeBlockCount: 0,
      draftBlockCount: 0,
      stableBlockCount: 0,
      settledBlockCount: 0,
      historyEntryCount: 0,
      usedHeapMb: null
    },
    longTasks: {
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0
    },
    frames: {
      sampleCount: 0,
      maxDeltaMs: 0,
      framesOver16Ms: 0,
      framesOver33Ms: 0,
      framesOver50Ms: 0
    }
  };
}

/**
 * 用当前 runtime 快照更新关键时间点。
 */
function updateTimingMilestones(collector: StreamingBenchmarkCollector, currentSnapshot: RuntimeSnapshot): void {
  const now = performance.now() - collector.startedAt;
  const assistantBlocks = getAssistantBlocks(currentSnapshot);
  const visibleBlocks = assistantBlocks.filter(hasVisibleContent);
  const stableBlocks = assistantBlocks.filter((block) => block.state !== 'draft');
  const settledBlocks = assistantBlocks.filter((block) => block.state === 'settled');

  if (collector.timing.firstAssistantBlockMs === null && assistantBlocks.length > 0) {
    collector.timing.firstAssistantBlockMs = now;
  }

  if (collector.timing.firstVisibleContentMs === null && visibleBlocks.length > 0) {
    collector.timing.firstVisibleContentMs = now;
  }

  if (collector.timing.firstStableBlockMs === null && stableBlocks.length > 0) {
    collector.timing.firstStableBlockMs = now;
  }

  if (collector.timing.firstSettledBlockMs === null && settledBlocks.length > 0) {
    collector.timing.firstSettledBlockMs = now;
  }
}

/**
 * 用当前 runtime 快照和 DOM 状态刷新峰值统计。
 */
function updatePeaks(collector: StreamingBenchmarkCollector, currentSnapshot: RuntimeSnapshot): void {
  const assistantBlocks = getAssistantBlocks(currentSnapshot);
  const stateSummary = countBlockStates(assistantBlocks);
  const domNodeCount = countDomNodes();
  const mountedGroupCount = countMountedGroups();
  const mountedBlockCount = countMountedBlocks();
  const usedHeapMb = readUsedHeapMb();

  collector.peaks.domNodeCount = Math.max(collector.peaks.domNodeCount, domNodeCount);
  collector.peaks.mountedGroupCount = Math.max(collector.peaks.mountedGroupCount, mountedGroupCount);
  collector.peaks.mountedBlockCount = Math.max(collector.peaks.mountedBlockCount, mountedBlockCount);
  collector.peaks.runtimeBlockCount = Math.max(collector.peaks.runtimeBlockCount, currentSnapshot.blocks.length);
  collector.peaks.draftBlockCount = Math.max(collector.peaks.draftBlockCount, stateSummary.draft);
  collector.peaks.stableBlockCount = Math.max(collector.peaks.stableBlockCount, stateSummary.stable);
  collector.peaks.settledBlockCount = Math.max(collector.peaks.settledBlockCount, stateSummary.settled);
  collector.peaks.historyEntryCount = Math.max(collector.peaks.historyEntryCount, currentSnapshot.history.length);

  if (usedHeapMb !== null) {
    collector.peaks.usedHeapMb = collector.peaks.usedHeapMb === null
      ? usedHeapMb
      : Math.max(collector.peaks.usedHeapMb, usedHeapMb);
  }
}

/**
 * 启动长任务观察器，把大于 50ms 的主线程阻塞累计下来。
 */
function startLongTaskObserver(collector: StreamingBenchmarkCollector): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        collector.longTasks.count += 1;
        collector.longTasks.totalDurationMs += entry.duration;
        collector.longTasks.maxDurationMs = Math.max(collector.longTasks.maxDurationMs, entry.duration);
      }
    });

    observer.observe({
      entryTypes: ['longtask']
    });

    return () => {
      observer.disconnect();
    };
  } catch {
    return () => {};
  }
}

/**
 * 启动按帧采样的 DOM / frame 统计器。
 */
function startFrameSampler(collector: StreamingBenchmarkCollector): () => void {
  let active = true;
  let rafId = 0;
  let lastFrameAt = performance.now();

  const tick = (now: number) => {
    if (!active) {
      return;
    }

    const delta = now - lastFrameAt;
    lastFrameAt = now;

    collector.frames.sampleCount += 1;
    collector.frames.maxDeltaMs = Math.max(collector.frames.maxDeltaMs, delta);

    if (delta > 16.7) {
      collector.frames.framesOver16Ms += 1;
    }

    if (delta > 33.3) {
      collector.frames.framesOver33Ms += 1;
    }

    if (delta > 50) {
      collector.frames.framesOver50Ms += 1;
    }

    updatePeaks(collector, snapshot.value);
    updateTimingMilestones(collector, snapshot.value);
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return () => {
    active = false;
    window.cancelAnimationFrame(rafId);
  };
}

/**
 * 判断当前 surface 是否已经收敛到稳定状态。
 */
function createStabilityKey(currentSnapshot: RuntimeSnapshot): string {
  const assistantBlocks = getAssistantBlocks(currentSnapshot);
  const states = countBlockStates(assistantBlocks);

  return JSON.stringify({
    runtimeBlockCount: currentSnapshot.blocks.length,
    historyEntryCount: currentSnapshot.history.length,
    assistantBlockCount: assistantBlocks.length,
    draftBlockCount: states.draft,
    stableBlockCount: states.stable,
    settledBlockCount: states.settled,
    domNodeCount: countDomNodes(),
    mountedGroupCount: countMountedGroups(),
    mountedBlockCount: countMountedBlocks()
  });
}

/**
 * 等待 stream 结束后的 surface 在连续数帧里保持稳定。
 */
async function waitForStableSurface(maxFrames = 36, stableFrames = 3): Promise<void> {
  let lastKey = '';
  let stableCount = 0;

  for (let index = 0; index < maxFrames; index += 1) {
    await waitForAnimationFrame();
    const nextKey = createStabilityKey(snapshot.value);
    const draftCount = countBlockStates(getAssistantBlocks(snapshot.value)).draft;

    if (draftCount === 0 && nextKey === lastKey) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastKey = nextKey;
    }

    if (stableCount >= stableFrames) {
      return;
    }
  }
}

/**
 * 根据当前 snapshot 生成一份最终冻结的统计结果。
 */
function createFinalSummary(currentSnapshot: RuntimeSnapshot): StreamingBenchmarkFinalSummary {
  const assistantBlocks = getAssistantBlocks(currentSnapshot);
  const stateSummary = countBlockStates(assistantBlocks);

  return {
    domNodeCount: countDomNodes(),
    mountedGroupCount: countMountedGroups(),
    mountedBlockCount: countMountedBlocks(),
    runtimeBlockCount: currentSnapshot.blocks.length,
    assistantBlockCount: assistantBlocks.length,
    draftBlockCount: stateSummary.draft,
    stableBlockCount: stateSummary.stable,
    settledBlockCount: stateSummary.settled,
    historyEntryCount: currentSnapshot.history.length,
    usedHeapMb: readUsedHeapMb()
  };
}

/**
 * 运行一次真实的流式长文档 benchmark。
 */
async function runBenchmark(options: Partial<StreamingBenchmarkRunOptions> = {}): Promise<StreamingBenchmarkResult> {
  if (running.value) {
    throw new Error('Streaming benchmark is already running.');
  }

  const resolvedOptions = normalizeRunOptions(options);
  const source = createBenchmarkSource(resolvedOptions);
  const chunks = splitIntoChunks(source, resolvedOptions.chunkSize);
  const collector = createCollector(performance.now());

  activeOptions.value = resolvedOptions;
  running.value = true;
  failureMessage.value = null;
  lastResult.value = null;

  reset();
  snapshot.value = runtime.snapshot();
  await nextTick();
  seedConversation();

  const stopLongTasks = startLongTaskObserver(collector);
  const stopFrameSampler = startFrameSampler(collector);

  try {
    await start(createPacketStream(source, resolvedOptions));
    collector.timing.streamCompletedMs = performance.now() - collector.startedAt;
    await waitForStableSurface();
    collector.timing.surfaceStableMs = performance.now() - collector.startedAt;
    updatePeaks(collector, snapshot.value);
    updateTimingMilestones(collector, snapshot.value);

    const result: StreamingBenchmarkResult = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      scenario: {
        readingSections: resolvedOptions.readingSections,
        sourceLength: source.length,
        chunkSize: resolvedOptions.chunkSize,
        chunkCount: chunks.length,
        delayMs: resolvedOptions.delayMs,
        surfacePreset: SURFACE_PRESETS[resolvedOptions.surfacePreset]
      },
      timing: collector.timing,
      peaks: collector.peaks,
      final: createFinalSummary(snapshot.value),
      longTasks: collector.longTasks,
      frames: collector.frames
    };

    lastResult.value = result;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failureMessage.value = message;
    throw error;
  } finally {
    stopFrameSampler();
    stopLongTasks();
    running.value = false;
  }
}

/**
 * 对外暴露全局 benchmark API，方便自动化脚本直接调用。
 */
function exposeBenchmarkApi(): void {
  window.__AGENTDOWN_STREAMING_BENCHMARK__ = {
    ready: true,
    run: runBenchmark,
    getLastResult: () => lastResult.value
  };
}

/**
 * 清理全局 API，避免 demo 页卸载后残留旧引用。
 */
function disposeBenchmarkApi(): void {
  delete window.__AGENTDOWN_STREAMING_BENCHMARK__;
}

/**
 * 如果 hash query 带了 autorun，就在页面挂载后自动跑一轮基准。
 */
async function maybeAutoRunBenchmark(): Promise<void> {
  const params = readHashQuery();

  if (params.get('autorun') !== '1') {
    return;
  }

  await runBenchmark(readInitialRunOptions());
}

onMounted(() => {
  activeOptions.value = readInitialRunOptions();
  exposeBenchmarkApi();
  maybeAutoRunBenchmark().catch((error) => {
    failureMessage.value = error instanceof Error ? error.message : String(error);
  });
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
  disposeBenchmarkApi();
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <h1>流式长文档 Benchmark</h1>
      <p>这页专门用真实 RunSurface + markdown assembler 跑长文档流式输出基准，既能手动查看，也能被脚本直接调用。</p>
    </header>

    <section class="demo-panel demo-panel--summary">
      <div class="demo-panel__summary">
        <span>阅读章节：{{ activeOptions.readingSections }}</span>
        <span>Chunk：{{ activeOptions.chunkSize }}</span>
        <span>间隔：{{ activeOptions.delayMs }} ms</span>
        <span>预设：{{ SURFACE_PRESETS[activeOptions.surfacePreset].label }}</span>
      </div>

      <div class="demo-panel__actions">
        <button
          type="button"
          class="demo-button"
          :disabled="running"
          @click="runBenchmark(activeOptions).catch(() => {})"
        >
          {{ running ? '采样中…' : '重新采样' }}
        </button>
      </div>
    </section>

    <section class="demo-panel">
      <div ref="rendererHostRef">
        <RunSurface
          :runtime="runtime"
          v-bind="surfaceOptions"
        />
      </div>
    </section>

    <section
      v-if="lastResult"
      class="demo-panel"
    >
      <h2>结果 JSON</h2>
      <pre class="demo-result">{{ resultJson }}</pre>
    </section>

    <section
      v-if="failureMessage"
      class="demo-panel demo-panel--error"
    >
      <h2>运行失败</h2>
      <p>{{ failureMessage }}</p>
    </section>

    <pre
      v-if="lastResult"
      id="agentdown-streaming-benchmark-result"
      class="demo-hidden-result"
    >{{ resultJson }}</pre>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 44px 24px 96px;
}

.demo-page__header h1,
.demo-page__header p,
.demo-panel h2,
.demo-panel p {
  margin: 0;
}

.demo-page__header h1 {
  font-size: 30px;
  letter-spacing: -0.05em;
}

.demo-page__header p {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.8;
}

.demo-panel {
  margin-top: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  padding: 24px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.04);
}

.demo-panel--summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.demo-panel--error {
  border-color: #fecaca;
  background: #fff7f7;
  color: #991b1b;
}

.demo-panel__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #475569;
  font-size: 13px;
}

.demo-panel__summary span {
  border-radius: 999px;
  padding: 6px 10px;
  background: #f8fafc;
  box-shadow: inset 0 0 0 1px #e2e8f0;
}

.demo-panel__actions {
  display: flex;
  gap: 12px;
}

.demo-button {
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: #e2e8f0;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.demo-result {
  overflow: auto;
  margin-top: 14px;
  border-radius: 18px;
  padding: 16px;
  background: #0f172a;
  color: #dbeafe;
  font-family:
    "SFMono-Regular",
    "JetBrains Mono",
    "Fira Code",
    monospace;
  font-size: 12px;
  line-height: 1.7;
}

.demo-hidden-result {
  display: none;
}

@media (max-width: 720px) {
  .demo-page {
    padding: 24px 16px 56px;
  }

  .demo-panel {
    border-radius: 18px;
    padding: 18px;
  }
}
</style>
