<script setup lang="ts">
/**
 * `ErrorBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message: string;
  code?: string;
  refId?: string;
}

defineProps<Props>();
</script>

<template>
  <section class="agentdown-error-block">
    <div class="agentdown-error-block__head">
      <span class="agentdown-error-block__eyebrow">Error</span>
      <strong>{{ title }}</strong>
    </div>

    <p class="agentdown-error-block__message">
      {{ message }}
    </p>

    <div
      v-if="code || refId"
      class="agentdown-error-block__meta"
    >
      <span v-if="code">Code: {{ code }}</span>
      <span v-if="refId">Ref: {{ refId }}</span>
    </div>
  </section>
</template>

<style scoped>
.agentdown-error-block {
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  border-radius: calc(var(--agentdown-radius) + 2px);
  padding: 0.95rem 1rem;
  background:
    linear-gradient(180deg, rgba(254, 242, 242, 0.92), rgba(255, 255, 255, 0.98)),
    var(--agentdown-elevated-surface);
  box-shadow:
    inset 0 0 0 1px rgba(248, 113, 113, 0.24),
    0 12px 28px rgba(148, 24, 24, 0.08);
}

.agentdown-error-block__head {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.agentdown-error-block__head strong {
  color: #991b1b;
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-error-block__eyebrow {
  color: #b91c1c;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-error-block__message,
.agentdown-error-block__meta {
  margin: 0;
  color: #7f1d1d;
}

.agentdown-error-block__message {
  line-height: 1.7;
}

.agentdown-error-block__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.8rem;
  font-family:
    'SFMono-Regular',
    'JetBrains Mono',
    'Fira Code',
    'Menlo',
    monospace;
}
</style>
