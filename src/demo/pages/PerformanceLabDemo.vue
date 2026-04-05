<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  MarkdownRenderer,
  type MarkdownRendererPerformanceOptions,
  type MarkdownRendererTelemetry
} from '../../index';

/**
 * 性能实验页里的渲染方案预设。
 */
interface PerformancePresetOption {
  /** 预设唯一标识。 */
  id: string;
  /** 页面里展示的名称。 */
  label: string;
  /** 预设说明。 */
  description: string;
  /** 要传给 renderer 的性能配置。 */
  performance: MarkdownRendererPerformanceOptions;
}

/**
 * 性能实验页里的文档规模选项。
 */
interface PerformanceDocumentSizeOption {
  /** 规模唯一标识。 */
  id: string;
  /** 页面里展示的名称。 */
  label: string;
  /** 章节数量。 */
  sections: number;
  /** 规模说明。 */
  description: string;
}

/**
 * 首次渲染基准结果。
 */
interface PerformanceBenchmarkSnapshot {
  /** 从触发重渲染到稳定后的耗时。 */
  initialRenderMs: number | null;
  /** 当前 renderer 根节点下的 DOM 元素数。 */
  domNodeCount: number;
  /** 当前真实挂载的 block 元素数。 */
  mountedElementCount: number;
  /** 多次采样后取中位数的 JS 堆快照，单位 MB。 */
  usedHeapMb: number | null;
  /** 本次堆快照使用的采样次数。 */
  usedHeapSampleCount: number;
}

/**
 * 自动滚动巡检结果。
 */
interface PerformanceScrollSweepSnapshot {
  /** 本轮巡检总耗时。 */
  durationMs: number;
  /** 巡检过程中观测到的最大 DOM 元素数。 */
  maxDomNodeCount: number;
  /** 巡检过程中观测到的最大挂载 block 数。 */
  maxMountedBlockCount: number;
  /** 本轮滚动引发的窗口范围变化次数。 */
  rangeChangeDelta: number;
}

/**
 * 供复制和回传的性能快照结构。
 */
interface PerformanceExportSnapshot {
  /** 快照版本，便于后续演进格式。 */
  schemaVersion: 1;
  /** 生成时间。 */
  generatedAt: string;
  /** 当前浏览器与视口环境。 */
  environment: {
    userAgent: string;
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
  };
  /** 当前选中的性能预设。 */
  preset: {
    id: string;
    label: string;
    performance: MarkdownRendererPerformanceOptions;
  };
  /** 当前文档规模。 */
  document: {
    id: string;
    label: string;
    sections: number;
    sourceLength: number;
  };
  /** 首次渲染基准结果。 */
  benchmark: PerformanceBenchmarkSnapshot;
  /** benchmark 完成时冻结下来的遥测快照。 */
  benchmarkTelemetry: MarkdownRendererTelemetry | null;
  /** scroll sweep 完成时冻结下来的遥测快照。 */
  scrollSweepTelemetry: MarkdownRendererTelemetry | null;
  /** renderer 当前最新的实时遥测。 */
  telemetry: MarkdownRendererTelemetry | null;
  /** 最近一次滚动巡检结果。 */
  scrollSweep: PerformanceScrollSweepSnapshot | null;
}

/**
 * 性能对比面板里的单项指标。
 */
interface PerformanceDiffMetric {
  /** 指标唯一键。 */
  key: string;
  /** 展示名称。 */
  label: string;
  /** 当前值。 */
  current: number | null;
  /** 基线值。 */
  baseline: number | null;
  /** 数值变化量。 */
  delta: number | null;
  /** 百分比变化。 */
  deltaRatio: number | null;
  /** 指标是否越低越好。 */
  lowerIsBetter: boolean;
  /** 当前值展示文案。 */
  currentLabel: string;
  /** 基线值展示文案。 */
  baselineLabel: string;
  /** 差值展示文案。 */
  deltaLabel: string;
}

/**
 * 可复制的性能差异快照。
 */
interface PerformanceDiffSnapshot {
  /** diff 版本。 */
  schemaVersion: 1;
  /** 生成时间。 */
  generatedAt: string;
  /** 基线快照。 */
  baseline: PerformanceExportSnapshot;
  /** 当前快照。 */
  current: PerformanceExportSnapshot;
  /** 关键指标差异。 */
  metrics: Array<{
    key: string;
    label: string;
    current: number | null;
    baseline: number | null;
    delta: number | null;
    deltaRatio: number | null;
    lowerIsBetter: boolean;
  }>;
}

const PERFORMANCE_BASELINE_STORAGE_KEY = 'agentdown:performance-lab:baseline';

