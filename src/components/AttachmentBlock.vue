<script setup lang="ts">
import { computed } from 'vue';
import type { MarkdownAttachmentKind } from '../core/types';

/**
 * `AttachmentBlock` 的组件输入参数。
 */
interface Props {
  title: string;
  message?: string;
  attachmentId?: string;
  attachmentKind: MarkdownAttachmentKind;
  label?: string;
  href?: string;
  mimeType?: string;
  sizeText?: string;
  previewSrc?: string;
  status?: string;
  refId?: string;
}

const props = defineProps<Props>();

/**
 * 判断当前附件是否应该显示图片预览。
 */
const shouldRenderPreview = computed(() => {
  return props.attachmentKind === 'image' && typeof props.previewSrc === 'string' && props.previewSrc.length > 0;
});
</script>

<template>
  <section
    class="agentdown-attachment-block"
    :data-kind="attachmentKind"
  >
    <div class="agentdown-attachment-head">
      <div class="agentdown-attachment-copy">
        <span class="agentdown-attachment-eyebrow">Attachment</span>
        <strong>{{ title }}</strong>
      </div>

      <div class="agentdown-attachment-badges">
        <span class="agentdown-attachment-kind">{{ attachmentKind }}</span>
        <span
          v-if="status"
          class="agentdown-attachment-status"
        >
          {{ status }}
        </span>
      </div>
    </div>

    <p
      v-if="message"
      class="agentdown-attachment-message"
    >
      {{ message }}
    </p>

    <img
      v-if="shouldRenderPreview"
      class="agentdown-attachment-preview"
      :src="previewSrc"
      :alt="label || title"
    >

    <dl class="agentdown-attachment-meta">
      <div v-if="label">
        <dt>Label</dt>
        <dd>{{ label }}</dd>
      </div>

      <div v-if="attachmentId">
        <dt>ID</dt>
        <dd>{{ attachmentId }}</dd>
      </div>

      <div v-if="mimeType">
        <dt>MIME</dt>
        <dd>{{ mimeType }}</dd>
      </div>

      <div v-if="sizeText">
        <dt>Size</dt>
        <dd>{{ sizeText }}</dd>
      </div>
    </dl>

    <a
      v-if="href"
      class="agentdown-attachment-link"
      :href="href"
      target="_blank"
      rel="noreferrer"
    >
      打开附件
    </a>
  </section>
</template>

<style scoped>
.agentdown-attachment-block {
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
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 34%),
    var(--agentdown-elevated-surface);
  box-shadow: var(--agentdown-shadow);
}

.agentdown-attachment-head,
.agentdown-attachment-meta,
.agentdown-attachment-meta div,
.agentdown-attachment-badges {
  display: flex;
  align-items: center;
}

.agentdown-attachment-head {
  justify-content: space-between;
  gap: 1rem;
}

.agentdown-attachment-copy {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.agentdown-attachment-copy strong {
  font-size: 1rem;
  letter-spacing: -0.02em;
}

.agentdown-attachment-eyebrow {
  color: var(--agentdown-muted-color);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agentdown-attachment-badges {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.agentdown-attachment-kind,
.agentdown-attachment-status {
  border-radius: 999px;
  padding: 0.3rem 0.66rem;
  font-size: 0.79rem;
  font-weight: 600;
}

.agentdown-attachment-kind {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  text-transform: capitalize;
}

.agentdown-attachment-status {
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
}

.agentdown-attachment-message {
  margin: 0;
  color: var(--agentdown-text-color);
  line-height: 1.7;
}

.agentdown-attachment-preview {
  display: block;
  max-width: min(100%, 360px);
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: #fff;
}

.agentdown-attachment-meta {
  flex-wrap: wrap;
  gap: 0.9rem;
}

.agentdown-attachment-meta div {
  gap: 0.42rem;
}

.agentdown-attachment-meta dt {
  color: var(--agentdown-muted-color);
  font-size: 0.8rem;
}

.agentdown-attachment-meta dd {
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

.agentdown-attachment-link {
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

.agentdown-attachment-link:hover {
  background: #dbeafe;
}
</style>
