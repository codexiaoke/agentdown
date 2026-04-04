<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{
  title: string;
  status?: string;
  result?: Record<string, unknown>;
}>();

const weather = computed(() => {
  const result = props.result;

  return {
    city: typeof result?.city === 'string' ? result.city : '北京',
    condition: typeof result?.condition === 'string' ? result.condition : '--',
    tempC: typeof result?.tempC === 'number' ? result.tempC : null,
    humidity: typeof result?.humidity === 'string' ? result.humidity : '--'
  };
});

const isDone = computed(() => props.status === 'done');
</script>

<template>
  <article class="weather-tool-card">
    <div class="weather-tool-card__header">
      <div>
        <strong>{{ weather.city }}</strong>
        <p>{{ title }}</p>
      </div>

      <span>{{ isDone ? '已返回' : '查询中' }}</span>
    </div>

    <div
      v-if="isDone"
      class="weather-tool-card__body"
    >
      <div class="weather-tool-card__temp">
        {{ weather.tempC }}°C
      </div>

      <div class="weather-tool-card__meta">
        <span>{{ weather.condition }}</span>
        <span>湿度 {{ weather.humidity }}</span>
      </div>
    </div>

    <div
      v-else
      class="weather-tool-card__loading"
    >
      <span class="weather-tool-card__dot" />
      <span class="weather-tool-card__dot" />
      <span class="weather-tool-card__dot" />
    </div>
  </article>
</template>

<style scoped>
.weather-tool-card {
  width: min(100%, 520px);
  border: 1px solid rgba(147, 197, 253, 0.58);
  border-radius: 18px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #f8fbff, #eef6ff);
}

.weather-tool-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.weather-tool-card__header strong {
  display: block;
  font-size: 16px;
}

.weather-tool-card__header p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
}

.weather-tool-card__header span {
  border-radius: 999px;
  padding: 4px 10px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.weather-tool-card__body {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}

.weather-tool-card__temp {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.06em;
}

.weather-tool-card__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #475569;
  font-size: 13px;
  text-align: right;
}

.weather-tool-card__loading {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.weather-tool-card__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #93c5fd;
  animation: weather-pulse 1s ease-in-out infinite;
}

.weather-tool-card__dot:nth-child(2) {
  animation-delay: 0.12s;
}

.weather-tool-card__dot:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes weather-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .weather-tool-card__dot {
    animation: none;
  }
}
</style>
