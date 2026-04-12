<script setup lang="ts">
import { computed, type Component } from 'vue';

/**
 * 默认 tool renderer 的输入参数。
 */
interface Props {
  /** 工具显示名称。 */
  title?: string | undefined;
  /** 工具当前状态。 */
  status?: string | undefined;
  /** 自定义工具图标组件。 */
  icon?: Component | undefined;
  /** 自定义工具图标 path。 */
  iconPath?: string | undefined;
  /** 兼容透传的说明文案，默认内置样式不会展示。 */
  message?: string | undefined;
  /** 兼容透传的结果对象，默认内置样式不会展示。 */
  result?: unknown;
}

type ToolStatusTone = 'pending' | 'success' | 'danger' | 'warning' | 'muted';

interface ToolStatusMeta {
  label: string;
  tone: ToolStatusTone;
  running: boolean;
  visible: boolean;
  iconPath: string;
}

const props = defineProps<Props>();

/**
 * 统一收敛工具标题，避免空字符串时显示留白。
 */
const resolvedTitle = computed(() => props.title?.trim() || '工具调用');

/**
 * 把内部工具状态翻译成更适合默认 UI 的视觉语义。
 */
const statusMeta = computed<ToolStatusMeta>(() => {
  switch (props.status) {
    case 'done':
    case 'completed':
    case 'success':
      return {
        label: '已完成',
        tone: 'muted',
        running: false,
        visible: false,
        iconPath: 'M7.5 12.4l2.85 2.85L16.7 8.9'
      };
    case 'approved':
      return {
        label: '已完成',
        tone: 'muted',
        running: false,
        visible: false,
        iconPath: 'M7.5 12.4l2.85 2.85L16.7 8.9'
      };
    case 'rejected':
      return {
        label: '已拒绝',
        tone: 'danger',
        running: false,
        visible: true,
        iconPath: 'M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6'
      };
    case 'cancelled':
    case 'canceled':
      return {
        label: '已取消',
        tone: 'muted',
        running: false,
        visible: true,
        iconPath: 'M9.1 7.2v9.6M14.9 7.2v9.6'
      };
    case 'error':
    case 'failed':
      return {
        label: '失败',
        tone: 'danger',
        running: false,
        visible: true,
        iconPath: 'M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6'
      };
    case 'changes_requested':
      return {
        label: '待调整',
        tone: 'warning',
        running: false,
        visible: true,
        iconPath: 'M14.6 5.6l3.8 3.8M7.2 16.9l3.25-.7 7.25-7.25a1.55 1.55 0 0 0 0-2.2l-1.45-1.45a1.55 1.55 0 0 0-2.2 0l-7.25 7.25-.7 3.25Z'
      };
    case 'pending':
    case 'waiting':
    case 'running':
    default:
      return {
        label: '处理中',
        tone: 'pending',
        running: true,
        visible: false,
        iconPath: 'M12 4.2v3.15M12 16.65v3.15M19.8 12h-3.15M7.35 12H4.2M17.52 6.48l-2.22 2.22M8.7 15.3l-2.22 2.22M17.52 17.52l-2.22-2.22M8.7 8.7 6.48 6.48'
      };
  }
});

/**
 * 默认的小工具图标。
 */
const resolvedIconPath = computed(() => {
  return props.iconPath?.trim()
    || 'M14.7 6.2a2.7 2.7 0 0 1 3.82 3.82l-2.05 2.05-3.82-3.82 2.05-2.05Zm-3.35 3.35 3.82 3.82-4.94 4.94a2.25 2.25 0 0 1-1 .58l-3 .75.75-3c.1-.4.3-.73.58-1l4.94-4.94ZM5.3 7.8h4.1M4.8 11.9h2.9M4.3 16h1.8';
});
</script>

<template>
  <article
    class="agentdown-tool-renderer"
    :data-tone="statusMeta.tone"
    :data-running="statusMeta.running ? 'true' : 'false'"
    :aria-label="`${resolvedTitle} ${statusMeta.label}`"
  >
    <span
      class="agentdown-tool-renderer__icon-shell"
      aria-hidden="true"
    >
      <component
        :is="icon"
        v-if="icon"
        class="agentdown-tool-renderer__icon agentdown-tool-renderer__icon--custom"
      />

      <svg
        v-else
        class="agentdown-tool-renderer__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path :d="resolvedIconPath" />
      </svg>
    </span>

    <strong class="agentdown-tool-renderer__title">
      {{ resolvedTitle }}
    </strong>

    <span
      v-if="statusMeta.visible"
      class="agentdown-tool-renderer__status"
      :title="statusMeta.label"
      :aria-label="statusMeta.label"
    >
      <svg
        class="agentdown-tool-renderer__status-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="statusMeta.iconPath" />
      </svg>
    </span>
  </article>
