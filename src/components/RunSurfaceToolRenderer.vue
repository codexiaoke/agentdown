<script setup lang="ts">
import { computed } from 'vue';

/**
 * 默认 tool renderer 的输入参数。
 */
interface Props {
  /** 工具显示名称。 */
  title?: string | undefined;
  /** 工具当前状态。 */
  status?: string | undefined;
  /** 兼容透传的说明文案，默认内置样式不会展示。 */
  message?: string | undefined;
  /** 兼容透传的结果对象，默认内置样式不会展示。 */
  result?: unknown;
}

const props = defineProps<Props>();

/**
 * 把内部工具状态收敛成三种面向用户的状态文案。
 */
const statusLabel = computed(() => {
  switch (props.status) {
    case 'done':
    case 'completed':
    case 'success':
      return '调用成功';
    case 'error':
    case 'failed':
    case 'rejected':
    case 'cancelled':
    case 'canceled':
      return '调用失败';
    case 'pending':
    case 'waiting':
    case 'running':
    default:
      return '调用中';
  }
});

/**
 * 给三种状态分配轻量视觉语义。
 */
const statusTone = computed(() => {
  switch (statusLabel.value) {
    case '调用成功':
      return 'success';
    case '调用失败':
      return 'danger';
    default:
      return 'pending';
  }
});
</script>

<template>
  <article class="agentdown-tool-renderer">
    <strong class="agentdown-tool-renderer__title">
      {{ title || '工具调用' }}
    </strong>

    <span
      class="agentdown-tool-renderer__status"
      :data-tone="statusTone"
    >
      {{ statusLabel }}
    </span>
  </article>
</template>

<style scoped>
.agentdown-tool-renderer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 0;
}

.agentdown-tool-renderer__title {
  min-width: 0;
  color: var(--agentdown-tool-title-color);
  font-size: 0.93rem;
  font-weight: 500;
  line-height: 1.5;
}

.agentdown-tool-renderer__status {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.18rem 0.56rem;
  background: var(--agentdown-tool-status-pending-bg);
  color: var(--agentdown-tool-status-pending-color);
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1;
}

.agentdown-tool-renderer__status[data-tone='pending'] {
  background: var(--agentdown-tool-status-pending-bg);
  color: var(--agentdown-tool-status-pending-color);
}

.agentdown-tool-renderer__status[data-tone='success'] {
  background: var(--agentdown-tool-status-success-bg);
  color: var(--agentdown-tool-status-success-color);
}

.agentdown-tool-renderer__status[data-tone='danger'] {
  background: var(--agentdown-tool-status-danger-bg);
  color: var(--agentdown-tool-status-danger-color);
}
</style>
