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
        class="agentdown-artifact-file-icon"
        viewBox="0 0 44 52"
        fill="none"
        aria-hidden="true"
      >
        <path
          class="agentdown-artifact-file-icon__page"
          d="M9 2h17.2L38 13.8V47a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z"
          fill="currentColor"
        />
        <path
          class="agentdown-artifact-file-icon__fold"
          d="M26.2 2v9a2.8 2.8 0 0 0 2.8 2.8H38z"
          fill="rgba(255,255,255,0.34)"
        />
        <text
          class="agentdown-artifact-file-icon__label"
          x="22"
          y="36"
          text-anchor="middle"
          dominant-baseline="middle"
          :data-size="presentation.iconLabelSize"
        >
          {{ presentation.iconLabel }}
        </text>
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
  gap: 0.68rem;
  width: fit-content;
  max-width: min(100%, 24rem);
  min-width: 0;
  box-sizing: border-box;
  appearance: none;
  border: none;
  border-radius: 0.9rem;
  padding: 0.76rem 0.84rem;
  background: #f4f4f5;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  transition:
    background-color 160ms ease;
}

.agentdown-artifact-block[href] {
  cursor: pointer;
}

.agentdown-artifact-block[type='button'] {
  cursor: pointer;
}

.agentdown-artifact-block[href]:hover,
.agentdown-artifact-block[type='button']:hover {
  background: #efeff1;
}

.agentdown-artifact-visual {
  display: inline-flex;
  width: 2.55rem;
  height: 2.55rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.agentdown-artifact-block[data-tone='blue'] .agentdown-artifact-visual {
  color: #4f7df0;
}

.agentdown-artifact-block[data-tone='neutral'] .agentdown-artifact-visual {
  color: #9ca3af;
}

.agentdown-artifact-block[data-tone='amber'] .agentdown-artifact-visual {
  color: #f59b4a;
}

.agentdown-artifact-block[data-tone='rose'] .agentdown-artifact-visual {
  color: #ef635a;
}

.agentdown-artifact-block[data-tone='emerald'] .agentdown-artifact-visual {
  color: #4cb96d;
}

.agentdown-artifact-file-icon {
  width: 100%;
  height: 100%;
}

.agentdown-artifact-file-icon__label {
  fill: #ffffff;
  font-family:
    ui-sans-serif,
    -apple-system,
    BlinkMacSystemFont,
    'SF Pro Text',
    'PingFang SC',
    'Helvetica Neue',
    sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.agentdown-artifact-file-icon__label[data-size='md'] {
  font-size: 14px;
}

.agentdown-artifact-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.08rem;
}

.agentdown-artifact-copy strong {
  overflow: hidden;
  color: #111827;
  font-size: 0.84rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-artifact-meta,
.agentdown-artifact-description {
  overflow: hidden;
  color: #8b8d96;
  font-size: 0.7rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
