<script setup lang="ts">
import { computed } from 'vue';
import { useAguiChildren, useAguiEvents, useAguiNodeId, useAguiState, type AgentNodeState } from '../index';

const id = useAguiNodeId();
const state = useAguiState<AgentNodeState>();
const children = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();
const latestEvent = computed(() => events.value.at(-1)?.type ?? 'waiting');
const nodeTone = computed(() => state.value?.status ?? 'idle');
</script>

<template>
  <section
    class="demo-node-card"
    :data-status="nodeTone"
  >
    <div class="demo-node-top">
      <div>
        <span class="demo-node-kind">{{ state?.kind ?? 'node' }}</span>
        <strong>{{ state?.title ?? id ?? 'Unknown node' }}</strong>
      </div>
      <span class="demo-node-status">{{ state?.status ?? 'idle' }}</span>
    </div>

    <p class="demo-node-message">
      {{ state?.message ?? 'Waiting for state updates.' }}
    </p>

    <div
      v-if="state?.toolName"
      class="demo-node-meta"
    >
      Tool: {{ state.toolName }}
    </div>

    <div
      v-if="children.length > 0"
      class="demo-node-children"
    >
      <span
        v-for="child in children"
        :key="child.id"
        class="demo-node-chip"
      >
        {{ child.title }} · {{ child.status }}
      </span>
    </div>

    <div class="demo-node-footer">
      <span>Latest event</span>
      <strong>{{ latestEvent }}</strong>
    </div>
  </section>
</template>

<style scoped>
.demo-node-card {
  display: grid;
  gap: 14px;
  padding: 4px;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.demo-node-card[data-status='thinking'],
.demo-node-card[data-status='running'] {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(245, 248, 250, 0.98));
}

.demo-node-card[data-status='waiting_tool'] {
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.82), rgba(255, 247, 237, 0.98));
}

.demo-node-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.demo-node-kind {
  display: inline-flex;
  margin-bottom: 8px;
  color: #6b7280;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.demo-node-top strong {
  display: block;
  font-size: 18px;
  letter-spacing: -0.03em;
}

.demo-node-status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: #eef2f7;
  color: #111827;
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.demo-node-message {
  margin: 0;
  color: #4b5563;
  line-height: 1.7;
}

.demo-node-meta {
  color: #111827;
  font-size: 13px;
  font-weight: 600;
}

.demo-node-children {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.demo-node-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 7px 10px;
  background: #f8fafc;
  color: #374151;
  border: 1px solid #e5e7eb;
  font-size: 12px;
  font-weight: 600;
}

.demo-node-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding-top: 4px;
  border-top: 1px solid #eef0f2;
  color: #6b7280;
  font-size: 12px;
}

.demo-node-footer strong {
  color: #111827;
  font-size: 13px;
}

@media (max-width: 720px) {
  .demo-node-top,
  .demo-node-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
