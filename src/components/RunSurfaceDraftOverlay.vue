<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRuntimeSnapshot } from '../composables/useRuntimeSnapshot';
import type { AgentRuntime } from '../runtime/types';
import type {
  RunSurfaceDraftDiagnostic,
  RunSurfaceDraftDiagnosticsResult
} from '../devtools/runSurfaceDraftDiagnostics';
import {
  resolveRunSurfaceDraftDiagnostics
} from '../devtools/runSurfaceDraftDiagnostics';

/**
 * `RunSurfaceDraftOverlay` 的组件输入参数。
 */
interface Props {
  /** 当前要观察的 runtime。 */
  runtime: AgentRuntime;
  /** 只分析指定 slot 下的 draft block。 */
  slot?: string;
  /** overlay 标题。 */
  title?: string;
  /** 没有 draft 时显示的文案。 */
  emptyText?: string;
  /** 首次渲染时是否默认展开。 */
  initiallyOpen?: boolean;
  /** 当页面里首次出现 draft 时是否自动展开。 */
  autoOpenOnDraft?: boolean;
  /** 最多显示最近多少条 draft 诊断。 */
  maxItems?: number;
}

const props = withDefaults(defineProps<Props>(), {
  slot: 'main',
  title: 'Draft Devtools',
  emptyText: '当前没有进行中的 draft block。',
  initiallyOpen: false,
  autoOpenOnDraft: true,
  maxItems: 6
});

const open = ref(props.initiallyOpen);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const snapshotState = useRuntimeSnapshot(() => props.runtime);
let copyStateTimer: number | undefined;

/**
 * 计算当前 runtime 对应的 draft 诊断结果。
 */
const diagnosticsResult = computed<RunSurfaceDraftDiagnosticsResult>(() => {
  return resolveRunSurfaceDraftDiagnostics(snapshotState.snapshot.value, {
    slot: props.slot
  });
});

/**
 * 读取当前 slot 下仍处于 draft 的总数。
 */
const draftCount = computed(() => diagnosticsResult.value.summary.draftBlockCount);

/**
 * 读取当前 overlay 实际展示的诊断条目。
 *
 * 默认保留最后几条，更贴近用户当前正在看到的尾部内容。
 */
const visibleDiagnostics = computed<RunSurfaceDraftDiagnostic[]>(() => {
  const maxItems = Math.max(1, props.maxItems);
  return diagnosticsResult.value.diagnostics.slice(-maxItems);
});

/**
 * 读取被折叠掉但仍然存在的 draft 条目数量。
 */
const hiddenDiagnosticsCount = computed(() => {
  return Math.max(0, diagnosticsResult.value.diagnostics.length - visibleDiagnostics.value.length);
});

/**
 * 生成当前 overlay 可直接复制的调试快照。
 */
const exportSnapshot = computed(() => ({
  schemaVersion: 1 as const,
  generatedAt: new Date().toISOString(),
  slot: props.slot,
  summary: diagnosticsResult.value.summary,
  diagnostics: diagnosticsResult.value.diagnostics
}));

watch(
  draftCount,
  (nextDraftCount, previousDraftCount) => {
    if (!props.autoOpenOnDraft) {
      return;
    }

    if (nextDraftCount > 0 && (previousDraftCount ?? 0) === 0) {
      open.value = true;
    }
  }
);

/**
 * 清理复制状态的短暂反馈定时器。
 */
function clearCopyStateTimer() {
  if (copyStateTimer !== undefined) {
    globalThis.clearTimeout(copyStateTimer);
    copyStateTimer = undefined;
  }
}

onBeforeUnmount(() => {
  clearCopyStateTimer();
});

/**
 * 切换 overlay 当前的展开状态。
 */
function toggleOpen() {
  open.value = !open.value;
}

/**
 * 把当前 draft 诊断快照复制成 JSON。
 */
async function copyDiagnostics(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(exportSnapshot.value, null, 2));
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }

  clearCopyStateTimer();
  copyStateTimer = globalThis.setTimeout(() => {
    copyState.value = 'idle';
    copyStateTimer = undefined;
  }, 3000);
}

/**
 * 把时间戳格式化成更适合面板阅读的本地时间。
 */
function formatTimestamp(value: number | undefined): string {
  if (!value) {
    return '未记录';
  }

  return new Date(value).toLocaleTimeString('zh-CN', {
    hour12: false
  });
}
</script>

