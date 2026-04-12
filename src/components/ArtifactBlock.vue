<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MarkdownArtifactKind } from '../core/types';
import FilePreviewOverlay from './FilePreviewOverlay.vue';
import PreviewLightbox from './PreviewLightbox.vue';
import { resolveArtifactFileCardPresentation } from './fileCardPresentation';
import { loadFileCardPreviewText, resolveFileCardPreviewTarget } from './fileCardPreview';

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
const presentation = computed(() => {
  return resolveArtifactFileCardPresentation({
    artifactKind: props.artifactKind,
    ...(props.label ? { label: props.label } : {}),
    ...(props.title ? { title: props.title } : {})
  });
});
const previewTarget = computed(() => {
  return resolveFileCardPreviewTarget({
    kind: props.artifactKind,
    ...(props.href ? { href: props.href } : {}),
    ...(props.label ? { label: props.label } : {}),
    ...(props.title ? { title: props.title } : {})
  });
});
const resolvedTag = computed(() => {
  if (previewTarget.value.mode) {
    return 'button';
  }

  return props.href ? 'a' : 'section';
});
const resolvedLinkAttrs = computed(() => {
  if (resolvedTag.value === 'button') {
    return {
      type: 'button'
    };
  }

  if (!props.href) {
    return {};
  }

  return {
    href: props.href,
    target: '_blank',
    rel: 'noreferrer'
  };
});

const imagePreviewOpen = ref(false);
const imagePreviewZoom = ref(1);
const filePreviewOpen = ref(false);
const filePreviewLoading = ref(false);
const filePreviewError = ref('');
const filePreviewText = ref('');
const filePreviewMode = ref<'iframe' | 'text'>('iframe');
const IMAGE_ZOOM_MIN = 0.75;
const IMAGE_ZOOM_MAX = 3;
const IMAGE_ZOOM_STEP = 0.2;

async function openCardPreview() {
  const target = previewTarget.value;

  if (!target.mode) {
    return;
  }

  if (target.mode === 'image') {
    imagePreviewZoom.value = 1;
    imagePreviewOpen.value = true;
    return;
  }

  filePreviewMode.value = target.mode;
  filePreviewError.value = '';
  filePreviewText.value = '';
  filePreviewOpen.value = true;

  if (target.mode === 'iframe') {
    filePreviewLoading.value = false;
    return;
  }

  if (!target.src) {
    filePreviewLoading.value = false;
    filePreviewError.value = '当前文件缺少可预览地址。';
    return;
  }

  filePreviewLoading.value = true;

  try {
    filePreviewText.value = await loadFileCardPreviewText(target.src);
  } catch (error) {
    filePreviewError.value = error instanceof Error ? error.message : '读取文件内容失败。';
  } finally {
    filePreviewLoading.value = false;
  }
}

function handleCardClick(event: MouseEvent) {
  if (!previewTarget.value.mode) {
    return;
  }

  event.preventDefault();
  void openCardPreview();
}

function closeImagePreview() {
  imagePreviewOpen.value = false;
  imagePreviewZoom.value = 1;
}

function zoomImageIn() {
  imagePreviewZoom.value = Math.min(IMAGE_ZOOM_MAX, imagePreviewZoom.value + IMAGE_ZOOM_STEP);
}

function zoomImageOut() {
  imagePreviewZoom.value = Math.max(IMAGE_ZOOM_MIN, imagePreviewZoom.value - IMAGE_ZOOM_STEP);
}

function resetImageZoom() {
  imagePreviewZoom.value = 1;
}

function closeFilePreview() {
  filePreviewOpen.value = false;
  filePreviewLoading.value = false;
  filePreviewError.value = '';
  filePreviewText.value = '';
}
</script>

<template>
  <component
    :is="resolvedTag"
    class="agentdown-artifact-block"
    :data-tone="presentation.iconTone"
    v-bind="resolvedLinkAttrs"
    @click="handleCardClick"
  >
    <div class="agentdown-artifact-visual">
      <svg
        class="agentdown-artifact-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="presentation.iconPath" />
      </svg>
    </div>

    <div class="agentdown-artifact-copy">
      <strong :title="presentation.title">{{ presentation.title }}</strong>
      <span class="agentdown-artifact-meta">{{ presentation.metaText }}</span>
      <span
        v-if="message && artifactKind === 'image'"
        class="agentdown-artifact-description"
      >
        {{ message }}
      </span>
    </div>
  </component>

  <PreviewLightbox
    :open="imagePreviewOpen"
    :title="presentation.title"
    :image-src="previewTarget.src || ''"
    :image-alt="presentation.title"
    :zoom="imagePreviewZoom"
    :can-zoom-in="imagePreviewZoom < IMAGE_ZOOM_MAX"
    :can-zoom-out="imagePreviewZoom > IMAGE_ZOOM_MIN"
    @close="closeImagePreview"
    @zoom-in="zoomImageIn"
    @zoom-out="zoomImageOut"
    @reset="resetImageZoom"
  />

  <FilePreviewOverlay
    :open="filePreviewOpen"
    :title="presentation.title"
    :subtitle="previewTarget.subtitle || ''"
    :mode="filePreviewMode"
    :src="previewTarget.src || ''"
    :text="filePreviewText"
    :loading="filePreviewLoading"
    :error="filePreviewError"
    :external-href="previewTarget.externalHref || ''"
    @close="closeFilePreview"
  />
</template>

<style scoped>
.agentdown-artifact-block {
  display: inline-flex;
  align-items: center;
  gap: 0.92rem;
  width: min(100%, 35rem);
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  appearance: none;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 1.45rem;
  padding: 1rem 1.1rem;
  background: #fff;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.agentdown-artifact-block[href] {
  cursor: pointer;
}

.agentdown-artifact-block[type='button'] {
  cursor: pointer;
}

.agentdown-artifact-block[href]:hover {
  border-color: rgba(100, 116, 139, 0.34);
  background: #fcfcfd;
}

.agentdown-artifact-visual {
  display: inline-flex;
  width: 3.2rem;
  height: 3.2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.95rem;
  background: #d1d5db;
  color: #fff;
}

.agentdown-artifact-block[data-tone='blue'] .agentdown-artifact-visual {
  background: linear-gradient(180deg, #5f90f7, #4b7be2);
}

.agentdown-artifact-block[data-tone='neutral'] .agentdown-artifact-visual {
  background: linear-gradient(180deg, #d1d5db, #b6bcc6);
}

.agentdown-artifact-block[data-tone='amber'] .agentdown-artifact-visual {
  background: linear-gradient(180deg, #f5c16d, #e5a94c);
}

.agentdown-artifact-block[data-tone='rose'] .agentdown-artifact-visual {
  background: linear-gradient(180deg, #ea9d95, #de7c72);
}

.agentdown-artifact-block[data-tone='emerald'] .agentdown-artifact-visual {
  background: linear-gradient(180deg, #6fc7ae, #4cac90);
}

.agentdown-artifact-icon {
  width: 1.72rem;
  height: 1.72rem;
  flex-shrink: 0;
}

.agentdown-artifact-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.18rem;
}

.agentdown-artifact-copy strong {
  overflow: hidden;
  color: #2f343b;
  font-size: 0.98rem;
  font-weight: 520;
  letter-spacing: -0.03em;
  line-height: 1.28;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-artifact-meta,
.agentdown-artifact-description {
  overflow: hidden;
  color: #8b929c;
  font-size: 0.82rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
