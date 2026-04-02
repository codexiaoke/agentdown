<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PreviewLightbox from './PreviewLightbox.vue';

let isMermaidInitialized = false;
let mermaidRenderCount = 0;

interface Props {
  code: string;
}

const props = defineProps<Props>();
const containerRef = ref<HTMLDivElement | null>(null);
const svg = ref('');
const errorMessage = ref('');
const previewOpen = ref(false);
const previewZoom = ref(1);
let activeRenderToken = 0;

const MERMAID_ZOOM_MIN = 0.5;
const MERMAID_ZOOM_MAX = 2.5;
const MERMAID_ZOOM_STEP = 0.15;

/** Mermaid 运行时只需要初始化一次，避免重复覆盖全局配置。 */
async function ensureMermaidRuntime() {
  const mermaid = (await import('mermaid')).default;

  if (!isMermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        background: '#fafafa',
        primaryColor: '#ffffff',
        primaryTextColor: '#111827',
        primaryBorderColor: '#d1d5db',
        lineColor: '#9ca3af',
        tertiaryColor: '#f8fafc',
        fontFamily: 'Avenir Next, SF Pro Text, PingFang SC, sans-serif'
      }
    });
    isMermaidInitialized = true;
  }

  return mermaid;
}

/** 把 mermaid 源码渲染成 svg，并在最新一次请求上落盘。 */
async function renderMermaidDiagram() {
  const source = props.code.trim();
  const renderToken = activeRenderToken + 1;
  activeRenderToken = renderToken;

  if (!source) {
    svg.value = '';
    errorMessage.value = '';
    return;
  }

  try {
    const mermaid = await ensureMermaidRuntime();
    const renderId = `agentdown-mermaid-${(mermaidRenderCount += 1)}`;
    const { svg: nextSvg, bindFunctions } = await mermaid.render(renderId, source);

    if (renderToken !== activeRenderToken) {
      return;
    }

    svg.value = nextSvg;
    errorMessage.value = '';
    await nextTick();

    const container = containerRef.value;

    if (container) {
      bindFunctions?.(container);
    }
  } catch (error) {
    if (renderToken !== activeRenderToken) {
      return;
    }

    svg.value = '';
    errorMessage.value = error instanceof Error ? error.message : 'Mermaid 图表渲染失败。';
  }
}

watch(
  () => props.code,
  () => {
    void renderMermaidDiagram();
  }
);

onMounted(() => {
  void renderMermaidDiagram();
});

onBeforeUnmount(() => {
  activeRenderToken += 1;
});

function openPreview() {
  if (!svg.value) {
    return;
  }

  previewOpen.value = true;
  previewZoom.value = 1;
}

function closePreview() {
  previewOpen.value = false;
  previewZoom.value = 1;
}

function zoomIn() {
  previewZoom.value = Math.min(MERMAID_ZOOM_MAX, previewZoom.value + MERMAID_ZOOM_STEP);
}

function zoomOut() {
  previewZoom.value = Math.max(MERMAID_ZOOM_MIN, previewZoom.value - MERMAID_ZOOM_STEP);
}

function resetZoom() {
  previewZoom.value = 1;
}
</script>

<template>
  <figure class="agentdown-mermaid-block">
    <button
      v-if="svg"
      type="button"
      class="agentdown-mermaid-preview-button"
      aria-label="全屏查看图表"
      title="全屏查看图表"
      @click="openPreview"
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M6 2.75H3.75v2.5M10 2.75h2.25v2.5M6 13.25H3.75v-2.5M10 13.25h2.25v-2.5"
          stroke="currentColor"
          stroke-width="1.35"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div
      v-if="svg"
      ref="containerRef"
      class="agentdown-mermaid-canvas"
      v-html="svg"
      @click="openPreview"
    />

    <figcaption
      v-else-if="errorMessage"
      class="agentdown-mermaid-error"
    >
      <strong>Mermaid 渲染失败</strong>
      <pre>{{ errorMessage }}</pre>
    </figcaption>
  </figure>

  <PreviewLightbox
    :open="previewOpen"
    title="Mermaid 图表"
    :svg="svg"
    :zoom="previewZoom"
    :can-zoom-in="previewZoom < MERMAID_ZOOM_MAX"
    :can-zoom-out="previewZoom > MERMAID_ZOOM_MIN"
    @close="closePreview"
    @zoom-in="zoomIn"
    @zoom-out="zoomOut"
    @reset="resetZoom"
  />
</template>