const presetOptions: PerformancePresetOption[] = [
  {
    id: 'baseline',
    label: '基线',
    description: '关闭 slab 和窗口化，观察整篇文档一次性挂载时的真实成本。',
    performance: {
      textSlabChars: false,
      virtualize: false
    }
  },
  {
    id: 'optimized',
    label: '推荐优化',
    description: '开启 text slab + retained-window virtualization，接近默认推荐用法。',
    performance: {
      textSlabChars: 1200,
      virtualize: true,
      virtualizeMargin: '1400px 0px'
    }
  },
  {
    id: 'aggressive',
    label: '更激进',
    description: '更短的 slab 和更紧的窗口范围，适合极长文档压力测试。',
    performance: {
      textSlabChars: 800,
      virtualize: true,
      virtualizeMargin: '800px 0px'
    }
  }
];

const documentSizeOptions: PerformanceDocumentSizeOption[] = [
  {
    id: 'm',
    label: '中',
    sections: 48,
    description: '日常说明文档体量。'
  },
  {
    id: 'l',
    label: '大',
    sections: 120,
    description: '明显偏长，适合观察首屏与滚动差异。'
  },
  {
    id: 'xl',
    label: '超大',
    sections: 240,
    description: '专门用来压测窗口化与长文本路径。'
  }
];

const rendererHostRef = ref<HTMLElement | null>(null);
const rendererRevision = ref(0);
const selectedPresetId = ref('optimized');
const selectedSizeId = ref('l');
const liveTelemetry = ref<MarkdownRendererTelemetry | null>(null);
const benchmarkSnapshot = ref<PerformanceBenchmarkSnapshot>({
  initialRenderMs: null,
  domNodeCount: 0,
  mountedElementCount: 0,
  usedHeapMb: null,
  usedHeapSampleCount: 0
});
const benchmarkTelemetrySnapshot = ref<MarkdownRendererTelemetry | null>(null);
const scrollSweepTelemetrySnapshot = ref<MarkdownRendererTelemetry | null>(null);
const scrollSweepSnapshot = ref<PerformanceScrollSweepSnapshot | null>(null);
const benchmarking = ref(false);
const sweeping = ref(false);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const compareCopyState = ref<'idle' | 'copied' | 'failed'>('idle');
const baselineSnapshot = ref<PerformanceExportSnapshot | null>(null);

const selectedPreset = computed<PerformancePresetOption>(() => {
  return presetOptions.find((option) => option.id === selectedPresetId.value) ?? presetOptions[0]!;
});
const selectedSize = computed<PerformanceDocumentSizeOption>(() => {
  return documentSizeOptions.find((option) => option.id === selectedSizeId.value) ?? documentSizeOptions[0]!;
});
const rendererPerformance = computed<MarkdownRendererPerformanceOptions>(() => {
  return selectedPreset.value.performance;
});
const documentSource = computed<string>(() => {
  return createPerformanceDocument(selectedSize.value.sections);
});
const mountedRatio = computed<number>(() => {
  const telemetry = liveTelemetry.value;

  if (!telemetry || telemetry.renderableBlockCount === 0) {
    return 0;
  }

  return telemetry.mountedBlockCount / telemetry.renderableBlockCount;
});
const exportSnapshot = computed<PerformanceExportSnapshot>(() => {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    preset: {
      id: selectedPreset.value.id,
      label: selectedPreset.value.label,
      performance: selectedPreset.value.performance
    },
    document: {
      id: selectedSize.value.id,
      label: selectedSize.value.label,
      sections: selectedSize.value.sections,
      sourceLength: documentSource.value.length
    },
    benchmark: benchmarkSnapshot.value,
    benchmarkTelemetry: benchmarkTelemetrySnapshot.value,
    scrollSweepTelemetry: scrollSweepTelemetrySnapshot.value,
    telemetry: liveTelemetry.value,
    scrollSweep: scrollSweepSnapshot.value
  };
});
const exportJson = computed<string>(() => {
  return JSON.stringify(exportSnapshot.value, null, 2);
});
const comparingDifferentScenario = computed<boolean>(() => {
  const baseline = baselineSnapshot.value;

  if (!baseline) {
    return false;
  }

  return baseline.preset.id !== exportSnapshot.value.preset.id
    || baseline.document.id !== exportSnapshot.value.document.id;
});
const diffMetrics = computed<PerformanceDiffMetric[]>(() => {
  const baseline = baselineSnapshot.value;

  if (!baseline) {
    return [];
  }

  const baselineBenchmarkTelemetry = baseline.benchmarkTelemetry ?? baseline.telemetry;
  const currentBenchmarkTelemetry = exportSnapshot.value.benchmarkTelemetry ?? exportSnapshot.value.telemetry;
  const baselineScrollTelemetry = baseline.scrollSweepTelemetry;
  const currentScrollTelemetry = exportSnapshot.value.scrollSweepTelemetry;

  return [
    createDiffMetric(
      'initialRenderMs',
      '首轮稳定耗时',
      exportSnapshot.value.benchmark.initialRenderMs,
      baseline.benchmark.initialRenderMs,
      true,
      formatMilliseconds
    ),
    createDiffMetric(
      'domNodeCount',
      'DOM 元素数',
      exportSnapshot.value.benchmark.domNodeCount,
      baseline.benchmark.domNodeCount,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    ),
    createDiffMetric(
      'mountedBlockCount',
      '挂载 block 数',
      currentBenchmarkTelemetry?.mountedBlockCount ?? null,
      baselineBenchmarkTelemetry?.mountedBlockCount ?? null,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    ),
    createDiffMetric(
      'measuredBlockCount',
      '已测量高度',
      currentBenchmarkTelemetry?.measuredBlockCount ?? null,
      baselineBenchmarkTelemetry?.measuredBlockCount ?? null,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    ),
    createDiffMetric(
      'viewportSyncPasses',
      '视口同步',
      currentBenchmarkTelemetry?.viewportSyncPasses ?? null,
      baselineBenchmarkTelemetry?.viewportSyncPasses ?? null,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    ),
    createDiffMetric(
      'windowRangeChangeCount',
      '窗口变化次数',
      currentBenchmarkTelemetry?.windowRangeChangeCount ?? null,
      baselineBenchmarkTelemetry?.windowRangeChangeCount ?? null,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    ),
    createDiffMetric(
      'scrollDurationMs',
      '滚动巡检耗时',
      exportSnapshot.value.scrollSweep?.durationMs ?? null,
      baseline.scrollSweep?.durationMs ?? null,
      true,
      formatMilliseconds
    ),
    createDiffMetric(
      'rangeChangeDelta',
      '巡检新增窗口变化',
      exportSnapshot.value.scrollSweep?.rangeChangeDelta ?? null,
      baseline.scrollSweep?.rangeChangeDelta ?? null,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    ),
    createDiffMetric(
      'scrollSweepViewportSyncPasses',
      '巡检后视口同步',
      currentScrollTelemetry?.viewportSyncPasses ?? null,
      baselineScrollTelemetry?.viewportSyncPasses ?? null,
      true,
      (value) => value === null ? '--' : formatMetricNumber(value)
    )
  ];
});
const diffSnapshot = computed<PerformanceDiffSnapshot | null>(() => {
  const baseline = baselineSnapshot.value;

  if (!baseline) {
    return null;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseline,
    current: exportSnapshot.value,
    metrics: diffMetrics.value.map((metric) => ({
      key: metric.key,
      label: metric.label,
      current: metric.current,
      baseline: metric.baseline,
      delta: metric.delta,
      deltaRatio: metric.deltaRatio,
      lowerIsBetter: metric.lowerIsBetter
    }))
  };
});
const diffJson = computed<string>(() => {
  return JSON.stringify(diffSnapshot.value, null, 2);
});

