<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MarkdownAttachmentKind } from '../core/types';
import { resolveAttachmentFileCardPresentation } from './fileCardPresentation';
import FilePreviewOverlay from './FilePreviewOverlay.vue';
import PreviewLightbox from './PreviewLightbox.vue';
import { loadFileCardPreviewText, resolveFileCardPreviewTarget } from './fileCardPreview';

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
 * 图片附件在文件卡布局中使用左侧缩略图。
 */
const shouldRenderThumbnail = computed(() => {
  return props.attachmentKind === 'image' && typeof props.previewSrc === 'string' && props.previewSrc.length > 0;
});

/**
 * 附件统一收口成“文件条目卡”的展示数据。
 */
const presentation = computed(() => {
  return resolveAttachmentFileCardPresentation({
    attachmentKind: props.attachmentKind,
    ...(props.label ? { label: props.label } : {}),
    ...(props.title ? { title: props.title } : {}),
    ...(props.mimeType ? { mimeType: props.mimeType } : {}),
    ...(props.sizeText ? { sizeText: props.sizeText } : {})
  });
});

const previewTarget = computed(() => {
  return resolveFileCardPreviewTarget({
    kind: props.attachmentKind,
    ...(props.href ? { href: props.href } : {}),
    ...(props.previewSrc ? { previewSrc: props.previewSrc } : {}),
    ...(props.mimeType ? { mimeType: props.mimeType } : {}),
    ...(props.label ? { label: props.label } : {}),
    ...(props.title ? { title: props.title } : {})
  });
});

const resolvedHref = computed(() => {
  if (props.href) {
    return props.href;
  }

  if (props.attachmentKind === 'image' && props.previewSrc) {
    return props.previewSrc;
  }

  return '';
});

const resolvedTag = computed(() => {
  if (previewTarget.value.mode) {
    return 'button';
  }

  return resolvedHref.value ? 'a' : 'section';
});

const resolvedLinkAttrs = computed(() => {
  if (resolvedTag.value === 'button') {
    return {
      type: 'button'
    };
  }

  if (!resolvedHref.value) {
    return {};
  }

  return {
    href: resolvedHref.value,
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
    class="agentdown-attachment-block"
    :data-kind="attachmentKind"
    :data-tone="presentation.iconTone"
    v-bind="resolvedLinkAttrs"
    @click="handleCardClick"
  >
    <div class="agentdown-attachment-visual">
      <img
        v-if="shouldRenderThumbnail"
        class="agentdown-attachment-thumb"
        :src="previewSrc"
        :alt="presentation.title"
      >

      <svg
        v-else
        class="agentdown-attachment-icon"
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

    <div class="agentdown-attachment-copy">
      <strong :title="presentation.title">{{ presentation.title }}</strong>
      <span class="agentdown-attachment-meta">{{ presentation.metaText }}</span>
      <span
        v-if="message && !sizeText"
        class="agentdown-attachment-description"
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
.agentdown-attachment-block {
  display: inline-flex;
  align-items: center;
  gap: 0.72rem;
  width: min(100%, 30rem);
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  appearance: none;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 1.2rem;
  padding: 0.78rem 0.88rem;
  background: #fff;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;
}

.agentdown-attachment-block[href] {
  cursor: pointer;
}

.agentdown-attachment-block[type='button'] {
  cursor: pointer;
}

.agentdown-attachment-block[href]:hover {
  border-color: rgba(100, 116, 139, 0.34);
  background: #fcfcfd;
}

.agentdown-attachment-visual {
  display: inline-flex;
  width: 2.7rem;
  height: 2.7rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.82rem;
  background: #d1d5db;
  color: #fff;
}

.agentdown-attachment-block[data-tone='blue'] .agentdown-attachment-visual {
  background: linear-gradient(180deg, #5f90f7, #4b7be2);
}

.agentdown-attachment-block[data-tone='neutral'] .agentdown-attachment-visual {
  background: linear-gradient(180deg, #d1d5db, #b6bcc6);
}

.agentdown-attachment-block[data-tone='amber'] .agentdown-attachment-visual {
  background: linear-gradient(180deg, #f5c16d, #e5a94c);
}

.agentdown-attachment-block[data-tone='rose'] .agentdown-attachment-visual {
  background: linear-gradient(180deg, #ea9d95, #de7c72);
}

.agentdown-attachment-block[data-tone='emerald'] .agentdown-attachment-visual {
  background: linear-gradient(180deg, #6fc7ae, #4cac90);
}

.agentdown-attachment-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agentdown-attachment-icon {
  width: 1.42rem;
  height: 1.42rem;
  flex-shrink: 0;
}

.agentdown-attachment-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.12rem;
}

.agentdown-attachment-copy strong {
  overflow: hidden;
  color: #2f343b;
  font-size: 0.88rem;
  font-weight: 520;
  letter-spacing: -0.03em;
  line-height: 1.28;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agentdown-attachment-meta,
.agentdown-attachment-description {
  overflow: hidden;
  color: #8b929c;
  font-size: 0.75rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
