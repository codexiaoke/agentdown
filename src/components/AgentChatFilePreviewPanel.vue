<script setup lang="ts">
import MarkdownRenderer from './MarkdownRenderer.vue';
import type { FileCardPreviewContentKind, FileCardPreviewMode } from './fileCardPreview';

interface Props {
  title?: string;
  subtitle?: string;
  mode?: FileCardPreviewMode;
  contentKind?: FileCardPreviewContentKind;
  src?: string;
  text?: string;
  loading?: boolean;
  error?: string;
  externalHref?: string;
  dismissible?: boolean;
}

withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  mode: null,
  contentKind: 'plain',
  src: '',
  text: '',
  loading: false,
  error: '',
  externalHref: '',
  dismissible: false
});

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="agentdown-chat-file-preview-panel">
    <div class="agentdown-chat-file-preview-panel__meta">
      <div class="agentdown-chat-file-preview-panel__copy">
        <strong>{{ title || '文件预览' }}</strong>
        <span>{{ subtitle || '在线预览' }}</span>
      </div>

      <div class="agentdown-chat-file-preview-panel__actions">
        <a
          v-if="externalHref"
          class="agentdown-chat-file-preview-panel__open-link"
          :href="externalHref"
          target="_blank"
          rel="noreferrer"
        >
          新窗口打开
        </a>

        <button
          v-if="dismissible"
          type="button"
          class="agentdown-chat-file-preview-panel__close"
          title="关闭预览"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="agentdown-chat-file-preview-panel__stage">
      <div
        v-if="loading"
        class="agentdown-chat-file-preview-panel__empty"
      >
        正在加载预览...
      </div>

      <div
        v-else-if="error"
        class="agentdown-chat-file-preview-panel__empty agentdown-chat-file-preview-panel__empty--error"
      >
        <strong>预览失败</strong>
        <p>{{ error }}</p>
      </div>

      <div
        v-else-if="mode === 'image' && src"
        class="agentdown-chat-file-preview-panel__image-wrap"
      >
        <img
          class="agentdown-chat-file-preview-panel__image"
          :src="src"
          :alt="title || '图片预览'"
        >
      </div>

      <iframe
        v-else-if="mode === 'iframe' && src"
        class="agentdown-chat-file-preview-panel__frame"
        :src="src"
        title="文件在线预览"
      />

      <div
        v-else-if="mode === 'text' && contentKind === 'markdown'"
        class="agentdown-chat-file-preview-panel__markdown"
      >
        <MarkdownRenderer
          :source="text"
          :performance="{
            virtualize: false,
            textSlabChars: 1400
          }"
        />
      </div>

      <pre
        v-else-if="mode === 'text'"
        class="agentdown-chat-file-preview-panel__text"
      ><code>{{ text }}</code></pre>

      <div
        v-else
        class="agentdown-chat-file-preview-panel__empty"
      >
        当前文件暂不支持在线预览。
      </div>
    </div>
  </div>
</template>

<style scoped>
.agentdown-chat-file-preview-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  box-sizing: border-box;
  overflow: hidden;
}

.agentdown-chat-file-preview-panel__meta {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  gap: 0.9rem;
}

.agentdown-chat-file-preview-panel__actions {
  display: flex;
  margin-left: auto;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
}

.agentdown-chat-file-preview-panel__copy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 0.2rem;
}

.agentdown-chat-file-preview-panel__copy strong {
  overflow: hidden;
  color: #111827;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-chat-file-preview-panel__copy span {
  overflow: hidden;
  color: #6b7280;
  font-size: 0.78rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-chat-file-preview-panel__open-link {
  flex-shrink: 0;
  color: #2563eb;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
}

.agentdown-chat-file-preview-panel__open-link:hover {
  text-decoration: underline;
}

.agentdown-chat-file-preview-panel__close {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
}

.agentdown-chat-file-preview-panel__close:hover {
  background: rgba(15, 23, 42, 0.05);
  color: #111827;
}

.agentdown-chat-file-preview-panel__close svg {
  width: 0.95rem;
  height: 0.95rem;
}

.agentdown-chat-file-preview-panel__stage {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.92);
  overflow: hidden;
}