/**
 * 生成单段纯文本，用来持续施压 pretext 与长文本渲染链。
 */
function createPerformanceParagraph(sectionIndex: number, paragraphIndex: number): string {
  return [
    `第 ${sectionIndex} 章第 ${paragraphIndex} 段是一段连续长文本。`,
    '这一段故意保持为纯文本，方便观察 pretext、slab 拆分与窗口化叠加之后的真实收益。',
    '如果这里滚动时仍然稳定，说明优化不是只对孤立 demo 生效，而是能覆盖长文阅读、Agent 结果页和复杂说明文档这种更实际的场景。',
    '同一章节里还会穿插表格、代码块和列表，避免测试结果只反映单一节点类型。'
  ].join('');
}

/**
 * 生成一章混合型 markdown 内容。
 */
function createPerformanceSection(sectionIndex: number): string {
  return [
    `## 性能章节 ${String(sectionIndex).padStart(3, '0')}`,
    '',
    createPerformanceParagraph(sectionIndex, 1),
    '',
    createPerformanceParagraph(sectionIndex, 2),
    '',
    `- 章节 ${sectionIndex} 要点一：观察首屏挂载数量`,
    `- 章节 ${sectionIndex} 要点二：观察滚动时窗口变化`,
    `- 章节 ${sectionIndex} 要点三：确认长段文本不会一次性压垮布局`,
    '',
    '| 指标 | 值 | 说明 |',
    '| --- | --- | --- |',
    `| section | ${sectionIndex} | 当前章节索引 |`,
    `| mode | ${sectionIndex % 2 === 0 ? 'analysis' : 'answer'} | 模拟不同段落语气 |`,
    `| size | ${(sectionIndex % 5) + 1}x | 模拟不同内容密度 |`,
    '',
    '```ts',
    `const section = ${sectionIndex};`,
    `const enabled = ${sectionIndex % 2 === 0 ? 'true' : 'false'};`,
    'console.log("agentdown performance lab", section, enabled);',
    '```',
    '',
    '> 这一段引用会让列表、文本、表格和代码混排，帮助我们确认不是只有纯段落才表现良好。',
    '',
    '---',
    ''
  ].join('\n');
}

/**
 * 组装整篇用于性能实验的 markdown 长文。
 */
function createPerformanceDocument(sectionCount: number): string {
  return [
    '# Agentdown 性能实验室',
    '',
    '这页是专门用来验证长文档渲染优化是否真的生效，而不是只看主观感受。',
    '',
    '你可以切换上面的方案和文档规模，然后看首屏耗时、DOM 数、挂载块数，以及自动滚动时窗口变化是否合理。',
    '',
    ...Array.from({ length: sectionCount }, (_, index) => createPerformanceSection(index + 1))
  ].join('\n');
}

