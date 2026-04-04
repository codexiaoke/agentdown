<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  status?: string;
  result?: Record<string, unknown>;
}>();

const summary = computed(() => {
  const result = props.result;

  return {
    fileName: typeof result?.fileName === 'string' ? result.fileName : '未命名文件',
    pageCount: typeof result?.pageCount === 'number' ? result.pageCount : null,
    highlights: Array.isArray(result?.highlights)
      ? result.highlights.filter((item): item is string => typeof item === 'string')
      : []
  };
});

const isDone = computed(() => props.status === 'done');
</script>

<template>
  <article class="file-summary-card">
    <div class="file-summary-card__header">
      <div>
        <strong>{{ title }}</strong>
        <p>{{ summary.fileName }}</p>
      </div>

      <span>{{ isDone ? '已完成' : '解析中' }}</span>
    </div>

    <div
      v-if="isDone"
      class="file-summary-card__body"
    >
      <p v-if="summary.pageCount !== null">
        共 {{ summary.pageCount }} 页
      </p>

      <ul
        v-if="summary.highlights.length > 0"
        class="file-summary-card__list"
      >
        <li
          v-for="highlight in summary.highlights"
          :key="highlight"
        >
          {{ highlight }}
        </li>
      </ul>
    </div>

    <div
      v-else
      class="file-summary-card__loading"
    >
      <span class="file-summary-card__dot" />
      <span class="file-summary-card__dot" />
      <span class="file-summary-card__dot" />
    </div>
  </article>
</template>

<style scoped>
.file-summary-card {
  width: min(100%, 540px);
  border: 1px solid rgba(191, 219, 254, 0.88);
  border-radius: 18px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #ffffff, #f7fbff);
}

.file-summary-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.file-summary-card__header strong {
  display: block;
  font-size: 15px;
}

.file-summary-card__header p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
}

.file-summary-card__header span {
  border-radius: 999px;
  padding: 4px 10px;
  background: #e0ecff;
  color: #1d4ed8;
  font-size: 12px;
}

.file-summary-card__body {
  margin-top: 14px;
}

.file-summary-card__body p {
  margin: 0;
  color: #334155;
  font-size: 13px;
}

.file-summary-card__list {
  margin: 10px 0 0;
  padding-left: 18px;
  color: #0f172a;
}

.file-summary-card__list li + li {
  margin-top: 8px;
}

.file-summary-card__loading {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.file-summary-card__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #93c5fd;
  animation: file-summary-pulse 1s ease-in-out infinite;
}

.file-summary-card__dot:nth-child(2) {
  animation-delay: 0.12s;
}

.file-summary-card__dot:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes file-summary-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .file-summary-card__dot {
    animation: none;
  }
}
</style>
