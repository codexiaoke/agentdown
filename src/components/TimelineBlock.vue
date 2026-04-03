<script setup lang="ts">
import { computed, inject } from 'vue';
import { AGUI_RUNTIME_KEY } from '../core/aguiRuntime';
import type { AguiRuntimeEvent } from '../core/types';

interface Props {
  title: string;
  limit: number;
  emptyText?: string;
  refId?: string;
}

const props = defineProps<Props>();
const runtime = inject(AGUI_RUNTIME_KEY, null);

function formatEventType(type: string): string {
  switch (type) {
    case 'run.started':
      return 'Run started';
    case 'run.finished':
      return 'Run finished';
    case 'user.message.created':
      return 'User message';
    case 'agent.assigned':
      return 'Agent assigned';
    case 'agent.started':
      return 'Agent started';
    case 'agent.thinking':
      return 'Agent thinking';
    case 'agent.blocked':
      return 'Agent blocked';
    case 'agent.finished':
      return 'Agent finished';
    case 'team.finished':
      return 'Team finished';
    case 'tool.started':
      return 'Tool started';
    case 'tool.finished':
      return 'Tool finished';
    case 'artifact.created':
      return 'Artifact created';
    case 'approval.requested':
      return 'Approval requested';
    case 'approval.resolved':
      return 'Approval resolved';
    case 'handoff.created':
      return 'Handoff created';
    case 'node.error':
      return 'Node error';
    default:
      return type;
  }
}

function formatEventTime(at?: number): string {
  if (!at) {
    return '--:--:--';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(at));
}

function summarizeEvent(event: AguiRuntimeEvent): string {
  return event.message ?? event.title ?? event.toolName ?? event.nodeId;
}

const eventStream = computed(() => {
  if (!runtime) {
    return [] as AguiRuntimeEvent[];
  }

  return props.refId ? runtime.events(props.refId).value : runtime.events().value;
});

const rows = computed(() =>
  [...eventStream.value]
    .slice(-Math.max(props.limit, 1))
    .reverse()
    .map(event => ({
      id: `${event.type}-${event.nodeId}-${event.at ?? 0}`,
      label: formatEventType(event.type),
      summary: summarizeEvent(event),
      nodeId: event.nodeId,
      time: formatEventTime(event.at)
    }))
);
</script>

<template>
  <section class="agentdown-timeline-block">
    <div class="agentdown-timeline-head">
      <span class="agentdown-timeline-eyebrow">Timeline</span>
      <strong>{{ title }}</strong>
    </div>

    <ol
      v-if="rows.length > 0"
      class="agentdown-timeline-list"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="agentdown-timeline-item"
      >
        <div class="agentdown-timeline-item-top">
          <span class="agentdown-timeline-item-label">{{ row.label }}</span>
          <time class="agentdown-timeline-item-time">{{ row.time }}</time>
        </div>
        <div class="agentdown-timeline-item-summary">{{ row.summary }}</div>
        <div class="agentdown-timeline-item-node">{{ row.nodeId }}</div>
      </li>
    </ol>

    <p
      v-else
      class="agentdown-timeline-empty"
    >
      {{ emptyText ?? 'No events yet.' }}
    </p>
  </section>
</template>

<style scoped>
.agentdown-timeline-block {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
  border: 1px solid var(--agentdown-border-color);
  border-radius: calc(var(--agentdown-radius) + 2px);
  padding: 1rem 1.05rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)),
    var(--agentdown-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-timeline-head {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.agentdown-timeline-head strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-timeline-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-timeline-list {
  display: flex;
  flex-direction: column;
  gap: 0.78rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.agentdown-timeline-item {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  padding: 0.82rem 0.86rem;
  border: 1px solid var(--agentdown-border-soft);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
}

.agentdown-timeline-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-timeline-item-label {
  color: var(--agentdown-text-color);
  font-size: 0.92rem;
  font-weight: 600;
}

.agentdown-timeline-item-time,
.agentdown-timeline-item-node {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-timeline-item-summary {
  color: var(--agentdown-text-color);
  font-size: 0.88rem;
  line-height: 1.65;
}

.agentdown-timeline-empty {
  margin: 0;
  color: var(--agentdown-muted-color);
  line-height: 1.7;
}
</style>
