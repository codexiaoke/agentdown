<script setup lang="ts">
import { computed } from 'vue';

/**
 * `BranchBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message?: string;
  branchId?: string;
  sourceRunId?: string;
  targetRunId?: string;
  status?: string;
  label?: string;
  refId?: string;
}

const props = defineProps<Props>();

/**
 * 收敛 branch 状态标签，缺省时回退到“pending”。
 */
const resolvedStatus = computed(() => props.status ?? 'pending');
</script>

<template>
  <section
    class="agentdown-branch-block"
    :data-status="resolvedStatus"
  >
    <div class="agentdown-branch-head">
      <div class="agentdown-branch-copy">
        <span class="agentdown-branch-eyebrow">Branch</span>
        <strong>{{ title }}</strong>
      </div>

      <span class="agentdown-branch-badge">{{ resolvedStatus }}</span>
    </div>

    <p
      v-if="message"
      class="agentdown-branch-message"
    >
      {{ message }}
    </p>

    <dl class="agentdown-branch-meta">
      <div v-if="label">
        <dt>Label</dt>
        <dd>{{ label }}</dd>
      </div>

      <div v-if="branchId">
        <dt>Branch</dt>
        <dd>{{ branchId }}</dd>
      </div>

      <div v-if="sourceRunId">
        <dt>From</dt>
        <dd>{{ sourceRunId }}</dd>
      </div>

      <div v-if="targetRunId">
        <dt>To</dt>
        <dd>{{ targetRunId }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.agentdown-branch-block {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--agentdown-border-color);
  border-radius: calc(var(--agentdown-radius) + 2px);
  padding: 1rem 1.05rem;
  background:
    radial-gradient(circle at top right, rgba(16, 185, 129, 0.08), transparent 34%),
    var(--agentdown-elevated-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-branch-head,
.agentdown-branch-meta,
.agentdown-branch-meta div {
  display: flex;
  align-items: center;
}

.agentdown-branch-head {
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-branch-copy {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.agentdown-branch-copy strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-branch-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-branch-badge {
  border-radius: 999px;
  padding: 0.3rem 0.66rem;
  background: rgba(16, 185, 129, 0.1);
  color: #047857;
  font-size: 0.79rem;
  font-weight: 600;
  text-transform: capitalize;
}

.agentdown-branch-message {
  margin: 0;
  color: var(--agentdown-text-color);
  line-height: 1.7;
}

.agentdown-branch-meta {
  flex-wrap: wrap;
  gap: 0.9rem;
}

.agentdown-branch-meta div {
  gap: 0.42rem;
}

.agentdown-branch-meta dt {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-branch-meta dd {
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
