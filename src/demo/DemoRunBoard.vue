<script setup lang="ts">
import { computed } from 'vue';
import {
  useAguiChildren,
  useAguiEvents,
  useAguiNodeId,
  useAguiRuntime,
  useAguiState,
  type AgentNodeState
} from '../index';

const id = useAguiNodeId();
const runtime = useAguiRuntime();
const state = useAguiState<AgentNodeState>();
const directChildren = useAguiChildren<AgentNodeState>();
const events = useAguiEvents();
const globalEvents = computed(() => runtime?.events().value ?? events.value);

function collectDescendants(parentId: string, visited = new Set<string>()): AgentNodeState[] {
  if (!runtime || visited.has(parentId)) {
    return [];
  }

  visited.add(parentId);

  const children = runtime.children<AgentNodeState>(parentId).value;

  return children.flatMap((child) => [child, ...collectDescendants(child.id, visited)]);
}

const network = computed(() => {
  const nodeId = state.value?.id ?? id.value;

  if (!nodeId) {
    return [];
  }

  return collectDescendants(nodeId);
});

const doneCount = computed(() => network.value.filter((node) => node.status === 'done').length);
const activeCount = computed(() =>
  network.value.filter(
    (node) =>
      node.status === 'running' ||
      node.status === 'thinking' ||
      node.status === 'assigned' ||
      node.status === 'waiting_tool'
  ).length
);
const latestEvent = computed(() => globalEvents.value.at(-1)?.type ?? 'waiting');
const waitingCount = computed(() => network.value.filter((node) => node.status === 'idle').length);
</script>

<template>
  <section
    class="demo-run-board"
    :data-status="state?.status ?? 'idle'"
  >
    <div class="demo-run-top">
      <div>
        <span class="demo-run-label">Reactive run</span>
        <strong>{{ state?.title ?? id ?? 'Unknown run' }}</strong>
        <p>{{ state?.message ?? 'Waiting for runtime events.' }}</p>
      </div>
      <span class="demo-run-status">{{ state?.status ?? 'idle' }}</span>
    </div>

    <div class="demo-run-metrics">
      <div>
        <span>Direct refs</span>
        <strong>{{ directChildren.length }}</strong>
      </div>
      <div>
        <span>Active</span>
        <strong>{{ activeCount }}</strong>
      </div>
      <div>
        <span>Done</span>
        <strong>{{ doneCount }}</strong>
      </div>
      <div>
        <span>Idle</span>
        <strong>{{ waitingCount }}</strong>
      </div>
    </div>

    <div class="demo-run-children">
      <div
        v-for="child in network"
        :key="child.id"
        class="demo-run-child"
      >
        <span>{{ child.title }}</span>
        <span>{{ child.kind }} · {{ child.status }}</span>
      </div>
    </div>

    <div class="demo-run-footer">
      <span>Latest signal</span>
      <strong>{{ latestEvent }}</strong>
    </div>
  </section>
</template>

<style scoped>
.demo-run-board {
  display: grid;
  gap: 16px;
  padding: 4px;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.demo-run-board[data-status='running'],
.demo-run-board[data-status='done'] {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(247, 250, 252, 0.98));
}

.demo-run-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.demo-run-label {
  display: inline-flex;
  margin-bottom: 8px;
  color: #6b7280;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.demo-run-top strong {
  display: block;
  font-size: 19px;
  letter-spacing: -0.03em;
}

.demo-run-top p {
  margin: 8px 0 0;
  color: #4b5563;
  line-height: 1.7;
}

.demo-run-status {
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

.demo-run-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.demo-run-metrics > div,
.demo-run-child {
  padding: 12px 14px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.demo-run-metrics span,
.demo-run-child span:first-child {
  display: block;
  color: #6b7280;
  font-size: 12px;
}

.demo-run-metrics strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
}

.demo-run-children {
  display: grid;
  gap: 10px;
}

.demo-run-child {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.demo-run-child span:last-child {
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  text-transform: capitalize;
}

.demo-run-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid #eef0f2;
  color: #6b7280;
  font-size: 12px;
}

.demo-run-footer strong {
  color: #111827;
  font-size: 13px;
}

@media (max-width: 720px) {
  .demo-run-top,
  .demo-run-child,
  .demo-run-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .demo-run-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
