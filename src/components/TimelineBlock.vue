<script setup lang="ts">
interface Props {
  title: string;
  limit: number;
  emptyText?: string;
  refId?: string;
}

defineProps<Props>();
</script>

<template>
  <section class="agentdown-timeline-block">
    <div class="agentdown-timeline-head">
      <span class="agentdown-timeline-eyebrow">Timeline</span>
      <strong>{{ title }}</strong>
    </div>

    <p class="agentdown-timeline-empty">
      {{ emptyText ?? 'Timeline blocks are now intended to be driven by RunSurface and runtime history.' }}
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

.agentdown-timeline-empty {
  margin: 0;
  color: var(--agentdown-muted-color);
  line-height: 1.7;
}
</style>