</template>

<style scoped>
.agentdown-tool-renderer {
  --agentdown-tool-tone-bg: var(--agentdown-tool-status-pending-bg);
  --agentdown-tool-tone-color: var(--agentdown-tool-status-pending-color);
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 0.56rem;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 999px;
  padding: 0.38rem 0.72rem 0.38rem 0.48rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.74)),
    var(--agentdown-tool-surface-bg);
  box-shadow: inset 0 0 0 1px var(--agentdown-tool-surface-border-color);
}

.agentdown-tool-renderer::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: linear-gradient(
    112deg,
    transparent 18%,
    transparent 38%,
    var(--agentdown-tool-shimmer-color) 48%,
    transparent 58%,
    transparent 82%
  );
  opacity: 0;
  transform: translateX(-145%);
  pointer-events: none;
}

.agentdown-tool-renderer[data-running='true']::before {
  opacity: 0.72;
  animation: agentdown-tool-shimmer 2.65s ease-in-out infinite;
}

.agentdown-tool-renderer > * {
  position: relative;
  z-index: 1;
}

.agentdown-tool-renderer[data-tone='success'] {
  --agentdown-tool-tone-bg: var(--agentdown-tool-status-success-bg);
  --agentdown-tool-tone-color: var(--agentdown-tool-status-success-color);
}

.agentdown-tool-renderer[data-tone='danger'] {
  --agentdown-tool-tone-bg: var(--agentdown-tool-status-danger-bg);
  --agentdown-tool-tone-color: var(--agentdown-tool-status-danger-color);
}

.agentdown-tool-renderer[data-tone='warning'] {
  --agentdown-tool-tone-bg: rgba(196, 163, 96, 0.14);
  --agentdown-tool-tone-color: #8c6f39;
}

.agentdown-tool-renderer[data-tone='muted'] {
  --agentdown-tool-tone-bg: rgba(148, 163, 184, 0.12);
  --agentdown-tool-tone-color: #7a8899;
}

.agentdown-tool-renderer__icon-shell {
  position: relative;
  display: inline-flex;
  width: 1.68rem;
  height: 1.68rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--agentdown-tool-tone-bg);
  color: var(--agentdown-tool-tone-color);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82);
  transform-origin: center;
}

.agentdown-tool-renderer__icon-shell::after {
  content: '';
  position: absolute;
  inset: -0.16rem;
  border-radius: inherit;
  border: 1px solid rgba(255, 255, 255, 0.62);
  opacity: 0;
  transform: scale(0.9);
}

.agentdown-tool-renderer[data-running='true'] .agentdown-tool-renderer__icon-shell {
  animation: agentdown-tool-breathe 1.9s ease-in-out infinite;
}

.agentdown-tool-renderer[data-running='true'] .agentdown-tool-renderer__icon-shell::after {
  animation: agentdown-tool-pulse 1.9s ease-out infinite;
}

.agentdown-tool-renderer__icon {
  width: 0.84rem;
  height: 0.84rem;
  flex-shrink: 0;
}

.agentdown-tool-renderer__title {
  min-width: 0;
  overflow: hidden;
  color: var(--agentdown-tool-title-color);
  font-size: 0.84rem;
  font-weight: 520;
  letter-spacing: -0.015em;
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-tool-renderer__status {
  display: inline-flex;
  width: 1.12rem;
  height: 1.12rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: var(--agentdown-tool-tone-color);
  opacity: 0.88;
}

.agentdown-tool-renderer__status-icon {
  width: 0.8rem;
  height: 0.8rem;
  flex-shrink: 0;
}

@keyframes agentdown-tool-shimmer {
  0% {
    transform: translateX(-145%);
  }

  55% {
    transform: translateX(38%);
  }

  100% {
    transform: translateX(145%);
  }
}

@keyframes agentdown-tool-breathe {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.04);
  }
}

@keyframes agentdown-tool-pulse {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }

  30% {
    opacity: 0.55;
  }

  100% {
    opacity: 0;
    transform: scale(1.18);
  }
}

</style>