<template>
  <aside
    class="agentdown-draft-overlay"
    :data-open="open ? 'true' : 'false'"
  >
    <header class="agentdown-draft-overlay__header">
      <button
        type="button"
        class="agentdown-draft-overlay__toggle"
        @click="toggleOpen"
      >
        <span>{{ title }}</span>
        <strong>{{ draftCount }}</strong>
      </button>

      <button
        v-if="open"
        type="button"
        class="agentdown-draft-overlay__copy"
        @click="copyDiagnostics().catch(() => {})"
      >
        {{
          copyState === 'copied'
            ? '已复制'
            : copyState === 'failed'
              ? '复制失败'
              : '复制 JSON'
        }}
      </button>
    </header>

    <div
      v-if="open"
      class="agentdown-draft-overlay__panel"
    >
      <div class="agentdown-draft-overlay__stats">
        <span>总 block：{{ diagnosticsResult.summary.totalBlockCount }}</span>
        <span>draft：{{ diagnosticsResult.summary.draftBlockCount }}</span>
        <span>preview：{{ diagnosticsResult.summary.previewModeCount }}</span>
        <span>hidden：{{ diagnosticsResult.summary.hiddenModeCount }}</span>
      </div>

      <p
        v-if="visibleDiagnostics.length === 0"
        class="agentdown-draft-overlay__empty"
      >
        {{ emptyText }}
      </p>

      <ol
        v-else
        class="agentdown-draft-overlay__list"
      >
        <li
          v-for="diagnostic in visibleDiagnostics"
          :key="diagnostic.blockId"
          class="agentdown-draft-overlay__item"
        >
          <div class="agentdown-draft-overlay__item-head">
            <strong>{{ diagnostic.reason.title }}</strong>
            <span>{{ formatTimestamp(diagnostic.updatedAt) }}</span>
          </div>

          <p class="agentdown-draft-overlay__item-desc">
            {{ diagnostic.reason.description }}
          </p>

          <div class="agentdown-draft-overlay__chips">
            <span>data-draft-mode={{ diagnostic.domAttributes['data-draft-mode'] }}</span>
            <span v-if="diagnostic.domAttributes['data-draft-kind']">
              data-draft-kind={{ diagnostic.domAttributes['data-draft-kind'] }}
            </span>
            <span v-if="diagnostic.domAttributes['data-draft-stability']">
              data-draft-stability={{ diagnostic.domAttributes['data-draft-stability'] }}
            </span>
            <span v-if="diagnostic.domAttributes['data-draft-multiline']">
              data-draft-multiline={{ diagnostic.domAttributes['data-draft-multiline'] }}
            </span>
          </div>

          <dl class="agentdown-draft-overlay__meta">
            <div>
              <dt>renderer</dt>
              <dd>{{ diagnostic.renderer }}</dd>
            </div>
            <div>
              <dt>blockId</dt>
              <dd>{{ diagnostic.blockId }}</dd>
            </div>
            <div v-if="diagnostic.nodeId">
              <dt>node</dt>
              <dd>{{ diagnostic.nodeTitle ?? diagnostic.nodeId }}</dd>
            </div>
            <div v-if="diagnostic.nodeStatus">
              <dt>status</dt>
              <dd>{{ diagnostic.nodeStatus }}</dd>
            </div>
            <div>
              <dt>kind</dt>
              <dd>{{ diagnostic.draftKindLabel }}</dd>
            </div>
            <div>
              <dt>stability</dt>
              <dd>{{ diagnostic.draftStabilityLabel }}</dd>
            </div>
          </dl>

          <pre class="agentdown-draft-overlay__preview">{{ diagnostic.contentPreview }}</pre>
        </li>
      </ol>

      <p
        v-if="hiddenDiagnosticsCount > 0"
        class="agentdown-draft-overlay__more"
      >
        还有 {{ hiddenDiagnosticsCount }} 条较早的 draft 未展开。
      </p>
    </div>
  </aside>
</template>

<style scoped>
.agentdown-draft-overlay {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  width: min(360px, calc(100vw - 24px));
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
}

.agentdown-draft-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px;
}

.agentdown-draft-overlay__toggle,
.agentdown-draft-overlay__copy {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}

.agentdown-draft-overlay__toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.agentdown-draft-overlay__toggle strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.agentdown-draft-overlay__copy {
  border-radius: 999px;
  padding: 6px 10px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  cursor: pointer;
}

.agentdown-draft-overlay__panel {
  border-top: 1px solid rgba(226, 232, 240, 0.92);
  padding: 0 12px 12px;
}

.agentdown-draft-overlay__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding-top: 12px;
  color: #64748b;
  font-size: 12px;
}

.agentdown-draft-overlay__empty,
.agentdown-draft-overlay__more {
  margin: 12px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.7;
}

.agentdown-draft-overlay__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.agentdown-draft-overlay__item {
  border-radius: 14px;
  padding: 12px;
  background: #f8fafc;
}

.agentdown-draft-overlay__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agentdown-draft-overlay__item-head strong {
  font-size: 13px;
}

.agentdown-draft-overlay__item-head span {
  color: #64748b;
  font-size: 11px;
}

.agentdown-draft-overlay__item-desc {
  margin: 8px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.agentdown-draft-overlay__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.agentdown-draft-overlay__chips span {
  border-radius: 999px;
  padding: 4px 8px;
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
}

.agentdown-draft-overlay__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 10px 0 0;
}

.agentdown-draft-overlay__meta div {
  min-width: 0;
}

.agentdown-draft-overlay__meta dt {
  color: #94a3b8;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.agentdown-draft-overlay__meta dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: #334155;
  font-size: 11px;
  line-height: 1.5;
}

.agentdown-draft-overlay__preview {
  margin: 10px 0 0;
  border-radius: 12px;
  padding: 10px;
  overflow-x: auto;
  background: #ffffff;
  color: #0f172a;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .agentdown-draft-overlay {
    right: 12px;
    bottom: 12px;
    width: min(360px, calc(100vw - 24px));
  }
}
</style>
