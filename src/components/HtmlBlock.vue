<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import PreviewLightbox from './PreviewLightbox.vue';

interface Props {
  html: string;
}

const props = defineProps<Props>();
const containerRef = ref<HTMLDivElement | null>(null);
const previewImageSrc = ref('');
const previewImageAlt = ref('');
const previewImageTitle = ref('');
const imagePreviewOpen = ref(false);
const imagePreviewZoom = ref(1);

const IMAGE_ZOOM_MIN = 0.75;
const IMAGE_ZOOM_MAX = 3;
const IMAGE_ZOOM_STEP = 0.2;

/** 为图片补齐懒加载属性，并把单图段落提升成 figure。 */
function enhanceImages(container: HTMLDivElement): void {
  const images = Array.from(container.querySelectorAll('img'));

  for (const image of images) {
    image.loading = 'lazy';
    image.decoding = 'async';
    image.dataset.previewable = 'true';
  }

  const paragraphs = Array.from(container.querySelectorAll('p'));

  for (const paragraph of paragraphs) {
    const onlyElement = paragraph.children.length === 1 ? paragraph.firstElementChild : null;
    const hasTextSibling = Array.from(paragraph.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    );

    if (!(onlyElement instanceof HTMLImageElement) || hasTextSibling) {
      continue;
    }

    const figure = document.createElement('figure');
    figure.className = 'agentdown-html-figure';
    paragraph.parentNode?.insertBefore(figure, paragraph);
    figure.appendChild(onlyElement);

    const captionText = onlyElement.getAttribute('title') || onlyElement.getAttribute('alt') || '';

    if (captionText) {
      const caption = document.createElement('figcaption');
      caption.textContent = captionText;
      figure.appendChild(caption);
    }

    paragraph.remove();
  }
}

/** 点击 markdown 图片时进入预览，而不是只停留在缩略图。 */
function handleHtmlClick(event: MouseEvent): void {
  const target = event.target;

  if (!(target instanceof HTMLImageElement) || target.dataset.previewable !== 'true') {
    return;
  }

  event.preventDefault();
  previewImageSrc.value = target.currentSrc || target.src;
  previewImageAlt.value = target.alt || '';
  previewImageTitle.value = target.title || target.alt || '图片预览';
  imagePreviewZoom.value = 1;
  imagePreviewOpen.value = true;
}

function closeImagePreview(): void {
  imagePreviewOpen.value = false;
  imagePreviewZoom.value = 1;
}

function zoomImageIn(): void {
  imagePreviewZoom.value = Math.min(IMAGE_ZOOM_MAX, imagePreviewZoom.value + IMAGE_ZOOM_STEP);
}

function zoomImageOut(): void {
  imagePreviewZoom.value = Math.max(IMAGE_ZOOM_MIN, imagePreviewZoom.value - IMAGE_ZOOM_STEP);
}

function resetImageZoom(): void {
  imagePreviewZoom.value = 1;
}

/** 为宽表格增加横向滚动容器，避免把整页挤坏。 */
function enhanceTables(container: HTMLDivElement): void {
  const tables = Array.from(container.querySelectorAll('table'));

  for (const table of tables) {
    if (table.parentElement?.classList.contains('agentdown-html-table-wrap')) {
      continue;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'agentdown-html-table-wrap';
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  for (const table of tables) {
    const wrapper = table.parentElement;

    if (!(wrapper instanceof HTMLDivElement)) {
      continue;
    }

    const rowCount = table.querySelectorAll('tbody tr').length || table.querySelectorAll('tr').length;
    const columnCount = table.querySelector('tr')?.children.length ?? 0;
    const shouldClampHeight = rowCount >= 8;
    const shouldForceScroll = shouldClampHeight || columnCount >= 8;

    wrapper.dataset.large = shouldForceScroll ? 'true' : 'false';
    wrapper.dataset.rows = String(rowCount);
    wrapper.dataset.columns = String(columnCount);
  }
}

/** 外链默认新开窗口，避免 demo 或文档页直接跳走。 */
function enhanceLinks(container: HTMLDivElement): void {
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));

  for (const link of links) {
    if (!/^https?:\/\//i.test(link.href)) {
      continue;
    }

    link.target = '_blank';
    link.rel = 'noreferrer noopener';
  }
}

/** 每次 HTML 内容变化后做一次轻量增强处理。 */
function enhanceHtmlBlock(): void {
  const container = containerRef.value;

  if (!container) {
    return;
  }

  enhanceImages(container);
  enhanceTables(container);
  enhanceLinks(container);
}

onMounted(() => {
  enhanceHtmlBlock();
});

watch(
  () => props.html,
  async () => {
    await nextTick();
    enhanceHtmlBlock();
  },
  {
    flush: 'post'
  }
);
</script>

<template>
  <div
    ref="containerRef"
    class="agentdown-html-block"
    v-html="html"
    @click="handleHtmlClick"
  />

  <PreviewLightbox
    :open="imagePreviewOpen"
    :title="previewImageTitle"
    :image-src="previewImageSrc"
    :image-alt="previewImageAlt"
    :zoom="imagePreviewZoom"
    :can-zoom-in="imagePreviewZoom < IMAGE_ZOOM_MAX"
    :can-zoom-out="imagePreviewZoom > IMAGE_ZOOM_MIN"
    @close="closeImagePreview"
    @zoom-in="zoomImageIn"
    @zoom-out="zoomImageOut"
    @reset="resetImageZoom"
  />
</template>
