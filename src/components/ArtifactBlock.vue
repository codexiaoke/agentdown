<script setup lang="ts">
import { computed, inject } from 'vue';
import { AGUI_RUNTIME_KEY } from '../core/aguiRuntime';
import type { AguiRuntimeEvent, MarkdownArtifactKind } from '../core/types';

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
const runtime = inject(AGUI_RUNTIME_KEY, null);

type ArtifactEvent = AguiRuntimeEvent & {
  artifactId?: string;
  artifactKind?: MarkdownArtifactKind;
  label?: string;
  href?: string;
};

const binding = computed(() => (props.refId && runtime ? runtime.binding(props.refId) : null));
const state = computed(() => binding.value?.stateRef.value as { title?: string; message?: string; meta?: Record<string, unknown> } | null);
const events = computed(() => binding.value?.eventsRef.value ?? []);

function readStateMeta(key: string): string | undefined {
  const value = state.value?.meta?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const latestArtifactEvent = computed<ArtifactEvent | undefined>(() =>
  [...events.value].reverse().find(event => event.type === 'artifact.created') as ArtifactEvent | undefined
);

const resolvedTitle = computed(() => state.value?.title ?? props.title);
const resolvedMessage = computed(() => state.value?.message ?? latestArtifactEvent.value?.message ?? props.message);
const resolvedArtifactId = computed(() => latestArtifactEvent.value?.artifactId ?? readStateMeta('artifactId') ?? props.artifactId);
const resolvedArtifactKind = computed<MarkdownArtifactKind>(
  () => latestArtifactEvent.value?.artifactKind ?? (readStateMeta('artifactKind') as MarkdownArtifactKind | undefined) ?? props.artifactKind
);
const resolvedLabel = computed(() => latestArtifactEvent.value?.label ?? readStateMeta('label') ?? props.label);
const resolvedHref = computed(() => latestArtifactEvent.value?.href ?? readStateMeta('href') ?? props.href);
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
