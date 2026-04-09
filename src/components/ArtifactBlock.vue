<script setup lang="ts">
import { computed } from 'vue';
import type { MarkdownArtifactKind } from '../core/types';

interface Props {
  title: string;
  message?: string;
  artifactId?: string;
  artifactKind: MarkdownArtifactKind;
  label?: string;
  href?: string;
  refId?: string;
}

const props = defineProps<Props>();
const resolvedTitle = computed(() => props.title);
const resolvedMessage = computed(() => props.message);
const resolvedArtifactId = computed(() => props.artifactId);
const resolvedArtifactKind = computed<MarkdownArtifactKind>(() => props.artifactKind);
const resolvedLabel = computed(() => props.label);
const resolvedHref = computed(() => props.href);
</script>

<template>
  <section class="agentdown-artifact-block">
    <div class="agentdown-artifact-head">
      <div class="agentdown-artifact-copy">
        <span class="agentdown-artifact-eyebrow">Artifact</span>
        <strong>{{ resolvedTitle }}</strong>
      </div>
      <span class="agentdown-artifact-kind">{{ resolvedArtifactKind }}</span>
    </div>

    <p
      v-if="resolvedMessage"
      class="agentdown-artifact-message"
    >
      {{ resolvedMessage }}
    </p>

    <dl
      v-if="resolvedLabel || resolvedArtifactId"
      class="agentdown-artifact-meta"
    >
      <div v-if="resolvedLabel">
        <dt>Label</dt>
        <dd>{{ resolvedLabel }}</dd>
      </div>

      <div v-if="resolvedArtifactId">
        <dt>ID</dt>
        <dd>{{ resolvedArtifactId }}</dd>
      </div>
    </dl>

    <a
      v-if="resolvedHref"
      class="agentdown-artifact-link"
      :href="resolvedHref"
      target="_blank"
      rel="noreferrer"
    >
      Open artifact
    </a>
  </section>
</template>

<style scoped>
.agentdown-artifact-block {
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
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 36%),
    var(--agentdown-elevated-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-artifact-head,
.agentdown-artifact-meta,
.agentdown-artifact-meta div {
  display: flex;
  align-items: center;
}

.agentdown-artifact-head {
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-artifact-copy {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.agentdown-artifact-copy strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-artifact-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-artifact-kind {
  border-radius: 999px;
  padding: 0.3rem 0.66rem;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  font-size: 0.79rem;
  font-weight: 600;
  text-transform: capitalize;
}

.agentdown-artifact-message {
  margin: 0;
  color: var(--agentdown-text-color);
  line-height: 1.7;
}

.agentdown-artifact-meta {
  flex-wrap: wrap;
  gap: 0.9rem;
}

.agentdown-artifact-meta div {
  gap: 0.42rem;
}

.agentdown-artifact-meta dt {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-artifact-meta dd {
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

.agentdown-artifact-link {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  padding: 0.52rem 0.84rem;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
}

.agentdown-artifact-link:hover {
  background: #dbeafe;
}
</style>