/**
 * 记录 renderer 最新一次吐出的内部遥测快照。
 */
function handleTelemetry(snapshot: MarkdownRendererTelemetry): void {
  liveTelemetry.value = snapshot;
}

/**
 * 深拷贝一份当前遥测，避免后续实时更新污染已经冻结的实验结果。
 */
function cloneTelemetrySnapshot(snapshot: MarkdownRendererTelemetry | null): MarkdownRendererTelemetry | null {
  if (snapshot === null) {
    return null;
  }

  return JSON.parse(JSON.stringify(snapshot)) as MarkdownRendererTelemetry;
}

/**
 * 等待一个浏览器动画帧，给渲染与测量链留出结算时间。
 */
function waitForAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

/**
 * 生成一个足够轻量的稳定性指纹，用来判断当前渲染状态是否已经收敛。
 */
function createStabilityKey(): string {
  const telemetry = liveTelemetry.value;

  return JSON.stringify({
    domNodeCount: countRendererDomNodes(),
    mountedElementCount: countMountedBlockElements(),
    mountedBlockCount: telemetry?.mountedBlockCount ?? 0,
    mountedStartIndex: telemetry?.mountedStartIndex ?? 0,
    mountedEndIndex: telemetry?.mountedEndIndex ?? 0,
    measuredBlockCount: telemetry?.measuredBlockCount ?? 0,
    windowRangeChangeCount: telemetry?.windowRangeChangeCount ?? 0,
    width: telemetry?.width ?? 0
  });
}

/**
 * 等待 renderer 在连续数帧内保持稳定，避免 benchmark 固定空等导致结果失真。
 */
