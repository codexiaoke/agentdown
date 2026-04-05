<script setup lang="ts">
import { computed } from 'vue';

/**
 * 默认 tool renderer 的输入参数。
 */
interface Props {
  title?: string;
  status?: string;
  message?: string;
  result?: unknown;
}

const props = defineProps<Props>();

/**
 * 把内部状态值映射成更适合用户阅读的标签。
 */
const statusLabel = computed(() => {
  switch (props.status) {
    case 'done':
    case 'completed':
    case 'success':
      return '已完成';
    case 'error':
    case 'failed':
      return '失败';
    case 'pending':
    case 'waiting':
      return '等待中';
    default:
      return '运行中';
  }
});

/**
 * 生成工具结果的紧凑文本预览。
 */
const resultPreview = computed(() => {
  if (props.result === undefined || props.result === null) {
    return '';
  }

  if (typeof props.result === 'string') {
    return props.result;
  }

  try {
    const serialized = JSON.stringify(props.result, null, 2);
    return serialized.length > 720
      ? `${serialized.slice(0, 720)}\n...`
      : serialized;
  } catch {
    return String(props.result);
  }
});
</script>

<template>
  <article class="agentdown-tool-renderer">
    <header class="agentdown-tool-renderer__header">
      <div class="agentdown-tool-renderer__title-wrap">
        <strong class="agentdown-tool-renderer__title">
          {{ title || '工具调用' }}
        </strong>

        <p
          v-if="message"
          class="agentdown-tool-renderer__message"
        >
          {{ message }}
        </p>
      </div>

      <span class="agentdown-tool-renderer__status">
        {{ statusLabel }}
      </span>
    </header>

    <pre
      v-if="resultPreview"
      class="agentdown-tool-renderer__result"
    >{{ resultPreview }}</pre>
  </article>
</template>

<style scoped>
.agentdown-tool-renderer {
  width: min(100%, 560px);
  border: 1px solid var(--agentdown-border-color);
  border-radius: 16px;
  padding: 14px 15px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}

.agentdown-tool-renderer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agentdown-tool-renderer__title-wrap {
  min-width: 0;
}

.agentdown-tool-renderer__title {
  display: block;
  color: #0f172a;
  font-size: 0.96rem;
  line-height: 1.35;
}

.agentdown-tool-renderer__message {
  margin: 0.32rem 0 0;
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.6;
}

.agentdown-tool-renderer__status {
  flex-shrink: 0;
  border: 1px solid #dbe4ee;
  border-radius: 999px;
  padding: 0.24rem 0.58rem;
  background: #f8fafc;
  color: #475569;
  font-size: 0.75rem;
  line-height: 1;
}

.agentdown-tool-renderer__result {
  overflow: auto;
  margin: 0.85rem 0 0;
  border: 1px solid var(--agentdown-border-soft);
  border-radius: 12px;
  padding: 0.8rem 0.9rem;
  background: #f8fafc;
  color: #0f172a;
  font-family:
    "SFMono-Regular",
    "JetBrains Mono",
    "Fira Code",
    "Menlo",
    monospace;
  font-size: 0.8rem;
  line-height: 1.58;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