.agentdown-chat-file-preview-panel__image-wrap,
.agentdown-chat-file-preview-panel__markdown,
.agentdown-chat-file-preview-panel__empty,
.agentdown-chat-file-preview-panel__text {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.agentdown-chat-file-preview-panel__image-wrap,
.agentdown-chat-file-preview-panel__empty {
  align-items: center;
  justify-content: center;
}

.agentdown-chat-file-preview-panel__image-wrap {
  padding: 1rem;
  box-sizing: border-box;
  overflow: auto;
  scrollbar-gutter: stable;
}

.agentdown-chat-file-preview-panel__markdown {
  padding: 1rem;
  box-sizing: border-box;
  overflow: auto;
  scrollbar-gutter: stable;
}

.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-markdown-renderer) {
  width: 100%;
  min-width: 0;
}

.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-root) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
}

.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-block-list),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-block-slot),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-measured-block),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-text-block),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-html-block),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-math-block),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-code-block),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-code-content),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-code-fallback) {
  min-width: 0;
  max-width: 100%;
}

.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-text-line),
.agentdown-chat-file-preview-panel__markdown :deep(p),
.agentdown-chat-file-preview-panel__markdown :deep(li),
.agentdown-chat-file-preview-panel__markdown :deep(blockquote),
.agentdown-chat-file-preview-panel__markdown :deep(h1),
.agentdown-chat-file-preview-panel__markdown :deep(h2),
.agentdown-chat-file-preview-panel__markdown :deep(h3),
.agentdown-chat-file-preview-panel__markdown :deep(h4),
.agentdown-chat-file-preview-panel__markdown :deep(h5),
.agentdown-chat-file-preview-panel__markdown :deep(h6),
.agentdown-chat-file-preview-panel__markdown :deep(td),
.agentdown-chat-file-preview-panel__markdown :deep(th) {
  word-break: break-word;
  overflow-wrap: anywhere;
}

.agentdown-chat-file-preview-panel__markdown :deep(h1) {
  font-size: clamp(1.5rem, 2vw, 1.85rem);
}

.agentdown-chat-file-preview-panel__markdown :deep(h2) {
  font-size: clamp(1.28rem, 1.7vw, 1.55rem);
}

.agentdown-chat-file-preview-panel__markdown :deep(h3) {
  font-size: clamp(1.12rem, 1.35vw, 1.32rem);
}

.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-html-block) {
  overflow-x: auto;
  overflow-y: visible;
}

.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-html-table-wrap),
.agentdown-chat-file-preview-panel__markdown :deep(.agentdown-code-content) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.agentdown-chat-file-preview-panel__markdown :deep(table) {
  min-width: 100%;
  max-width: none;
}

.agentdown-chat-file-preview-panel__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  border-radius: 12px;
  object-fit: contain;
}

.agentdown-chat-file-preview-panel__frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  background: #ffffff;
}

.agentdown-chat-file-preview-panel__text {
  margin: 0;
  padding: 1rem;
  color: #111827;
  font-size: 0.8rem;
  line-height: 1.65;
  box-sizing: border-box;
  overflow: auto;
  scrollbar-gutter: stable;
  white-space: pre-wrap;
  word-break: break-word;
}

.agentdown-chat-file-preview-panel__empty {
  padding: 1.25rem;
  color: #6b7280;
  font-size: 0.84rem;
  text-align: center;
  line-height: 1.6;
  box-sizing: border-box;
}

.agentdown-chat-file-preview-panel__empty--error {
  flex-direction: column;
  gap: 0.4rem;
  color: #b91c1c;
}

.agentdown-chat-file-preview-panel__empty--error strong,
.agentdown-chat-file-preview-panel__empty--error p {
  margin: 0;
}
</style>