async function waitForStableRenderer(maxFrames = 18, stableFrames = 2): Promise<void> {
  let lastKey = '';
  let stableCount = 0;

  for (let index = 0; index < maxFrames; index += 1) {
    await waitForAnimationFrame();
    const nextKey = createStabilityKey();

    if (nextKey === lastKey) {
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
 * 统计当前 renderer 根节点下的 DOM 元素数量。
 */
function countRendererDomNodes(): number {
  const root = rendererHostRef.value?.querySelector('.agentdown-root');

  if (!root) {
    return 0;
  }

  return root.querySelectorAll('*').length + 1;
}

/**
 * 统计当前真实挂载到 DOM 中的 block 容器数量。
 */
function countMountedBlockElements(): number {
  const root = rendererHostRef.value?.querySelector('.agentdown-root');

  if (!root) {
    return 0;
  }

  return root.querySelectorAll('.agentdown-measured-block, .agentdown-block-slot').length;
}

/**
 * 读取 Chrome 提供的堆内存快照；非 Chromium 环境下返回空。
 */
function readUsedHeapMb(): number | null {
  const performanceWithMemory = globalThis.performance as Performance & {
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
 * 读取多次 JS heap 快照并取中位数，减少单次采样受 GC 时机影响过大的问题。
 */
async function sampleUsedHeapMb(sampleCount = 5): Promise<number | null> {
  const samples: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    await waitForAnimationFrame();
    const value = readUsedHeapMb();

    if (value !== null) {
      samples.push(value);
    }
  }

  if (samples.length === 0) {
    return null;
  }

  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)] ?? null;
}

/**
 * 对当前方案重新挂载一次 renderer，并记录首轮稳定后的指标。
 */
async function runBenchmark(): Promise<void> {
  benchmarking.value = true;
  copyState.value = 'idle';
  compareCopyState.value = 'idle';
  liveTelemetry.value = null;
  benchmarkTelemetrySnapshot.value = null;
  scrollSweepTelemetrySnapshot.value = null;
  benchmarkSnapshot.value = {
    initialRenderMs: null,
    domNodeCount: 0,
    mountedElementCount: 0,
    usedHeapMb: null,
    usedHeapSampleCount: 0
  };
  scrollSweepSnapshot.value = null;
  rendererRevision.value += 1;

  const startedAt = globalThis.performance.now();

  await nextTick();
  await waitForStableRenderer();
  const initialRenderMs = globalThis.performance.now() - startedAt;
  const usedHeapMb = await sampleUsedHeapMb();

  benchmarkSnapshot.value = {
    initialRenderMs,
    domNodeCount: countRendererDomNodes(),
    mountedElementCount: countMountedBlockElements(),
    usedHeapMb,
    usedHeapSampleCount: usedHeapMb === null ? 0 : 5
  };
  benchmarkTelemetrySnapshot.value = cloneTelemetrySnapshot(liveTelemetry.value);
  benchmarking.value = false;
}

/**
 * 自动滚动整篇文档一遍，观察窗口化在真实滚动中的挂载峰值与范围变化次数。
 */
async function runScrollSweep(): Promise<void> {
  const host = rendererHostRef.value;
  const telemetry = liveTelemetry.value;

  if (!host || !telemetry) {
    return;
  }

  sweeping.value = true;

  const startTop = Math.max(0, host.getBoundingClientRect().top + window.scrollY - 96);
  const endTop = startTop + Math.max(host.offsetHeight, telemetry.totalVirtualHeight);
  const scrollStep = Math.max(320, Math.round(window.innerHeight * 0.85));
  const startedAt = globalThis.performance.now();
  const rangeChangeBaseline = telemetry.windowRangeChangeCount;
  let maxDomNodeCount = countRendererDomNodes();
  let maxMountedBlockCount = telemetry.mountedBlockCount;

  for (let top = startTop; top <= endTop; top += scrollStep) {
    window.scrollTo({
      top,
      behavior: 'auto'
    });
    await waitForStableRenderer(6, 1);
    maxDomNodeCount = Math.max(maxDomNodeCount, countRendererDomNodes());
    maxMountedBlockCount = Math.max(maxMountedBlockCount, liveTelemetry.value?.mountedBlockCount ?? 0);
  }

  window.scrollTo({
    top: startTop,
    behavior: 'auto'
  });
  await waitForStableRenderer(6, 1);

  scrollSweepSnapshot.value = {
    durationMs: globalThis.performance.now() - startedAt,
    maxDomNodeCount,
    maxMountedBlockCount,
    rangeChangeDelta: Math.max(0, (liveTelemetry.value?.windowRangeChangeCount ?? 0) - rangeChangeBaseline)
  };
  scrollSweepTelemetrySnapshot.value = cloneTelemetrySnapshot(liveTelemetry.value);
  sweeping.value = false;
}

/**
 * 把数字指标格式化成适合面板展示的整数文本。
 */
function formatMetricNumber(value: number): string {
  return Intl.NumberFormat('zh-CN').format(Math.round(value));
}

/**
 * 把毫秒耗时格式化成两位小数。
 */
function formatMilliseconds(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return `${value.toFixed(2)} ms`;
}

/**
 * 把 MB 指标格式化成更易读的文本。
 */
function formatMegabytes(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return `${value.toFixed(1)} MB`;
}

/**
 * 把挂载比例格式化成百分比。
 */
function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * 把带符号的数值格式化成适合 diff 面板阅读的文本。
 */
function formatSignedNumber(value: number | null, fractionDigits = 0): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }

  if (fractionDigits === 0) {
    return `${value > 0 ? '+' : ''}${Intl.NumberFormat('zh-CN').format(Math.round(value))}`;
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(fractionDigits)}`;
}

/**
 * 把百分比变化格式化成直观的展示文案。
 */
function formatDeltaRatio(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '--';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/**
 * 生成一条用于当前快照与基线快照对比的指标。
 */
function createDiffMetric(
  key: string,
  label: string,
  current: number | null,
  baseline: number | null,
  lowerIsBetter: boolean,
  formatter: (value: number | null) => string
): PerformanceDiffMetric {
  const delta = current === null || baseline === null ? null : current - baseline;
  const deltaRatio = delta === null || baseline === null || baseline === 0
    ? null
    : (delta / baseline) * 100;

  return {
    key,
    label,
    current,
    baseline,
    delta,
    deltaRatio,
    lowerIsBetter,
    currentLabel: formatter(current),
    baselineLabel: formatter(baseline),
    deltaLabel: delta === null
      ? '--'
      : `${formatSignedNumber(delta, Math.abs(delta) < 10 ? 1 : 0)} / ${formatDeltaRatio(deltaRatio)}`
  };
}

/**
 * 判断某条指标相对基线是改善、退步还是无变化。
 */
function resolveDiffMetricTone(metric: PerformanceDiffMetric): 'better' | 'worse' | 'neutral' {
  if (metric.delta === null || metric.delta === 0) {
    return 'neutral';
  }

  const improved = metric.lowerIsBetter ? metric.delta < 0 : metric.delta > 0;
  return improved ? 'better' : 'worse';
}

/**
 * 尝试把文本写入系统剪贴板。
 */
async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * 复制当前性能快照 JSON，方便回传和对比优化前后差异。
 */
async function copyPerformanceSnapshot(): Promise<void> {
  copyState.value = 'idle';

  try {
    await writeClipboardText(exportJson.value);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }
}

/**
 * 从本地缓存恢复上一份保存的基线快照。
 */
function loadBaselineSnapshot(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const raw = window.localStorage.getItem(PERFORMANCE_BASELINE_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    baselineSnapshot.value = JSON.parse(raw) as PerformanceExportSnapshot;
  } catch {
    window.localStorage.removeItem(PERFORMANCE_BASELINE_STORAGE_KEY);
  }
}

/**
 * 保存当前快照为基线，供后续 diff 面板复用。
 */
function saveCurrentAsBaseline(): void {
  compareCopyState.value = 'idle';
  baselineSnapshot.value = JSON.parse(JSON.stringify(exportSnapshot.value)) as PerformanceExportSnapshot;
}

/**
 * 清除当前缓存的基线快照。
 */
function clearBaselineSnapshot(): void {
  compareCopyState.value = 'idle';
  baselineSnapshot.value = null;
}

/**
 * 复制当前快照相对基线的差异 JSON。
 */
async function copyPerformanceDiff(): Promise<void> {
  compareCopyState.value = 'idle';

  if (diffSnapshot.value === null) {
    compareCopyState.value = 'failed';
    return;
  }

  try {
    await writeClipboardText(diffJson.value);
    compareCopyState.value = 'copied';
  } catch {
    compareCopyState.value = 'failed';
  }
}

watch(
  baselineSnapshot,
  (snapshot) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (snapshot === null) {
      window.localStorage.removeItem(PERFORMANCE_BASELINE_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(PERFORMANCE_BASELINE_STORAGE_KEY, JSON.stringify(snapshot));
  },
  {
    deep: true
  }
);

watch(
  [selectedPresetId, selectedSizeId],
  () => {
    void runBenchmark();
  }
);

onMounted(() => {
  loadBaselineSnapshot();
  void runBenchmark();
});
</script>

<template>
  <section class="demo-page">
    <header class="demo-page__header">
      <div>
        <h1>性能实验室</h1>
        <p>切换基线与优化配置，直接看挂载块数、DOM 数、首轮渲染耗时和滚动巡检结果。</p>
      </div>

      <div class="demo-actions">
        <button
          type="button"
          class="demo-button"
          :disabled="benchmarking"
          @click="runBenchmark().catch(() => {})"
        >
          {{ benchmarking ? '采样中…' : '重新采样' }}
        </button>

        <button
          type="button"
          class="demo-button demo-button--secondary"
          :disabled="benchmarking || sweeping || !liveTelemetry"
          @click="runScrollSweep().catch(() => {})"
        >
          {{ sweeping ? '滚动巡检中…' : '自动滚动巡检' }}
        </button>
      </div>
    </header>

    <div class="control-grid">
      <section class="control-card">
        <span class="control-card__label">渲染方案</span>
        <div class="chip-group">
          <button
            v-for="option in presetOptions"
            :key="option.id"
            type="button"
            class="chip"
            :class="{ 'chip--active': option.id === selectedPresetId }"
            @click="selectedPresetId = option.id"
          >
            {{ option.label }}
          </button>
        </div>
        <p>{{ selectedPreset.description }}</p>
      </section>

      <section class="control-card">
        <span class="control-card__label">文档规模</span>
        <div class="chip-group">
          <button
            v-for="option in documentSizeOptions"
            :key="option.id"
            type="button"
            class="chip"
            :class="{ 'chip--active': option.id === selectedSizeId }"
            @click="selectedSizeId = option.id"
          >
            {{ option.label }}
          </button>
        </div>
        <p>{{ selectedSize.description }} 当前章节数：{{ selectedSize.sections }}</p>
      </section>
    </div>

    <div class="metrics-grid">
      <article class="metric-card">
        <span>首轮稳定耗时</span>
        <strong>{{ formatMilliseconds(benchmarkSnapshot.initialRenderMs) }}</strong>
      </article>

      <article class="metric-card">
        <span>DOM 元素数</span>
        <strong>{{ formatMetricNumber(benchmarkSnapshot.domNodeCount) }}</strong>
      </article>

      <article class="metric-card">
        <span>挂载 block 数</span>
        <strong>{{ formatMetricNumber(liveTelemetry?.mountedBlockCount ?? 0) }}</strong>
      </article>

      <article class="metric-card">
        <span>挂载占比</span>
        <strong>{{ formatRatio(mountedRatio) }}</strong>
      </article>

      <article class="metric-card">
        <span>窗口变化次数</span>
        <strong>{{ formatMetricNumber(liveTelemetry?.windowRangeChangeCount ?? 0) }}</strong>
      </article>

      <article class="metric-card">
        <span>JS Heap 快照</span>
        <strong>{{ formatMegabytes(benchmarkSnapshot.usedHeapMb) }}</strong>
        <em v-if="benchmarkSnapshot.usedHeapSampleCount > 0">
          {{ benchmarkSnapshot.usedHeapSampleCount }} 次采样中位数
        </em>
      </article>
    </div>

    <div class="detail-grid">
      <section class="detail-card">
        <h2>内部遥测</h2>
        <dl class="detail-list">
          <div>
            <dt>原始 block</dt>
            <dd>{{ formatMetricNumber(liveTelemetry?.parsedBlockCount ?? 0) }}</dd>
          </div>
          <div>
            <dt>渲染 block</dt>
            <dd>{{ formatMetricNumber(liveTelemetry?.renderableBlockCount ?? 0) }}</dd>
          </div>
          <div>
            <dt>已测量高度</dt>
            <dd>{{ formatMetricNumber(liveTelemetry?.measuredBlockCount ?? 0) }}</dd>
          </div>
          <div>
            <dt>DOM 中 block</dt>
            <dd>{{ formatMetricNumber(benchmarkSnapshot.mountedElementCount) }}</dd>
          </div>
          <div>
            <dt>窗口范围</dt>
            <dd>{{ liveTelemetry ? `${liveTelemetry.mountedStartIndex} - ${liveTelemetry.mountedEndIndex}` : '--' }}</dd>
          </div>
          <div>
            <dt>视口同步</dt>
            <dd>{{ formatMetricNumber(liveTelemetry?.viewportSyncPasses ?? 0) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-card">
        <h2>滚动巡检</h2>
        <dl
          v-if="scrollSweepSnapshot"
          class="detail-list"
        >
          <div>
            <dt>巡检耗时</dt>
            <dd>{{ formatMilliseconds(scrollSweepSnapshot.durationMs) }}</dd>
          </div>
          <div>
            <dt>DOM 峰值</dt>
            <dd>{{ formatMetricNumber(scrollSweepSnapshot.maxDomNodeCount) }}</dd>
          </div>
          <div>
            <dt>挂载峰值</dt>
            <dd>{{ formatMetricNumber(scrollSweepSnapshot.maxMountedBlockCount) }}</dd>
          </div>
          <div>
            <dt>新增窗口变化</dt>
            <dd>{{ formatMetricNumber(scrollSweepSnapshot.rangeChangeDelta) }}</dd>
          </div>
        </dl>
        <p v-else>
          先点一次“自动滚动巡检”，看整篇文档滚一遍之后，挂载峰值和窗口变化次数是不是明显低于基线模式。
        </p>
      </section>
    </div>

    <section class="compare-card">
      <div class="compare-card__head">
        <div>
          <h2>性能 Diff</h2>
          <p>先保存一份基线快照，后面每次重跑都可以直接看当前结果相对基线是提升还是退步。</p>
        </div>

        <div class="compare-card__actions">
          <button
            type="button"
            class="demo-button demo-button--secondary"
            :disabled="benchmarking || sweeping"
            @click="saveCurrentAsBaseline"
          >
            保存当前为基线
          </button>

          <button
            type="button"
            class="demo-button demo-button--secondary"
            :disabled="benchmarking || sweeping || !baselineSnapshot"
            @click="copyPerformanceDiff().catch(() => {})"
          >
            复制 Diff JSON
          </button>

          <button
            type="button"
            class="demo-button demo-button--ghost"
            :disabled="benchmarking || sweeping || !baselineSnapshot"
            @click="clearBaselineSnapshot"
          >
            清除基线
          </button>
        </div>
      </div>

      <div
        v-if="baselineSnapshot"
        class="compare-card__meta"
      >
        <span>基线：{{ baselineSnapshot.preset.label }} / {{ baselineSnapshot.document.label }}</span>
        <span>当前：{{ exportSnapshot.preset.label }} / {{ exportSnapshot.document.label }}</span>
        <span
          v-if="compareCopyState === 'copied'"
          class="compare-card__status compare-card__status--success"
        >
          Diff 已复制
        </span>
        <span
          v-else-if="compareCopyState === 'failed'"
          class="compare-card__status compare-card__status--error"
        >
          Diff 复制失败
        </span>
      </div>

      <p
        v-if="baselineSnapshot && comparingDifferentScenario"
        class="compare-card__warning"
      >
        当前场景和基线的预设或文档规模不同，这份 diff 更适合看趋势，不适合当严格对照实验。
      </p>

      <div
        v-if="baselineSnapshot"
        class="compare-grid"
      >
        <article
          v-for="metric in diffMetrics"
          :key="metric.key"
          class="compare-metric"
          :data-tone="resolveDiffMetricTone(metric)"
        >
          <span>{{ metric.label }}</span>
          <strong>{{ metric.deltaLabel }}</strong>
          <small>当前 {{ metric.currentLabel }} / 基线 {{ metric.baselineLabel }}</small>
        </article>
      </div>

      <p
        v-else
        class="compare-card__empty"
      >
        先点“保存当前为基线”，后面重新采样或切换配置后，这里就会自动显示差异。
      </p>
    </section>

    <section class="export-card">
      <div class="export-card__head">
        <div>
          <h2>性能 JSON</h2>
          <p>复制这份快照发给我，我就能按同一套口径继续分析和优化。</p>
        </div>

        <div class="export-card__actions">
          <button
            type="button"
            class="demo-button demo-button--secondary"
            @click="copyPerformanceSnapshot().catch(() => {})"
          >
            复制 JSON
          </button>
          <span
            v-if="copyState === 'copied'"
            class="export-card__status export-card__status--success"
          >
            已复制
          </span>
          <span
            v-else-if="copyState === 'failed'"
            class="export-card__status export-card__status--error"
          >
            复制失败
          </span>
        </div>
      </div>

      <pre class="export-card__code">{{ exportJson }}</pre>
    </section>

    <section class="guide-card">
      <h2>怎么验不是吹牛</h2>
      <ol>
        <li>先切到“超大 + 基线”，点“重新采样”，记住 DOM 元素数和挂载 block 数。</li>
        <li>再切到“超大 + 推荐优化”，重复一次，挂载占比应该明显下降。</li>
        <li>打开 Chrome DevTools 的 Performance 面板，录制一次滚动，观察 Main 线程和 Recalculate Style / Layout 时长。</li>
        <li>如果你想看内存，再打开 Memory 或直接看上面的 JS Heap 指标；Chrome 下会更直观。</li>
      </ol>
    </section>

    <div
      ref="rendererHostRef"
      class="renderer-card"
    >
      <MarkdownRenderer
        :key="rendererRevision"
        :source="documentSource"
        :performance="rendererPerformance"
        font='400 16px "Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif'
        :line-height="28"
        @telemetry="handleTelemetry"
      />
    </div>
  </section>
</template>

<style scoped>
.demo-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: 36px 24px 96px;
  min-height: 100%;
}

.demo-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.demo-page__header h1,
.demo-page__header p,
.detail-card h2,
.guide-card h2 {
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

.demo-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.demo-button {
  border: 0;
  border-radius: 999px;
  padding: 11px 16px;
  background: #0f172a;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.demo-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.demo-button--secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.control-grid,
.metrics-grid,
.detail-grid {
  display: grid;
  gap: 16px;
  margin-top: 24px;
}

.control-grid,
.detail-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metrics-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.control-card,
.metric-card,
.detail-card,
.compare-card,
.export-card,
.guide-card,
.renderer-card {
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: #ffffff;
}

.control-card,
.detail-card,
.compare-card,
.export-card,
.guide-card {
  padding: 18px 20px;
}

.metric-card {
  padding: 16px 18px;
}

.renderer-card {
  margin-top: 24px;
  padding: 28px 30px;
}

.control-card__label {
  display: inline-block;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.control-card p,
.detail-card p {
  margin: 12px 0 0;
  color: #64748b;
  line-height: 1.8;
}

.chip-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.chip {
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 8px 12px;
  background: #ffffff;
  color: #334155;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.chip--active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
}

.metric-card span {
  display: block;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.metric-card strong {
  display: block;
  margin-top: 8px;
  font-size: 24px;
  letter-spacing: -0.04em;
}

.metric-card em {
  display: block;
  margin-top: 6px;
  color: #94a3b8;
  font-size: 11px;
  font-style: normal;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
  margin-top: 16px;
}

.detail-list div {
  border-radius: 14px;
  background: #f8fafc;
  padding: 12px 14px;
}

.detail-list dt {
  color: #64748b;
  font-size: 12px;
}

.detail-list dd {
  margin: 8px 0 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 600;
}

.guide-card {
  margin-top: 24px;
}

.compare-card {
  margin-top: 24px;
}

.export-card {
  margin-top: 24px;
}

.compare-card__head,
.export-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.compare-card__head h2,
.compare-card__head p,
.export-card__head h2,
.export-card__head p {
  margin: 0;
}

.compare-card__head p,
.export-card__head p {
  margin-top: 10px;
  color: #64748b;
  line-height: 1.8;
}

.compare-card__actions,
.export-card__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.demo-button--ghost {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
}

.compare-card__meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 16px;
  color: #64748b;
  font-size: 13px;
}

.compare-card__status {
  font-weight: 600;
}

.compare-card__status--success {
  color: #15803d;
}

.compare-card__status--error {
  color: #b91c1c;
}

.compare-card__warning,
.compare-card__empty {
  margin: 16px 0 0;
  color: #64748b;
  line-height: 1.8;
}

.compare-card__warning {
  color: #92400e;
}

.compare-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.compare-metric {
  border-radius: 16px;
  padding: 14px;
  background: #f8fafc;
}

.compare-metric[data-tone='better'] {
  background: #f0fdf4;
}

.compare-metric[data-tone='worse'] {
  background: #fff7ed;
}

.compare-metric span {
  display: block;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.compare-metric strong {
  display: block;
  margin-top: 8px;
  color: #0f172a;
  font-size: 18px;
  line-height: 1.35;
}

.compare-metric small {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.export-card__status {
  font-size: 13px;
  font-weight: 600;
}

.export-card__status--success {
  color: #15803d;
}

.export-card__status--error {
  color: #b91c1c;
}

.export-card__code {
  overflow: auto;
  margin: 18px 0 0;
  border-radius: 16px;
  padding: 16px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.7;
}

.guide-card ol {
  margin: 14px 0 0;
  padding-left: 20px;
  color: #334155;
  line-height: 1.9;
}

@media (max-width: 1100px) {
  .metrics-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .compare-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 840px) {
  .demo-page {
    padding: 24px 16px 72px;
  }

  .demo-page__header {
    flex-direction: column;
  }

  .control-grid,
  .detail-grid,
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .renderer-card {
    padding: 22px 18px;
  }

  .compare-card__head,
  .export-card__head {
    flex-direction: column;
  }

  .compare-grid {
    grid-template-columns: 1fr;
  }
}
</style>
