<script setup lang="ts">
import { computed } from 'vue';
import { useAguiChildren, useAguiEvents, useAguiState, type AgentNodeState } from '../../index';

const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();

const latestEventLabel = computed(() => events.value.at(-1)?.type ?? 'no event');
</script>

<template>
  <section class="demo-run-board">
    <div class="demo-run-board__header">
      <strong>{{ state?.title ?? 'AGUI Component' }}</strong>
      <span>{{ state?.status ?? 'idle' }}</span>
    </div>

    <p class="demo-run-board__message">
      {{ state?.message ?? '通过 :::vue-component + ref 直接绑定 runtime 节点。' }}
    </p>

    <div class="demo-run-board__metrics">
      <div class="demo-run-board__metric">
        <strong>{{ state?.kind ?? 'run' }}</strong>
        <span>kind</span>
      </div>

      <div class="demo-run-board__metric">
        <strong>{{ children.length }}</strong>
        <span>children</span>
      </div>

      <div class="demo-run-board__metric">
        <strong>{{ events.length }}</strong>
        <span>events</span>
      </div>
    </div>

    <div class="demo-run-board__latest">
      latest: <code>{{ latestEventLabel }}</code>
    </div>

    <ul
      v-if="children.length > 0"
      class="demo-run-board__list"
    >
      <li
        v-for="item in children"
        :key="item.id"
        class="demo-run-board__item"
      >
        <strong>{{ item.title }}</strong>
        <span>{{ item.status }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.demo-run-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  background: #ffffff;
}

.demo-run-board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.demo-run-board__header strong {
  font-size: 15px;
}

.demo-run-board__header span {
  border-radius: 999px;
  padding: 4px 10px;
  background: #f3f4f6;
  color: #4b5563;
  font-size: 12px;
}

.demo-run-board__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.demo-run-board__metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  border-radius: 12px;
  padding: 10px;
  background: #f8fafc;
}

.demo-run-board__metric strong {
  color: #0f172a;
  font-size: 14px;
}

.demo-run-board__metric span {
  color: #6b7280;
  font-size: 12px;
}

.demo-run-board__message,
.demo-run-board__latest {
  margin: 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.7;
}

.demo-run-board__latest code {
  font-size: 12px;
}

.demo-run-board__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.demo-run-board__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  font-size: 13px;
}
</style>
