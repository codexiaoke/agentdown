<script setup lang="ts">
import { computed, inject } from 'vue';
import { AGUI_RUNTIME_KEY } from '../core/aguiRuntime';
import type { AguiRuntimeEvent, MarkdownApprovalStatus } from '../core/types';

interface Props {
  title: string;
  message?: string;
  approvalId?: string;
  status?: MarkdownApprovalStatus;
  refId?: string;
}

const props = defineProps<Props>();
const runtime = inject(AGUI_RUNTIME_KEY, null);

type ApprovalEvent = AguiRuntimeEvent & {
  approvalId?: string;
  decision?: MarkdownApprovalStatus;
};

const binding = computed(() => (props.refId && runtime ? runtime.binding(props.refId) : null));
const state = computed(() => binding.value?.stateRef.value as { title?: string; message?: string; meta?: Record<string, unknown> } | null);
const events = computed(() => binding.value?.eventsRef.value ?? []);

function readStateMeta(key: string): string | undefined {
  const value = state.value?.meta?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const latestApprovalEvent = computed<ApprovalEvent | undefined>(() =>
  [...events.value]
    .reverse()
    .find(event => event.type === 'approval.resolved' || event.type === 'approval.requested') as ApprovalEvent | undefined
);

const resolvedTitle = computed(() => state.value?.title ?? props.title);
const resolvedMessage = computed(() => state.value?.message ?? latestApprovalEvent.value?.message ?? props.message);
const resolvedApprovalId = computed(() => latestApprovalEvent.value?.approvalId ?? readStateMeta('approvalId') ?? props.approvalId);
const resolvedStatus = computed<MarkdownApprovalStatus>(() => {
  if (latestApprovalEvent.value?.type === 'approval.resolved') {
    return latestApprovalEvent.value.decision ?? 'approved';
  }

  if (latestApprovalEvent.value?.type === 'approval.requested') {
    return 'pending';
  }

  const stateDecision = readStateMeta('decision');

  if (stateDecision === 'approved' || stateDecision === 'rejected' || stateDecision === 'changes_requested') {
    return stateDecision;
  }

  return props.status ?? 'pending';
});

const statusLabel = computed(() => {
  switch (resolvedStatus.value) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'changes_requested':
      return 'Changes Requested';
    default:
      return 'Pending';
  }
});
</script>

<template>
  <section
    class="agentdown-approval-block"
    :data-status="resolvedStatus"
  >
    <div class="agentdown-approval-head">
      <div class="agentdown-approval-copy">
        <span class="agentdown-approval-eyebrow">Approval</span>
        <strong>{{ resolvedTitle }}</strong>
      </div>
      <span class="agentdown-approval-badge">{{ statusLabel }}</span>
    </div>

    <p
      v-if="resolvedMessage"
      class="agentdown-approval-message"
    >
      {{ resolvedMessage }}
    </p>

    <dl
      v-if="resolvedApprovalId || refId"
      class="agentdown-approval-meta"
    >
      <div v-if="resolvedApprovalId">
        <dt>ID</dt>
        <dd>{{ resolvedApprovalId }}</dd>
      </div>

      <div v-if="refId">
        <dt>Ref</dt>
        <dd>{{ refId }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.agentdown-approval-block {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  border: 1px solid var(--agentdown-border-color);
  border-radius: calc(var(--agentdown-radius) + 2px);
  padding: 1rem 1.05rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98)),
    var(--agentdown-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-approval-block[data-status='approved'] {
  border-color: rgba(5, 150, 105, 0.22);
}

.agentdown-approval-block[data-status='rejected'] {
  border-color: rgba(220, 38, 38, 0.22);
}

.agentdown-approval-block[data-status='changes_requested'] {
  border-color: rgba(217, 119, 6, 0.22);
}

.agentdown-approval-head,
.agentdown-approval-meta,
.agentdown-approval-meta div {
  display: flex;
  align-items: center;
}

.agentdown-approval-head {
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-approval-copy {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.agentdown-approval-copy strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-approval-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-approval-badge {
  border-radius: 999px;
  padding: 0.32rem 0.68rem;
  background: rgba(59, 130, 246, 0.08);
  color: #1d4ed8;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.agentdown-approval-block[data-status='approved'] .agentdown-approval-badge {
  background: rgba(5, 150, 105, 0.12);
  color: #047857;
}

.agentdown-approval-block[data-status='rejected'] .agentdown-approval-badge {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.agentdown-approval-block[data-status='changes_requested'] .agentdown-approval-badge {
  background: rgba(217, 119, 6, 0.12);
  color: #b45309;
}

.agentdown-approval-message {
  margin: 0;
  color: var(--agentdown-text-color);
  line-height: 1.7;
}

.agentdown-approval-meta {
  flex-wrap: wrap;
  gap: 0.9rem;
}

.agentdown-approval-meta div {
  gap: 0.42rem;
  min-width: 0;
}

.agentdown-approval-meta dt {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-approval-meta dd {
  margin: 0;
  color: var(--agentdown-text-color);
  font-family:
    'SFMono-Regular',
    'JetBrains Mono',
    'Fira Code',
    'Menlo',
    monospace;
  font-size: 0.82rem;
}
</style>
